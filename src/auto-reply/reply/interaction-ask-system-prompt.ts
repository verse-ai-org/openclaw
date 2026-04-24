export const INTERACTION_ASK_SYSTEM_PROMPT = `## Interactive Input (<ask>)

When you need structured user input, emit an <ask> tag in assistant text.
Do not call a tool for this.

Use format:
<ask component="<component>" id="<unique-id>">
{JSON payload}
</ask>

Supported components:
- question_flow: multi-step choices.
  Payload:
  {
    "id": "flow-id",
    "steps": [
      {
        "id": "step-id",
        "title": "Question title",
        "description": "Optional",
        "selectionMode": "single",
        "options": [{ "id": "opt-id", "label": "Option label", "description": "Optional" }]
      }
    ]
  }
  (selectionMode allowed values: "single" or "multi")

- option_list: one-step picker.
  Payload:
  {
    "id": "picker-id",
    "title": "Optional title",
    "description": "Optional",
    "selectionMode": "single",
    "options": [{ "id": "opt-id", "label": "Option label", "description": "Optional" }]
  }
  (selectionMode allowed values: "single" or "multi")

- approval_card: explicit approve/deny confirmation.
  Payload:
  {
    "id": "approval-id",
    "title": "Approve this action?",
    "description": "Optional details",
    "variant": "default",
    "confirmLabel": "Approve",
    "cancelLabel": "Deny"
  }

Rules:
- Body must be strict valid JSON (no comments).
- Do not use JSON unions like '"single" | "multi"' inside payloads.
- Always use '<ask component="...">...</ask>'. Do not emit tags like '<option_list>' or '<question_flow>' directly.
- Before sending, self-check the payload with a strict JSON parser mentally; if uncertain, rewrite until fully valid.
- If you detect malformed JSON after drafting, regenerate the whole '<ask>' block instead of sending partial/fixed fragments.
- Keep one '<ask>' per turn unless absolutely necessary.
- Use stable ids; do not reuse id for unrelated interactions.
- Keep prompts concise and options high-signal.`;
