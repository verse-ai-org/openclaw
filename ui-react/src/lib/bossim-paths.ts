import { getElectronBridge, type ElectronBridgeEnv } from "@/utils/electron-env";

export type BossimPaths = {
  stateDir: string;
  defaultWorkspace: string;
  managedSkillsDir: string;
  defaultGatewayPort: number;
};

const FALLBACK_PATHS: BossimPaths = {
  stateDir: "~/.bossim",
  defaultWorkspace: "~/.bossim/workspace",
  managedSkillsDir: "~/.bossim/skills",
  defaultGatewayPort: 18790,
};

let cachedPaths: Promise<BossimPaths> | null = null;

export function resolveBossimPaths(): Promise<BossimPaths> {
  if (!cachedPaths) {
    cachedPaths = loadBossimPaths();
  }
  return cachedPaths;
}

async function loadBossimPaths(): Promise<BossimPaths> {
  const bridge = getElectronBridge() as ElectronBridgeEnv | undefined;
  if (bridge?.getBossimStateDir) {
    const info = await bridge.getBossimStateDir();
    return {
      stateDir: info.stateDir,
      defaultWorkspace: info.defaultAgentWorkspace,
      managedSkillsDir: info.managedSkillsDir ?? `${info.stateDir}/skills`,
      defaultGatewayPort: info.defaultGatewayPort ?? 18790,
    };
  }
  return FALLBACK_PATHS;
}

export function formatAgentWorkspace(stateDir: string, agentSlug: string): string {
  return `${stateDir}/agents/${agentSlug}`;
}

export function hydrateWizardBossimDefaults(
  update: (partial: {
    workspace: string;
    gatewayPort: number;
  }) => void,
): void {
  void resolveBossimPaths().then((paths) => {
    update({
      workspace: paths.defaultWorkspace,
      gatewayPort: paths.defaultGatewayPort,
    });
  });
}
