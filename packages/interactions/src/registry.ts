import { APPROVAL_CARD_MANIFEST } from "./components/approval-card/index.ts";
import { OPTION_LIST_MANIFEST } from "./components/option-list/index.ts";
import { QUESTION_FLOW_MANIFEST } from "./components/question-flow/index.ts";
import type { InteractionComponentManifest } from "./types.ts";

/**
 * Canonical registry of all interaction components available to the LLM.
 *
 * Insertion order also dictates the order that `renderInteractionRegistrySystemPrompt`
 * emits — keep it stable.
 */
export const INTERACTION_REGISTRY = {
  [QUESTION_FLOW_MANIFEST.name]: QUESTION_FLOW_MANIFEST,
  [OPTION_LIST_MANIFEST.name]: OPTION_LIST_MANIFEST,
  [APPROVAL_CARD_MANIFEST.name]: APPROVAL_CARD_MANIFEST,
};

export function getInteractionManifest(name: string): InteractionComponentManifest | undefined {
  return INTERACTION_REGISTRY[name] as InteractionComponentManifest | undefined;
}

export function listInteractionManifests(): InteractionComponentManifest[] {
  return Object.values(INTERACTION_REGISTRY) as InteractionComponentManifest[];
}

/**
 * Render the registry as a system-prompt block that teaches the LLM how to
 * emit `<ask>` tags. Replaces the former tool-description injection.
 */
export function renderInteractionRegistrySystemPrompt(options?: {
  allowlist?: ReadonlySet<string>;
}): string {
  const manifests = listInteractionManifests().filter((m) =>
    options?.allowlist ? options.allowlist.has(m.name) : true,
  );
  if (manifests.length === 0) {
    return "";
  }

  const body = manifests
    .map((m) => {
      const example = m.exampleRequest
        ? `\nExample:\n<ask component="${m.name}" id="${(m.exampleRequest as { id?: string }).id ?? "example-id"}">\n${JSON.stringify(
            m.exampleRequest,
            null,
            2,
          )}\n</ask>`
        : "";
      return `### ${m.name}\n${m.description}${example}`;
    })
    .join("\n\n");

  return [
    "## Interactive UI (<ask>)",
    "",
    "When you need structured input from the human, emit an `<ask>` tag with a",
    "registered component. Do NOT call a tool — `<ask>` suspends your turn until",
    "the human responds. Each `<ask>` MUST include:",
    "",
    "- `component` attribute: one of the components listed below.",
    "- `id` attribute: a unique id for this interaction (reuse for edits).",
    "- Body: a single JSON object matching that component's payload shape.",
    "",
    "When the user answers, you'll receive an `interaction_response` message",
    "referencing the same `id`. Do not try to parse free text as an answer.",
    "",
    body,
  ].join("\n");
}
