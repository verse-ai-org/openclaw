export type ArtifactChipIconKind = "pdf" | "word" | "excel" | "text" | "image" | "audio" | "file";

export type ArtifactChipIcon =
  | { kind: ArtifactChipIconKind; type: "asset"; src: string }
  | { kind: ArtifactChipIconKind; type: "lucide"; lucide: "image" | "audio" | "file" };

const PDF_MIMES = new Set(["application/pdf"]);
const WORD_MIMES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXCEL_MIMES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function extensionFromFileName(fileName: string | undefined): string {
  const trimmed = fileName?.trim() ?? "";
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0 || dot === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(dot + 1).toLowerCase();
}

function iconFromExtension(ext: string): ArtifactChipIcon | undefined {
  switch (ext) {
    case "pdf":
      return { kind: "pdf", type: "asset", src: "/pdf.svg" };
    case "doc":
    case "docx":
      return { kind: "word", type: "asset", src: "/word.svg" };
    case "xls":
    case "xlsx":
      return { kind: "excel", type: "asset", src: "/excel.svg" };
    case "md":
    case "markdown":
      return { kind: "text", type: "asset", src: "/markdown.svg" };
    case "json":
      return { kind: "text", type: "asset", src: "/json.svg" };
    case "csv":
      return { kind: "text", type: "asset", src: "/csv.svg" };
    case "xml":
      return { kind: "text", type: "asset", src: "/xml.svg" };
    case "txt":
    case "log":
      return { kind: "text", type: "asset", src: "/txt.svg" };
    default:
      return undefined;
  }
}

function iconFromMime(normalizedMime: string): ArtifactChipIcon | undefined {
  if (normalizedMime.startsWith("image/")) {
    return { kind: "image", type: "lucide", lucide: "image" };
  }
  if (normalizedMime.startsWith("audio/")) {
    return { kind: "audio", type: "lucide", lucide: "audio" };
  }
  if (PDF_MIMES.has(normalizedMime)) {
    return { kind: "pdf", type: "asset", src: "/pdf.svg" };
  }
  if (WORD_MIMES.has(normalizedMime)) {
    return { kind: "word", type: "asset", src: "/word.svg" };
  }
  if (EXCEL_MIMES.has(normalizedMime)) {
    return { kind: "excel", type: "asset", src: "/excel.svg" };
  }
  if (normalizedMime === "application/json") {
    return { kind: "text", type: "asset", src: "/json.svg" };
  }
  if (normalizedMime === "application/xml" || normalizedMime === "text/xml") {
    return { kind: "text", type: "asset", src: "/xml.svg" };
  }
  if (normalizedMime === "application/markdown" || normalizedMime === "text/markdown") {
    return { kind: "text", type: "asset", src: "/markdown.svg" };
  }
  if (normalizedMime === "text/csv" || normalizedMime === "application/csv") {
    return { kind: "text", type: "asset", src: "/csv.svg" };
  }
  if (normalizedMime.startsWith("text/")) {
    return { kind: "text", type: "asset", src: "/txt.svg" };
  }
  return undefined;
}

export function resolveArtifactChipIcon(params: {
  mimeType: string;
  fileName?: string;
}): ArtifactChipIcon {
  const normalizedMime = params.mimeType.trim().toLowerCase();
  const fromMime = iconFromMime(normalizedMime);
  if (fromMime) {
    return fromMime;
  }
  const fromExtension = iconFromExtension(extensionFromFileName(params.fileName));
  if (fromExtension) {
    return fromExtension;
  }
  return { kind: "file", type: "lucide", lucide: "file" };
}
