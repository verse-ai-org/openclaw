import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
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
  const ident = row?.identity as Record<string, unknown> | undefined;
  const [editing, setEditing] = useState(false);
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

  const name = identityMd.name ?? identity?.name ?? (ident?.name as string | undefined) ?? row?.name ?? agentId;
  const avatar = identityMd.avatar ?? identity?.avatar ?? (ident?.avatar as string | undefined);
  const emoji = identityMd.emoji ?? (ident?.emoji as string | undefined) ?? "🤖";
  const creature = identityMd.creature ?? "AI Agent";
  const vibe = identityMd.vibe ?? (ident?.description as string | undefined) ?? "";
  const initials = name.slice(0, 2).toUpperCase();

  const startEdit = () => {
    setDraft({
      name,
      creature,
      vibe,
      emoji,
      avatar: avatar ?? "",
    });
    setEditing(true);
  };

  const handleSaveIdentity = async () => {
    const nextContent = upsertIdentityMarkdown(agentFileContents["IDENTITY.md"] ?? "", draft);
    changeFileDraft("IDENTITY.md", nextContent);
    await saveFile("IDENTITY.md");
    setEditing(false);
  };

  const displayValueByKey: Record<keyof ParsedIdentity, string> = {
    name,
    creature,
    vibe,
    emoji,
    avatar: avatar ?? "",
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
              <img src={avatar} alt={name} className="size-full object-cover rounded-full" />
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

      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-[36px] font-extrabold text-black leading-none flex items-center gap-2">
          <span>{emoji}</span>
          <span>{name}</span>
        </h1>
        <span className="px-2 py-0.5 rounded-md bg-[#F3F4F6] text-[#8E8E93] text-[10px] font-bold uppercase">
          {creature}
        </span>
      </div>

      <p className="text-[11px] font-bold text-[#BA0034] font-mono mb-3">{agentId}</p>

      {vibe && (
        <p className="text-[17px] font-medium text-black text-center max-w-xl leading-snug mb-5">
          "{vibe}"
        </p>
      )}

      <div className="w-full rounded-3xl bg-[#FBFBFB] p-6">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Resume Intro</SectionLabel>
          {!editing ? (
            <button
              type="button"
              className="text-[12px] font-semibold px-3 py-1 rounded-full bg-[#111827] text-white hover:bg-black"
              onClick={startEdit}
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-[12px] font-semibold px-3 py-1 rounded-full bg-[#E5E7EB] text-[#111827] hover:bg-[#D1D5DB]"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={agentFileSaving}
                className={cn(
                  "text-[12px] font-semibold px-3 py-1 rounded-full",
                  agentFileSaving ? "bg-[#E5E7EB] text-[#8E8E93]" : "bg-[#BA0034] text-white hover:bg-[#9b0029]",
                )}
                onClick={() => void handleSaveIdentity()}
              >
                {agentFileSaving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-[120px_1fr] gap-y-3 gap-x-4 items-center text-[14px]">
          {IDENTITY_KEYS.map((k) => (
            <div key={k} className="contents">
              <p className="text-[#8E8E93] font-semibold capitalize">{k}</p>
              {editing ? (
                <input
                  type="text"
                  value={draft[k] ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [k]: e.target.value }))}
                  className="h-9 rounded-xl bg-white border border-[#E5E7EB] px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#BA0034]/20"
                  placeholder={`Enter ${k}`}
                />
              ) : (
                <p className={cn("font-medium break-all", displayValueByKey[k] ? "text-black" : "text-[#8E8E93] italic")}>
                  {displayValueByKey[k] || placeholderByKey[k]}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProfessionalSummarySection({ agentId }: { agentId: string }) {
  const agentsList = useAgentsStore((s) => s.agentsList);
  const identity = useAgentsStore((s) => s.agentIdentityById[agentId]);
  const row = agentsList?.agents.find((a) => a.id === agentId);
  const ident = row?.identity as Record<string, unknown> | undefined;

  const bioOrSummary = (ident?.bio as string | undefined) ?? (ident?.summary as string | undefined);
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
