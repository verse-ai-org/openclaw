/**
 * Central dispatcher that turns an `<ask>`-driven interaction request into a
 * channel-appropriate rendering.
 *
 * Channels without rich widget support (Telegram inline keyboards, Discord
 * custom_id buttons, Slack block_actions) get a plain numbered-text fallback;
 * callers can still paste option ids back through `chat.interactionRespond`.
 *
 * This module is intentionally pure — no I/O, no channel side-effects. Each
 * per-channel integration translates the returned `InteractionChannelRender`
 * into its native wire format (see `src/channels/<provider>/*`) and parses
 * inbound user actions back into an `InteractionResponseDraft`.
 */

import {
  getInteractionManifest,
  renderQuestionFlowDowngrade,
  renderOptionListDowngrade,
  parseQuestionFlowDowngradeCallback,
  parseOptionListDowngradeCallback,
  type InteractionDowngradeRender,
} from "@openclaw/interactions";

/**
 * High-level channel capability classes used to pick a rendering strategy.
 * The stringly-typed channel capabilities array (`resolveChannelCapabilities`)
 * is mapped to this set up-front so downstream code doesn't re-scan it.
 */
export type InteractionChannelMode =
  | "inline_keyboard"
  | "numbered_text"
  | "reject";

export interface InteractionChannelCapabilities {
  supportsInlineKeyboard: boolean;
  supportsTextReply: boolean;
}

/**
 * Map the stringly-typed channel capabilities (as returned by
 * `resolveChannelCapabilities`) into the interaction-downgrade capability
 * struct. Unknown capability strings are ignored.
 */
export function toInteractionCapabilities(
  caps: readonly string[] | undefined,
): InteractionChannelCapabilities {
  const set = new Set(caps ?? []);
  return {
    supportsInlineKeyboard:
      set.has("inline_keyboard") ||
      set.has("inline_buttons") ||
      set.has("inlineButtons") ||
      set.has("block_actions"),
    supportsTextReply: !set.has("no_text_reply"),
  };
}

export function pickInteractionChannelMode(
  caps: InteractionChannelCapabilities,
): InteractionChannelMode {
  if (caps.supportsInlineKeyboard) return "inline_keyboard";
  if (caps.supportsTextReply) return "numbered_text";
  return "reject";
}

export interface InteractionChannelRender {
  mode: InteractionChannelMode;
  interactionId: string;
  component: string;
  /** Human-readable text fallback; always present (empty string if reject). */
  text: string;
  /** Structured keyboard groups for `inline_keyboard` mode. */
  keyboard?: InteractionDowngradeRender["keyboard"];
}

/**
 * Render an interaction request for a specific channel.
 *
 * Returns `null` if the component is unknown — callers should treat this as a
 * hard error (the LLM asked for something the registry doesn't know).
 */
export function renderInteractionForChannel(params: {
  interactionId: string;
  component: string;
  payload: unknown;
  capabilities: InteractionChannelCapabilities;
}): InteractionChannelRender | null {
  const { interactionId, component, payload, capabilities } = params;
  const manifest = getInteractionManifest(component);
  if (!manifest) return null;

  const mode = pickInteractionChannelMode(capabilities);

  // Per-component rendering. Kept as a simple switch since we currently have
  // two components; migrate to registry-level render adapters once we grow
  // past three or four.
  let rendered: InteractionDowngradeRender | null = null;
  if (component === "question_flow") {
    const parsed = manifest.requestSchema.safeParse(payload);
    if (!parsed.success) return null;
    rendered = renderQuestionFlowDowngrade(parsed.data as never);
  } else if (component === "option_list") {
    const parsed = manifest.requestSchema.safeParse(payload);
    if (!parsed.success) return null;
    rendered = renderOptionListDowngrade(parsed.data as never);
  }

  if (!rendered) return null;

  return {
    mode,
    interactionId,
    component,
    text: rendered.text,
    keyboard: mode === "inline_keyboard" ? rendered.keyboard : undefined,
  };
}

// ---------------------------------------------------------------------------
// Inbound parsing
// ---------------------------------------------------------------------------

/**
 * Shape that `chat.interactionRespond` expects. Channel adapters build one of
 * these after parsing a native callback (Telegram callback_query, Discord
 * button interaction, Slack block_actions, or a numbered text reply).
 */
export interface InteractionResponseDraft {
  interactionId: string;
  status: "submitted" | "cancelled";
  data: unknown;
  responseBy?: { userId?: string; channel?: string };
}

/**
 * Parse a raw callback value (encoded by `renderInteractionForChannel`) into
 * a partial response. For multi-step components like `question_flow` the
 * channel integration must accumulate partials and only post the final draft
 * once every step has an answer.
 */
export function parseInteractionCallback(params: {
  component: string;
  value: string;
}): { stepId?: string; optionId: string } | null {
  const { component, value } = params;
  if (component === "question_flow") {
    return parseQuestionFlowDowngradeCallback(value);
  }
  if (component === "option_list") {
    return { optionId: parseOptionListDowngradeCallback(value) };
  }
  return null;
}

/**
 * Encode a stable payload id for embedding inside a channel-native button
 * value. Format: `<component>:<interactionId>:<stepId?>:<optionId>`.
 * Keeping the encoding centralized makes it easier to cap length for
 * channels with short callback_data limits (e.g. Telegram 64 bytes).
 */
export function encodeInteractionCallbackValue(params: {
  component: string;
  interactionId: string;
  stepId?: string;
  optionId: string;
}): string {
  const { component, interactionId, stepId, optionId } = params;
  if (stepId) {
    return `${component}:${interactionId}:${stepId}:${optionId}`;
  }
  return `${component}:${interactionId}:${optionId}`;
}

export function decodeInteractionCallbackValue(value: string): {
  component: string;
  interactionId: string;
  stepId?: string;
  optionId: string;
} | null {
  const parts = value.split(":");
  if (parts.length < 3) return null;
  const [component, interactionId, ...rest] = parts;
  if (!component || !interactionId) return null;
  if (rest.length === 1) {
    return { component, interactionId, optionId: rest[0]! };
  }
  if (rest.length >= 2) {
    return {
      component,
      interactionId,
      stepId: rest[0]!,
      optionId: rest.slice(1).join(":"),
    };
  }
  return null;
}
