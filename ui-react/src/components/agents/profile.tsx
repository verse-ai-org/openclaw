import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/store/agents.store";
import { useGatewayStore } from "@/store/gateway.store";
import { useChatStore } from "@/store/chat.store";
import { useSettingsStore } from "@/store/settings.store";
import type { SessionEntry } from "@/hooks/useSessionManager";
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

/** Auto-plays once on mount, no controls or overlay. Only rendered when videoUrl is provided. */
function VideoShowcase({ videoUrl }: { videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Auto-play once when the component mounts
    void videoRef.current?.play();
  }, []);

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-lg"
      style={{ width: 260, aspectRatio: "3/4", flexShrink: 0 }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
}

export function ProfileHeroSection({
  agentId,
  onChatClick,
}: {
  agentId: string;
  /** If provided, overrides the default navigate-to-chat behavior (used when inside a drawer on the Chat page) */
  onChatClick?: (sessionKey: string) => void;
}) {
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
  const video = ident?.video;
  const creature = identityMd.creature ?? "AI Agent";
  const vibe = identityMd.vibe ?? ident?.description ?? "";
  const initials = name.slice(0, 2).toUpperCase();

  const navigate = useNavigate();
  const client = useGatewayStore((s) => s.client);

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

  const handleGoToChat = async () => {
    // Find the most recently updated session for this agent
    const agentPrefix = `agent:${agentId}:`;
    let targetKey = `${agentPrefix}main`;
    if (client?.connected) {
      try {
        const result = await client.request<{ sessions?: SessionEntry[] }>(
          "sessions.list",
          { includeDerivedTitles: true, includeLastMessage: true },
        );
        const agentSessions = (result?.sessions ?? []).filter((s) =>
          s.key.startsWith(agentPrefix),
        );
        if (agentSessions.length > 0) {
          // Pick the most recently updated session
          const latest = agentSessions.reduce((a, b) =>
            (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a,
          );
          targetKey = latest.key;
        }
      } catch {
        // fallback to main session
      }
    }
    if (onChatClick) {
      // Caller handles navigation (e.g. closing a drawer on the Chat page)
      onChatClick(targetKey);
    } else {
      useChatStore.getState().setSessionKey(targetKey);
      useSettingsStore
        .getState()
        .updateSettings({ sessionKey: targetKey, lastActiveSessionKey: targetKey });
      void navigate("/chat");
    }
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
    <div className={`flex pb-2 ${
      video ? "flex-row items-start justify-center gap-10" : "flex-col items-center gap-0"
    }`}>
      {/* Left: video showcase — only rendered when a video URL is configured */}
      {video && <VideoShowcase videoUrl={video} />}

      {/* Right: avatar + info */}
      <div className={`flex flex-col items-center gap-0 ${
        video ? "w-[340px] shrink-0" : ""
      }`}>
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

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-[36px] font-extrabold text-black leading-none flex items-center gap-2 whitespace-nowrap">
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
          <button
            type="button"
            title="Start chatting"
            onClick={() => void handleGoToChat()}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#BA0034] text-white text-[13px] font-bold shadow-[0_2px_8px_rgba(186,0,52,0.25)] hover:bg-[#9b0029] hover:shadow-[0_4px_14px_rgba(186,0,52,0.35)] active:scale-95 transition-all duration-150 select-none"
          >
            <MessageSquare className="size-4 shrink-0" />
            <span>Chat</span>
          </button>
          <span className="px-2 py-0.5 rounded-md bg-[#F3F4F6] text-[#8E8E93] text-[10px] font-bold uppercase">
            {creature}
          </span>
        </div>

        {/* <p className="text-[11px] font-bold text-[#BA0034] font-mono mb-3">{agentId}</p> */}

        {vibe && (
          <p className="font-medium text-muted-foreground text-center max-w-xl leading-snug">
            "{vibe}"
          </p>
        )}
      </div>

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

/** Compact intro card: numbered key points + a "Try:" usage hint for this agent. */
export function IntroSection({
  agentId,
  onChatClick,
}: {
  agentId: string;
  /** If provided, overrides the default navigate-to-chat behavior (used inside a drawer on the Chat page) */
  onChatClick?: (sessionKey: string) => void;
}) {
  const agentsList = useAgentsStore((s) => s.agentsList);
  const row = agentsList?.agents.find((a) => a.id === agentId);
  const bio = row?.identity?.bio;
  const navigate = useNavigate();
  const client = useGatewayStore((s) => s.client);

  if (!bio) { return null; }

  // Lines starting with 💬 are rendered as a "Try:" usage hint, others are numbered points
  const allLines = bio.split(/\n/).map((s) => s.trim()).filter(Boolean);
  const tryLine = allLines.find((l) => l.startsWith("💬"));
  const points = allLines.filter((l) => !l.startsWith("💬"));

  // Strip the emoji prefix and surrounding quotes to get clean message text
  const tryText = tryLine
    ? tryLine.replace(/^💬\s*(Try:\s*)?/i, "").replace(/^[""]|[""]$/g, "").trim()
    : null;

  const handleTryClick = async () => {
    if (!tryText) { return; }
    // Prefill the chat input with the Try text
    useChatStore.getState().setPendingDraftMessage(tryText);

    // Navigate to chat — same logic as ProfileHeroSection.handleGoToChat
    const agentPrefix = `agent:${agentId}:`;
    let targetKey = `${agentPrefix}main`;
    if (client?.connected) {
      try {
        const result = await client.request<{ sessions?: Array<{ key: string; updatedAt?: number }> }>(
          "sessions.list",
          { includeDerivedTitles: true, includeLastMessage: true },
        );
        const agentSessions = (result?.sessions ?? []).filter((s) => s.key.startsWith(agentPrefix));
        if (agentSessions.length > 0) {
          const latest = agentSessions.reduce((a, b) => ((b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a));
          targetKey = latest.key;
        }
      } catch {
        // fallback to main session
      }
    }
    if (onChatClick) {
      onChatClick(targetKey);
    } else {
      useChatStore.getState().setSessionKey(targetKey);
      useSettingsStore
        .getState()
        .updateSettings({ sessionKey: targetKey, lastActiveSessionKey: targetKey });
      void navigate("/chat");
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-[#F0F0F0] px-6 py-5">
      <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">What I Do</p>

      {points.length > 1 ? (
        <ol className="flex flex-col gap-2.5 mb-0">
          {points.map((point, i) => (
            <li key={i} className="flex items-start gap-3">
              {/* Numbered badge */}
              <span className="shrink-0 mt-[1px] size-[18px] rounded-full bg-[#EBEBEB] text-[#6B7280] text-[10px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-[13px] text-[#1A1A1A] leading-snug">{point}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-[#1A1A1A] leading-relaxed mb-0">{points[0] ?? bio}</p>
      )}

      {tryLine && tryText && (
        <button
          type="button"
          onClick={() => { void handleTryClick(); }}
          className="mt-4 w-full text-left flex items-start gap-2 rounded-xl bg-[#F0F4FF] border border-[#D8E4FF] px-4 py-3 hover:bg-[#E4ECFF] hover:border-[#B8CCFF] active:scale-[0.98] transition-all duration-150 cursor-pointer group"
          title="Click to try this in chat"
        >
          <span className="text-[15px] leading-none mt-[1px] group-hover:scale-110 transition-transform duration-150">💬</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-[#3B5BDB] leading-snug font-medium">
              {tryLine.replace(/^💬\s*/, "")}
            </p>
            {/* Subtle "click to try" hint */}
            <p className="text-[10px] text-[#7C9FE0] mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              Click to start chatting with this prompt →
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
