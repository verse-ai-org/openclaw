/**
 * profile.parse — Gateway handler for the Profile feature (Free Input mode).
 *
 * Accepts user-provided text, URLs, and/or files, fetches URL content,
 * parses file contents, then uses the gateway's default AI model to
 * extract structured USER.md content and supplementary MEMORY.md content.
 */
import { completeSimple } from "@earendil-works/pi-ai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { getApiKeyForModel, requireApiKey } from "../../agents/model-auth.js";
import { resolveModel } from "../../agents/pi-embedded-runner/model.js";
import { resolveDefaultModelRef } from "../../agents/tools/model-config.helpers.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const URL_FETCH_TIMEOUT_MS = 15_000;
const AI_TIMEOUT_MS = 60_000;

/** Default upload configuration */
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_FILE_COUNT = 5;

/** Supported file types for parsing */
const SUPPORTED_EXTENSIONS = new Set([".md", ".doc", ".docx", ".pdf"]);

/** File content from frontend */
type FileContent = {
  name: string;
  content: string; // base64 encoded
  mimeType?: string;
};

/** Get file extension from filename */
function getFileExtension(filename: string): string {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : "";
}

/** Check if file type is supported */
function isSupportedFileType(filename: string): boolean {
  const ext = getFileExtension(filename);
  return SUPPORTED_EXTENSIONS.has(ext);
}

/** Parse file content based on file type */
async function parseFileContent(file: FileContent): Promise<string | null> {
  try {
    const ext = getFileExtension(file.name);
    const buffer = Buffer.from(file.content, "base64");

    switch (ext) {
      case ".md":
        // Markdown files: directly decode as UTF-8
        return buffer.toString("utf-8");

      case ".doc":
      case ".docx": {
        // Word documents: use mammoth to extract text
        const result = await mammoth.extractRawText({ buffer });
        return result.value || null;
      }

      case ".pdf": {
        // PDF files: use pdf-parse to extract text
        const result = await pdfParse(buffer);
        return result.text || null;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Get upload configuration from config */
function getUploadConfig(cfg: ReturnType<typeof loadConfig>) {
  return {
    maxFileSize: cfg.profile?.upload?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
    maxFileCount: cfg.profile?.upload?.maxFileCount ?? DEFAULT_MAX_FILE_COUNT,
  };
}

/** Try to fetch a URL and return its text body. Returns null on failure. */
async function fetchUrlText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OpenClaw-ProfileFetcher/1.0)",
        },
      });
      if (!res.ok) {
        return null;
      }
      const text = await res.text();
      // Strip HTML tags and collapse whitespace for cleaner AI input
      const stripped = text
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return stripped.slice(0, 4000) || null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are a profile extraction assistant for OpenClaw.
Given user-provided text and/or content fetched from URLs, extract and classify information into two distinct sections:

## 1. USER.md — Structured Profile Data
Extract ONLY concrete, factual profile information in a structured Markdown list format:
- **Name**: The person's name (if clearly stated)
- **Role**: Primary profession or job title
- **Domains**: Specific areas of expertise or focus (comma-separated)
- **Tools**: Specific software, platforms, or tools mentioned
- **Preferences**: Explicitly stated work style or communication preferences

Rules for USER.md:
- Only include factual, explicitly stated information
- Use clear Markdown bullet format: "- **Field**: Value"
- If a field cannot be determined, omit it entirely
- Keep values concise and specific

## 2. MEMORY.md — Contextual Background & Narrative
Extract background context, narrative details, and supplementary information that doesn't fit the structured format. This includes:
- Career history and trajectory
- Notable projects or achievements
- Work philosophy or approach
- Personal motivations or interests
- Relationships, collaborations, or team context
- Soft skills demonstrated in the content
- Any interesting details that enrich the profile

Rules for MEMORY.md:
- Write in well-formatted Markdown with proper headings and structure
- Use ## for main sections, ### for subsections
- Include timestamps or dates when available (e.g., "Since 2020", "2023-present")
- Organize content logically with clear headings
- Use bullet points for lists within sections
- Maintain a professional, narrative tone
- DO NOT repeat information already captured in USER.md
- If there's no narrative content worth preserving, return an empty MEMORY_MD section

## Classification Guidelines
When deciding where information belongs:
- USER.md = Facts that can be listed (name, role, tools, domains)
- MEMORY.md = Context, stories, background, narrative details

When in doubt, prefer MEMORY.md for rich context over USER.md for dry facts.

## Response Format
Respond in EXACTLY this format (no preamble, no extra text):
<USER_MD>
- **Name**: [name or omit if unknown]
- **Role**: [role or omit if unknown]
- **Domains**: [domain1, domain2, ... or omit if unknown]
- **Tools**: [tool1, tool2, ... or omit if unknown]
- **Preferences**: [preference1, preference2, ... or omit if unknown]
</USER_MD>
<MEMORY_MD>
[Well-formatted Markdown with headings and structure, or empty if no narrative content]
</MEMORY_MD>`;

function buildUserPrompt(params: {
  text?: string;
  urlContents: Array<{ url: string; body: string }>;
  fileContents: Array<{ name: string; body: string }>;
}): string {
  const parts: string[] = [];
  if (params.text?.trim()) {
    parts.push(`## User-provided text\n${params.text.trim()}`);
  }
  for (const { url, body } of params.urlContents) {
    parts.push(`## Content from ${url}\n${body}`);
  }
  for (const { name, body } of params.fileContents) {
    parts.push(`## Content from file: ${name}\n${body}`);
  }
  return parts.join("\n\n");
}

