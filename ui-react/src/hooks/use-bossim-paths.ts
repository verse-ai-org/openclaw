import { useEffect, useState } from "react";
import { type BossimPaths, resolveBossimPaths } from "@/lib/bossim-paths";

export function useBossimPaths(): BossimPaths | null {
  const [paths, setPaths] = useState<BossimPaths | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveBossimPaths().then((resolved) => {
      if (!cancelled) {
        setPaths(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return paths;
}
