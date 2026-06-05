export function saveArtifactBytes(params: {
  data: string;
  mimeType: string;
  fileName: string;
}): void {
  const fileName = params.fileName.trim() || "download";
  const mimeType = params.mimeType.trim() || "application/octet-stream";
  const binary = atob(params.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
