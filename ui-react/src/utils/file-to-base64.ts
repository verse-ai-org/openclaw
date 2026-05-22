export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      },
      { once: true },
    );
    reader.addEventListener(
      "error",
      () => reject(new Error(`Failed to read file: ${file.name}`)),
      { once: true },
    );
    reader.readAsDataURL(file);
  });
}

export function stripDataUrlPrefix(dataUrl: string): string {
  const match = /^data:[^;]+;base64,(.*)$/.exec(dataUrl);
  return match?.[1] ?? dataUrl;
}
