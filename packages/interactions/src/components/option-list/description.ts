export const OPTION_LIST_DESCRIPTION = `\
option_list: Offer the user a short, single-screen list of options.

Use when you need a single quick pick (or a small multi-pick) from a concise
set of mutually comparable items. For multi-step, branching or long flows,
prefer \`question_flow\`.

Payload shape:
{
  "id": "<stable id unique in this conversation>",
  "title": "Optional title",
  "description": "Optional help text",
  "selectionMode": "single" | "multi",
  "minSelections": 1,
  "maxSelections": 3,
  "options": [
    { "id": "<option-id>", "label": "...", "description": "..." }
  ]
}

The user response arrives as interaction_response whose \`data.selected\` is
the list of chosen option ids, e.g. \`{ "selected": ["prod"] }\`.`;
