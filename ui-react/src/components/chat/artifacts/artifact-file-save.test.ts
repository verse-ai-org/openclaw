import { describe, expect, it, vi, afterEach } from "vitest";
import { saveArtifactBytes } from "./artifact-file-save";

describe("saveArtifactBytes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a blob download for base64 artifact bytes", () => {
    const click = vi.fn();
    const anchor = { click, href: "", download: "", rel: "" } as unknown as HTMLAnchorElement;
    const createElement = vi.spyOn(document, "createElement").mockReturnValue(anchor);
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    saveArtifactBytes({
      data: btoa("hello"),
      mimeType: "text/plain",
      fileName: "notes.txt",
    });

    expect(createElement).toHaveBeenCalledWith("a");
    expect(anchor.download).toBe("notes.txt");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(createObjectURL).toHaveBeenCalled();
  });
});
