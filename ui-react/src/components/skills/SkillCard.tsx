import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { computeSkillMissing, computeSkillReasons } from "@/lib/skills-grouping";
import type { SkillMessage } from "@/store/skills.store";
import type { SkillStatusEntry } from "@/types/skills";
import { SkillStatusBadges } from "./SkillStatusBadges";

interface Props {
  skill: SkillStatusEntry;
  busy: boolean;
  apiKeyEdit: string;
  message: SkillMessage | null;
  onToggle: () => void;
  onEdit: (value: string) => void;
  onSaveKey: () => void;
  onInstall: (installId: string) => void;
  onRemove?: () => void;
}

export function SkillCard({
  skill,
  busy,
  apiKeyEdit,
  message,
  onToggle,
  onEdit,
  onSaveKey,
  onInstall,
  onRemove,
}: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canRemove =
    onRemove !== undefined &&
    (skill.source === "openclaw-workspace" || skill.source === "openclaw-managed");
  const showBundledBadge = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const missing = computeSkillMissing(skill);
  const reasons = computeSkillReasons(skill);

  return (
    <Card className="flex flex-col gap-0">
      <CardContent className="pt-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: info */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm leading-snug">
              {skill.emoji ? `${skill.emoji} ` : ""}
              {skill.name}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {skill.description}
            </div>
            <SkillStatusBadges skill={skill} showBundledBadge={showBundledBadge} />
            {missing.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">Missing: {missing.join(", ")}</p>
            )}
            {reasons.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">Reason: {reasons.join(", ")}</p>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button
              size="sm"
              variant={skill.disabled ? "default" : "outline"}
              disabled={busy}
              onClick={onToggle}
            >
              {skill.disabled ? "Enable" : "Disable"}
            </Button>
            {canInstall && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onInstall(skill.install[0].id)}
              >
                {busy ? "Installing…" : skill.install[0].label}
              </Button>
            )}
            {canRemove && !confirmRemove && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => setConfirmRemove(true)}
              >
                Remove
              </Button>
            )}
            {canRemove && confirmRemove && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setConfirmRemove(false);
                    onRemove();
                  }}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmRemove(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* API key section */}
        {skill.primaryEnv && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <Input
                type="password"
                placeholder="API key"
                value={apiKeyEdit}
                onChange={(e) => onEdit(e.target.value)}
                className="h-8 text-sm"
              />
              <Button size="sm" disabled={busy} onClick={onSaveKey}>
                Save key
              </Button>
            </div>
          </div>
        )}

        {/* Operation feedback */}
        {message && (
          <p
            className={`text-xs ${
              message.kind === "error" ? "text-destructive" : "text-green-600 dark:text-green-400"
            }`}
          >
            {message.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
