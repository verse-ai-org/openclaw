export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = base64ToUint8Array(base64);
  return new Blob([bytes], { type: mimeType.trim() || "application/octet-stream" });
}

export function createBlobUrlFromBase64(base64: string, mimeType: string): string {
  return URL.createObjectURL(base64ToBlob(base64, mimeType));
}

export function decodeTextFromBase64(base64: string): string {
  const bytes = base64ToUint8Array(base64);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
