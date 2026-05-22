import type { CronJob } from "@/types/agents";

/** Keep in sync with `src/memory-host-sdk/dreaming.ts`. */
export const MANAGED_MEMORY_DREAMING_CRON_NAME = "Memory Dreaming Promotion";
export const MANAGED_MEMORY_DREAMING_CRON_TAG = "[managed-by=memory-core.short-term-promotion]";
export const MEMORY_DREAMING_SYSTEM_EVENT_TEXT =
  "__openclaw_memory_core_short_term_promotion_dream__";

const LEGACY_LIGHT_DREAMING_CRON_NAME = "Memory Light Dreaming";
const LEGACY_LIGHT_DREAMING_CRON_TAG = "[managed-by=memory-core.dreaming.light]";
const LEGACY_LIGHT_DREAMING_EVENT_TEXT = "__openclaw_memory_core_light_sleep__";

const LEGACY_REM_DREAMING_CRON_NAME = "Memory REM Dreaming";
const LEGACY_REM_DREAMING_CRON_TAG = "[managed-by=memory-core.dreaming.rem]";
const LEGACY_REM_DREAMING_EVENT_TEXT = "__openclaw_memory_core_rem_sleep__";

function resolveDreamingPayloadToken(job: CronJob): string | undefined {
  if (job.payload.kind === "systemEvent") {
    return job.payload.text.trim() || undefined;
  }
  if (job.payload.kind === "agentTurn") {
    return job.payload.message.trim() || undefined;
  }
  return undefined;
}

/** System-managed memory-core dreaming cron jobs (not user-created tasks). */
export function isManagedMemoryDreamingCronJob(job: CronJob): boolean {
  const description = job.description?.trim();
  if (
    description?.includes(MANAGED_MEMORY_DREAMING_CRON_TAG) ||
    description?.includes(LEGACY_LIGHT_DREAMING_CRON_TAG) ||
    description?.includes(LEGACY_REM_DREAMING_CRON_TAG)
  ) {
    return true;
  }

  const name = job.name.trim();
  const token = resolveDreamingPayloadToken(job);
  if (name === MANAGED_MEMORY_DREAMING_CRON_NAME && token === MEMORY_DREAMING_SYSTEM_EVENT_TEXT) {
    return true;
  }
  if (name === LEGACY_LIGHT_DREAMING_CRON_NAME && token === LEGACY_LIGHT_DREAMING_EVENT_TEXT) {
    return true;
  }
  return name === LEGACY_REM_DREAMING_CRON_NAME && token === LEGACY_REM_DREAMING_EVENT_TEXT;
}

export function filterUserVisibleCronJobs(jobs: CronJob[]): CronJob[] {
  return jobs.filter((job) => !isManagedMemoryDreamingCronJob(job));
}
