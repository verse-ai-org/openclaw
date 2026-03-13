export type SkillsStatusConfigCheck = {
  path: string;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type SkillImportTarget = "workspace" | "managed";

export type SkillImportParams =
  | { kind: "url"; url: string; target?: SkillImportTarget; skillName?: string; timeoutMs?: number }
  | {
      kind: "upload";
      data: string;
      filename: string;
      target?: SkillImportTarget;
      skillName?: string;
      timeoutMs?: number;
    };

export type SkillImportResult = {
  ok: boolean;
  message: string;
  skillName?: string;
  destDir?: string;
  warnings?: string[];
};

export type SkillRemoveResult = {
  ok: boolean;
  message: string;
};
