import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSkillsStore } from "@/store/skills.store";
import type { SkillImportTarget } from "@/types/skills";

type TabMode = "url" | "upload";

interface Props {
  trigger: React.ReactNode;
}

export function AddSkillDialog({ trigger }: Props) {
  const importSkill = useSkillsStore((s) => s.importSkill);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TabMode>("url");
  const [target, setTarget] = useState<SkillImportTarget>("workspace");

  // URL mode state
  const [url, setUrl] = useState("");
  const [urlSkillName, setUrlSkillName] = useState("");

  // Upload mode state
  const [file, setFile] = useState<File | null>(null);
  const [uploadSkillName, setUploadSkillName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    warnings?: string[];
  } | null>(null);

  function resetForm() {
    setUrl("");
    setUrlSkillName("");
    setFile(null);
    setUploadSkillName("");
    setResult(null);
    setMode("url");
    setTarget("workspace");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      resetForm();
    }
  }

  async function handleSubmit() {
    setResult(null);
    setLoading(true);
    try {
      if (mode === "url") {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) {
          setResult({ ok: false, message: "Please enter a URL" });
          return;
        }
        const res = await importSkill({
          kind: "url",
          url: trimmedUrl,
          target,
          skillName: urlSkillName.trim() || undefined,
        });
        setResult(res);
        if (res.ok) {
          setTimeout(() => {
            setOpen(false);
            resetForm();
          }, 1500);
        }
      } else {
        if (!file) {
          setResult({ ok: false, message: "Please select a file" });
          return;
        }
        const data = await readFileAsBase64(file);
        const res = await importSkill({
          kind: "upload",
          data,
          filename: file.name,
          target,
          skillName: uploadSkillName.trim() || undefined,
        });
        setResult(res);
        if (res.ok) {
          setTimeout(() => {
            setOpen(false);
            resetForm();
          }, 1500);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && (mode === "url" ? url.trim().length > 0 : file !== null);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader>
            <DrawerTitle>Add Skill</DrawerTitle>
            <DrawerDescription>
              Import a skill from a URL or upload a local archive (.zip, .tar.gz).
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-2">
            {/* ── Target selector ────────────────────────────────────────── */}
            <div className="mb-3 flex flex-col gap-1.5">
              <label className="text-sm font-medium">Install to</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={target === "workspace" ? "default" : "outline"}
                  onClick={() => setTarget("workspace")}
                  disabled={loading}
                  className="flex-1"
                >
                  Workspace
                </Button>
                <Button
                  size="sm"
                  variant={target === "managed" ? "default" : "outline"}
                  onClick={() => setTarget("managed")}
                  disabled={loading}
                  className="flex-1"
                >
                  Global (managed)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {target === "workspace"
                  ? "Installed into the current workspace's skills/ folder. Only active in this project."
                  : "Installed into ~/.openclaw/skills/. Available across all workspaces."}
              </p>
            </div>
            <Tabs value={mode} onValueChange={(v) => setMode(v as TabMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="url" className="flex-1">
                  From URL
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex-1">
                  Upload File
                </TabsTrigger>
              </TabsList>

              {/* ── URL mode ───────────────────────────────────────────── */}
              <TabsContent value="url" className="flex flex-col gap-3 pt-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">URL</label>
                  <Input
                    placeholder="https://example.com/my-skill.zip"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supported formats: .zip, .tar.gz, .tgz, .tar.bz2
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    Skill name <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    placeholder="Derived from filename if blank"
                    value={urlSkillName}
                    onChange={(e) => setUrlSkillName(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </TabsContent>

              {/* ── Upload mode ─────────────────────────────────────────── */}
              <TabsContent value="upload" className="flex flex-col gap-3 pt-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Archive file</label>
                  <div
                    className="flex items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30 p-6 cursor-pointer hover:border-muted-foreground/60 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        fileInputRef.current?.click();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {file ? (
                      <p className="text-sm font-medium">{file.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Click to select .zip or .tar.gz
                      </p>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.tar.gz,.tgz,.tar.bz2,.tbz2"
                    className="hidden"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] ?? null;
                      setFile(picked);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    Skill name <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    placeholder="Derived from filename if blank"
                    value={uploadSkillName}
                    onChange={(e) => setUploadSkillName(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Result feedback */}
            {result && (
              <div
                className={`mt-3 rounded-md px-3 py-2 text-sm ${
                  result.ok
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                <p>{result.message}</p>
                {result.warnings && result.warnings.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs opacity-80">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DrawerFooter>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {loading ? "Importing…" : "Import Skill"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" disabled={loading}>
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:application/zip;base64,")
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64 ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
