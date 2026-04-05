import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/store/agents.store";
import { SectionLabel } from "./shared";

export type ParsedIdentity = {
  name?: string;
  creature?: string;
  vibe?: string;
  emoji?: string;
  avatar?: string;
};

type ParsedIdentityResult = {
  fields: ParsedIdentity;
  hints: Partial<Record<keyof ParsedIdentity, string>>;
};

const IDENTITY_KEYS: Array<keyof ParsedIdentity> = ["name", "creature", "vibe", "emoji", "avatar"];

function parseIdentityMarkdown(content: string): ParsedIdentityResult {
  const fields: ParsedIdentity = {};
  const hints: Partial<Record<keyof ParsedIdentity, string>> = {};
  let pendingKey: keyof ParsedIdentity | null = null;

  const cleanToken = (value: string) => value
    .trim()
    .replace(/^[-*]\s*/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^_+|_+$/g, "")
    .replace(/^`+|`+$/g, "")
    .trim();

  const sanitizeValue = (value: string) => {
    const cleaned = cleanToken(value);
    if (!cleaned) { return ""; }
    if (/^[*_`-]+$/.test(cleaned)) { return ""; }
    return cleaned;
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { continue; }

    const keyMatch = line.match(/^(?:[-*]\s*)?(?:\*\*)?\s*(name|creature|vibe|emoji|avatar)\s*(?:\*\*)?\s*:\s*(.*)$/i);
    if (keyMatch) {
      const key = keyMatch[1].toLowerCase() as keyof ParsedIdentity;
      const value = sanitizeValue(keyMatch[2] ?? "");
      pendingKey = key;

      if (!value) {
        continue;
      }
      if (value.startsWith("(") && value.endsWith(")")) {
        hints[key] = value.slice(1, -1).trim();
        continue;
      }

      fields[key] = value;
      continue;
    }

    if (!pendingKey) { continue; }

    const hintLine = sanitizeValue(line);
    if (hintLine.startsWith("(") && hintLine.endsWith(")")) {
      hints[pendingKey] = hintLine.slice(1, -1).trim();
      pendingKey = null;
    }
  }

  return { fields, hints };
}

function upsertIdentityMarkdown(content: string, identity: ParsedIdentity): string {
  const lines = content ? content.split(/\r?\n/) : [];
  const seen = new Set<keyof ParsedIdentity>();

  const nextLines = lines.map((line) => {
    const m = line.match(/^(\s*(?:[-*]\s*)?(?:\*\*)?)(name|creature|vibe|emoji|avatar)((?:\*\*)?\s*:\s*).+$/i);
    if (!m) { return line; }
    const key = m[2].toLowerCase() as keyof ParsedIdentity;
    seen.add(key);
    const nextValue = identity[key]?.trim() ?? "";
    return `${m[1]}${m[2]}${m[3]}${nextValue}`;
  });

  const missing = IDENTITY_KEYS.filter((k) => !seen.has(k)).map((k) => `${k}: ${identity[k] ?? ""}`);
  if (missing.length > 0) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== "") {
      nextLines.push("");
    }
    nextLines.push(...missing);
  }

  return nextLines.join("\n");
}

export function ProfileHeroSection({ agentId }: { agentId: string }) {
  const agentsList = useAgentsStore((s) => s.agentsList);
  const identity = useAgentsStore((s) => s.agentIdentityById[agentId]);
  const agentFileContents = useAgentsStore((s) => s.agentFileContents);
  const agentFileDrafts = useAgentsStore((s) => s.agentFileDrafts);
  const agentFileSaving = useAgentsStore((s) => s.agentFileSaving);
  const loadFileContent = useAgentsStore((s) => s.loadFileContent);
  const changeFileDraft = useAgentsStore((s) => s.changeFileDraft);
  const saveFile = useAgentsStore((s) => s.saveFile);
  const row = agentsList?.agents.find((a) => a.id === agentId);
  const ident = row?.identity;
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ParsedIdentity>({});

  useEffect(() => {
    if (!("IDENTITY.md" in agentFileContents)) {
      void loadFileContent(agentId, "IDENTITY.md");
    }
  }, [agentId, agentFileContents, loadFileContent]);

  const identitySource = agentFileDrafts["IDENTITY.md"] ?? agentFileContents["IDENTITY.md"] ?? "";
  const parsedIdentity = useMemo(
    () => parseIdentityMarkdown(identitySource),
    [identitySource],
  );
  const identityMd = parsedIdentity.fields;
  const identityHints = parsedIdentity.hints;

  const name = identityMd.name ?? identity?.name ?? ident?.name ?? row?.name ?? agentId;
  const emoji = identityMd.emoji ?? ident?.emoji ?? "🤖";
  const avatar = ident?.avatarUrl;
  const creature = identityMd.creature ?? "AI Agent";
  const vibe = identityMd.vibe ?? ident?.description ?? "";
  const initials = name.slice(0, 2).toUpperCase();

  const startEdit = () => {
    setDraft({
      name,
      creature,
      vibe,
      emoji,
      avatar: avatar ?? "",
    });
    setEditOpen(true);
  };

  const handleSaveIdentity = async () => {
    const nextContent = upsertIdentityMarkdown(agentFileContents["IDENTITY.md"] ?? "", draft);
    changeFileDraft("IDENTITY.md", nextContent);
    await saveFile("IDENTITY.md");
    setEditOpen(false);
  };

  const placeholderByKey: Record<keyof ParsedIdentity, string> = {
    name: identityHints.name ?? "Pick something you like",
    creature: identityHints.creature ?? "Pick something you like",
    vibe: identityHints.vibe ?? "Pick something you like",
    emoji: identityHints.emoji ?? "Pick something you like",
    avatar: identityHints.avatar ?? "Pick something you like",
  };

  return (
    <div className="flex flex-col items-center gap-0 pb-2">
      <div className="relative mb-6">
        <div className="size-42.5 rounded-full bg-[#F9FAFB] p-1 flex items-center justify-center shadow-sm">
          <div className="size-40 rounded-full bg-white flex items-center justify-center overflow-hidden shadow-inner">
            {avatar ? (
              <img src={avatar ?? emoji} alt={name} className="size-full object-contain rounded-full" />
            ) : (
              <div className="size-full rounded-full flex flex-col items-center justify-center gap-2 bg-[#F9FAFB]">
                <span className="text-5xl font-extrabold text-gray-300 select-none">{initials}</span>
              </div>
            )}
          </div>
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#10B981] rounded-full px-2 py-0.5">
          <span className="size-1.5 rounded-full bg-white shrink-0" />
          <span className="text-[10px] font-bold text-white tracking-wide">ONLINE</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 mb-1">
        <h1 className="text-[36px] font-extrabold text-black leading-none flex items-center gap-2">
          <span>{emoji}</span>
          <span>{name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full"
            onClick={startEdit}
          >
            <Pencil className="size-4 text-black" />
          </Button>
        </h1>
        <span className="px-2 py-0.5 rounded-md bg-[#F3F4F6] text-[#8E8E93] text-[10px] font-bold uppercase">
          {creature}
        </span>
      </div>

      {/* <p className="text-[11px] font-bold text-[#BA0034] font-mono mb-3">{agentId}</p> */}

      {vibe && (
        <p className="text-lg font-medium text-muted-foreground text-center max-w-xl leading-snug mb-5">
          "{vibe}"
        </p>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Identity</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-[120px_1fr] gap-y-3 gap-x-4 items-center text-[14px] py-2">
            {IDENTITY_KEYS.map((k) => (
              <div key={k} className="contents">
                <p className="text-[#8E8E93] font-semibold capitalize">{k}</p>
                <input
                  type="text"
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [k]: e.target.value }))}
                  className="h-9 rounded-xl bg-white border border-[#E5E7EB] px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#BA0034]/20"
                  placeholder={placeholderByKey[k]}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={agentFileSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={agentFileSaving}
              onClick={() => void handleSaveIdentity()}
            >
              {agentFileSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProfessionalSummarySection({ agentId }: { agentId: string }) {
  const agentsList = useAgentsStore((s) => s.agentsList);
  const identity = useAgentsStore((s) => s.agentIdentityById[agentId]);
  const row = agentsList?.agents.find((a) => a.id === agentId);
  const ident = row?.identity;

  const bioOrSummary = ident?.bio ?? ident?.summary;
  const fallback = identity?.name ?? row?.name
    ? `${identity?.name ?? row?.name ?? agentId} is an AI agent running on the OpenClaw ecosystem. It processes requests, executes tools, and coordinates tasks across connected channels and sessions.`
    : null;
  const summary = bioOrSummary ?? fallback;

  if (!summary) { return null; }

  return (
    <div className="bg-[#FBFBFB] rounded-3xl p-8">
      <div className="flex flex-col gap-4">
        <SectionLabel>Professional Summary</SectionLabel>
        <p className="text-[15px] font-medium text-black leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}
