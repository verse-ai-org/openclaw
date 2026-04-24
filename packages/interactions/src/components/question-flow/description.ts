export const QUESTION_FLOW_DESCRIPTION = `\
question_flow: Ask the user a sequence of structured choice questions.

Use when you need several related pieces of information from the user and a
linear step-by-step flow helps them commit to each decision. Each step has a
title, optional description, and a list of options. Set \`selectionMode\` to
\`multi\` when the user can pick more than one option per step, otherwise leave
it unset (or use \`single\`).

Payload shape:
{
  "id": "<stable id unique in this conversation>",
  "steps": [
    {
      "id": "<step-id>",
      "title": "...",
      "description": "...",
      "selectionMode": "single" | "multi",
      "options": [
        { "id": "<option-id>", "label": "...", "description": "..." }
      ]
    }
  ]
}

The user response will be delivered back to you as an interaction_response
message whose \`data.answers\` is a mapping from step id to the list of chosen
option ids, e.g. \`{ "target": ["prod"], "flags": ["verbose", "dry-run"] }\`.`;