function parseAiResponse(raw: string): {
  userMdContent: string;
  memoryContent: string;
} {
  const userMdMatch = /<USER_MD>([\s\S]*?)<\/USER_MD>/i.exec(raw);
  const memoryMatch = /<MEMORY_MD>([\s\S]*?)<\/MEMORY_MD>/i.exec(raw);
  return {
    userMdContent: (userMdMatch?.[1] ?? "").trim(),
    memoryContent: (memoryMatch?.[1] ?? "").trim(),
  };
}

export const profileHandlers: GatewayRequestHandlers = {
  "profile.parse": async ({ params, respond }) => {
    const text = typeof params.text === "string" ? params.text.trim() : undefined;
    const rawUrls = Array.isArray(params.urls)
      ? (params.urls as unknown[]).filter((u): u is string => typeof u === "string")
      : [];
    const rawFiles = Array.isArray(params.files)
      ? (params.files as unknown[]).filter(
          (f): f is FileContent =>
            typeof f === "object" &&
            f !== null &&
            typeof (f as FileContent).name === "string" &&
            typeof (f as FileContent).content === "string",
        )
      : [];

    // Load config for upload limits
    const cfg = loadConfig();
    const uploadConfig = getUploadConfig(cfg);

    // Validate file count
    if (rawFiles.length > uploadConfig.maxFileCount) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `profile.parse: too many files (max ${uploadConfig.maxFileCount})`,
        ),
      );
      return;
    }

    // Validate file size and type
    const validFiles: FileContent[] = [];
    const skippedFiles: string[] = [];
    for (const file of rawFiles) {
      // Check file size (base64 is ~4/3 of binary size)
      const estimatedSize = (file.content.length * 3) / 4;
      if (estimatedSize > uploadConfig.maxFileSize) {
        skippedFiles.push(`${file.name} (too large)`);
        continue;
      }
      // Check file type
      if (!isSupportedFileType(file.name)) {
        skippedFiles.push(`${file.name} (unsupported type)`);
        continue;
      }
      validFiles.push(file);
    }

    if (!text && rawUrls.length === 0 && validFiles.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "profile.parse: text, urls, or files required"),
      );
      return;
    }

    // Fetch URLs concurrently; track which ones failed
    const urlResults = await Promise.all(
      rawUrls.map(async (url) => ({ url, body: await fetchUrlText(url) })),
    );
    const skippedUrls = urlResults.filter((r) => r.body === null).map((r) => r.url);
    const urlContents = urlResults.filter(
      (r): r is { url: string; body: string } => r.body !== null,
    );

    // Parse files concurrently; track which ones failed
    const fileResults = await Promise.all(
      validFiles.map(async (file) => ({
        name: file.name,
        body: await parseFileContent(file),
      })),
    );
    const fileParseFailures = fileResults.filter((r) => r.body === null).map((r) => r.name);
    skippedFiles.push(...fileParseFailures.map((name) => `${name} (parse failed)`));
    const fileContents = fileResults.filter(
      (r): r is { name: string; body: string } => r.body !== null,
    );

    if (!text && urlContents.length === 0 && fileContents.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "profile.parse: all inputs failed to process"),
      );
      return;
    }

    // Resolve the gateway default model (cfg already loaded above)
    const defaultRef = resolveDefaultModelRef(cfg);
    const resolved = resolveModel(defaultRef.provider, defaultRef.model, undefined, cfg);
    if (!resolved.model) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `profile.parse: no model available (${resolved.error ?? "unknown"})`,
        ),
      );
      return;
    }

    const providerAuth = await getApiKeyForModel({
      model: resolved.model,
      cfg,
    });
    let apiKey: string;
    try {
      apiKey = requireApiKey(providerAuth, defaultRef.provider);
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "profile.parse: no API key for default model"),
      );
      return;
    }

    const userPrompt = buildUserPrompt({ text, urlContents, fileContents });

    try {
      const controller = new AbortController();
      const aiTimer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      let raw = "";
      try {
        const result = await completeSimple(
          resolved.model,
          {
            messages: [
              {
                role: "user",
                content: `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`,
                timestamp: Date.now(),
              },
            ],
          },
          {
            apiKey,
            maxTokens: 1024,
            temperature: 0.3,
            signal: controller.signal,
          },
        );
        raw = result.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("");
      } finally {
        clearTimeout(aiTimer);
      }

      const { userMdContent, memoryContent } = parseAiResponse(raw);
      if (!userMdContent && !memoryContent) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "profile.parse: AI returned no parseable content"),
        );
        return;
      }

      respond(true, { userMdContent, memoryContent, skippedUrls, skippedFiles }, undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `profile.parse: ${message}`));
    }
  },
};
