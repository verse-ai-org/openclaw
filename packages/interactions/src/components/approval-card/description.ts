export const APPROVAL_CARD_DESCRIPTION = `\
approval_card: Ask the user to explicitly approve or deny an action.

Use when an operation is destructive, expensive, security-sensitive, or needs
explicit human confirmation before execution.

Payload shape:
{
  "id": "<stable id unique in this conversation>",
  "title": "<what needs approval>",
  "description": "Optional details",
  "icon": "Optional lucide icon name",
  "metadata": [{ "key": "...", "value": "..." }],
  "variant": "default" | "destructive",
  "confirmLabel": "Optional approve label",
  "cancelLabel": "Optional deny label"
}

The user response arrives as interaction_response whose \`data.decision\` is
\`"approved"\` or \`"denied"\`.`;
