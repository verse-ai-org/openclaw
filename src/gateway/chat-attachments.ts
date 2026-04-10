import { Buffer } from "node:buffer";
import { estimateBase64DecodedBytes } from "../media/base64.js";
import { sniffMimeFromBase64 } from "../media/sniff-mime-from-base64.js";

export type ChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
};

export type ChatImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type ParsedMessageWithImages = {
  message: string;
  images: ChatImageContent[];
};

/** MIME types treated as plain text – content read directly from base64. */
const PLAIN_TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
  "text/html",
]);

/** MIME types for PDF documents. */
const PDF_MIMES = new Set(["application/pdf"]);

/** MIME types for Word documents. */
const WORD_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

/** MIME types for Excel spreadsheets. */
const EXCEL_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

/** Maximum characters of extracted text to include in the message. */
const MAX_EXTRACTED_TEXT_CHARS = 8000;

/**
 * Truncate extracted text to avoid exceeding model context limits.
 */
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + `\n... [内容已截断，原始长度 ${text.length} 字符]`;
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 */
async function extractPdfText(buf: Buffer): Promise<string> {
  // Dynamic import to avoid loading large binary deps at startup.
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buf);
  return result.text?.trim() ?? "";
}

/**
 * Extract text from a Word (.docx/.doc) buffer using mammoth.
 */
async function extractWordText(buf: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value?.trim() ?? "";
}

/**
 * Extract text from an Excel buffer using xlsx.
 */
async function extractExcelText(buf: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      parts.push(`[Sheet: ${sheetName}]\n${csv.trim()}`);
    }
  }
  return parts.join("\n\n");
}

/**
 * Extract text content from a document based on its MIME type.
 * Returns extracted text or a fallback message if extraction fails.
 */
async function extractDocumentText(
  buf: Buffer,
  mime: string,
  label: string,
  log?: AttachmentLog,
): Promise<string> {
  try {
    if (PDF_MIMES.has(mime)) {
      return truncateText(await extractPdfText(buf), MAX_EXTRACTED_TEXT_CHARS);
    }
    if (WORD_MIMES.has(mime)) {
      return truncateText(await extractWordText(buf), MAX_EXTRACTED_TEXT_CHARS);
    }
    if (EXCEL_MIMES.has(mime)) {
      return truncateText(await extractExcelText(buf), MAX_EXTRACTED_TEXT_CHARS);
    }
  } catch (err) {
    log?.warn(`attachment ${label}: text extraction failed (${String(err)})`);
  }
  return "";
}

type AttachmentLog = {
  warn: (message: string) => void;
};

type NormalizedAttachment = {
  label: string;
  mime: string;
  base64: string;
};

