import type { CronJob } from "@/types/agents";

/** Agent prompt text from a cron job payload, if any. */
export function getCronJobAgentPrompt(job: CronJob): string {
  if (job.payload.kind !== "agentTurn") {
    return "";
  }
  return job.payload.message?.trim() ?? "";
}