function normalizeMime(mime?: string): string | undefined {
  if (!mime) {
    return undefined;
  }
  const cleaned = mime.split(";")[0]?.trim().toLowerCase();
  return cleaned || undefined;
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

function isValidBase64(value: string): boolean {
  // Minimal validation; avoid full decode allocations for large payloads.
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function normalizeAttachment(
  att: ChatAttachment,
  idx: number,
  opts: { stripDataUrlPrefix: boolean; requireImageMime: boolean },
): NormalizedAttachment {
  const mime = att.mimeType ?? "";
  const content = att.content;
  const label = att.fileName || att.type || `attachment-${idx + 1}`;

  if (typeof content !== "string") {
    throw new Error(`attachment ${label}: content must be base64 string`);
  }
  if (opts.requireImageMime && !mime.startsWith("image/")) {
    throw new Error(`attachment ${label}: only image/* supported`);
  }

  let base64 = content.trim();
  if (opts.stripDataUrlPrefix) {
    // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,...").
    const dataUrlMatch = /^data:[^;]+;base64,(.*)$/.exec(base64);
    if (dataUrlMatch) {
      base64 = dataUrlMatch[1];
    }
  }
  return { label, mime, base64 };
}

function validateAttachmentBase64OrThrow(
  normalized: NormalizedAttachment,
  opts: { maxBytes: number },
): number {
  if (!isValidBase64(normalized.base64)) {
    throw new Error(`attachment ${normalized.label}: invalid base64 content`);
  }
  const sizeBytes = estimateBase64DecodedBytes(normalized.base64);
  if (sizeBytes <= 0 || sizeBytes > opts.maxBytes) {
    throw new Error(
      `attachment ${normalized.label}: exceeds size limit (${sizeBytes} > ${opts.maxBytes} bytes)`,
    );
  }
  return sizeBytes;
}

/**
 * Parse attachments and extract content (images + documents).
 *
 * Strategy (hybrid):
 * - Images: passed as base64 image blocks to the AI runner.
 * - Plain text files (txt, md, json, csv, …): decoded and appended inline.
 * - PDF / Word / Excel: text extracted via pdf-parse / mammoth / xlsx and appended.
 *
 * Returns the (possibly augmented) message and image blocks.
 */
export async function parseMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number; log?: AttachmentLog },
): Promise<ParsedMessageWithImages> {
  const maxBytes = opts?.maxBytes ?? 5_000_000; // decoded bytes (5,000,000)
  const log = opts?.log;
  if (!attachments || attachments.length === 0) {
    return { message, images: [] };
  }

  const images: ChatImageContent[] = [];
  // Collected document text blocks to append to the message.
  const docBlocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: true,
      requireImageMime: false, // Allow all file types
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64: b64, label, mime } = normalized;

    const providedMime = normalizeMime(mime);
    if (!providedMime) {
      log?.warn(`attachment ${label}: missing mime type, dropping`);
      continue;
    }

    // ── Images: send as base64 image blocks ────────────────────────────────
    if (providedMime.startsWith("image/")) {
      const sniffedMime = normalizeMime(await sniffMimeFromBase64(b64));
      if (sniffedMime && !isImageMime(sniffedMime)) {
        log?.warn(`attachment ${label}: detected non-image (${sniffedMime}), dropping`);
        continue;
      }
      if (!sniffedMime && !isImageMime(providedMime)) {
        log?.warn(`attachment ${label}: unable to detect image mime type, dropping`);
        continue;
      }
      if (sniffedMime && providedMime && sniffedMime !== providedMime) {
        log?.warn(
          `attachment ${label}: mime mismatch (${providedMime} -> ${sniffedMime}), using sniffed`,
        );
      }
      images.push({
        type: "image",
        data: b64,
        mimeType: sniffedMime ?? providedMime ?? mime,
      });
      continue;
    }

    // ── All document types: decode buffer first ─────────────────────────────
    const buf = Buffer.from(b64, "base64");

    // Plain text files – read content directly
    if (PLAIN_TEXT_MIMES.has(providedMime) || providedMime.startsWith("text/")) {
      const text = truncateText(buf.toString("utf8").trim(), MAX_EXTRACTED_TEXT_CHARS);
      if (text) {
        docBlocks.push(`[文件: ${label}]\n${text}`);
      } else {
        log?.warn(`attachment ${label}: plain text file is empty`);
      }
      continue;
    }

    // PDF / Word / Excel – extract text
    if (PDF_MIMES.has(providedMime) || WORD_MIMES.has(providedMime) || EXCEL_MIMES.has(providedMime)) {
      const text = await extractDocumentText(buf, providedMime, label, log);
      if (text) {
        docBlocks.push(`[文件: ${label}]\n${text}`);
      } else {
        // Extraction failed or empty – still mention the file so the AI knows.
        docBlocks.push(`[文件: ${label} (${providedMime}) — 内容提取失败，文件已接收但无法读取文本内容]`);
      }
      continue;
    }

    // Unknown document type – inform the AI of the file name/type
    log?.warn(`attachment ${label}: unsupported document type (${providedMime}), adding file info only`);
    docBlocks.push(`[文件: ${label} (${providedMime}) — 已接收，不支持内容提取]`);
  }

  // Append document text blocks to the message
  let finalMessage = message;
  if (docBlocks.length > 0) {
    const separator = finalMessage.trim().length > 0 ? "\n\n" : "";
    finalMessage = `${finalMessage}${separator}以下是上传文件的内容：\n\n${docBlocks.join("\n\n")}`;
  }

  return { message: finalMessage, images };
}

/**
 * @deprecated Use parseMessageWithAttachments instead.
 * This function converts images to markdown data URLs which Claude API cannot process as images.
 */
export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? 2_000_000; // 2 MB
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const blocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: false,
      requireImageMime: true,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64, label, mime } = normalized;

    const safeLabel = label.replace(/\s+/g, "_");
    const dataUrl = `![${safeLabel}](data:${mime};base64,${base64})`;
    blocks.push(dataUrl);
  }

  if (blocks.length === 0) {
    return message;
  }
  const separator = message.trim().length > 0 ? "\n\n" : "";
  return `${message}${separator}${blocks.join("\n\n")}`;
}
