# Chat File Upload Current Solution

## Scope

- Focus on file upload in chat composer.
- Image upload is disabled for now.
- Keep current UI layout and interaction style unchanged.
- Surface validation errors before send.
- Product target:
  - default upload path is Channel A (reference mode)
  - Quick inline analyze (Channel B) is experimental and disabled by default

## Goals

- Reject unsupported files at selection/drop time, not after send.
- Keep all user-facing messages in English.
- Preserve chat history display behavior:
  - show user input text
  - show attachment tags
  - do not show full extracted attachment content in user bubble/history

## Frontend Behavior

### Entry and UI

- Keep existing composer structure (`+` button, input, send area).
- Keep attachment chip rendering style.
- Add helper hint under composer:
  - `Reference mode (default): up to 100 MB per file, 10 files max.`
  - `Quick inline analyze is experimental and disabled by default.`
- Add explicit inline error block in composer attachment area (`role="alert"`).

### Validation Timing

- Validate on file select (`input[type=file]` change capture).
- Validate on drag-and-drop (`drop` capture).
- Also validate in adapter `add()` as defense-in-depth.

### Validation Rules

- Image files are blocked:
  - `Image uploads are currently disabled.`
- Empty file blocked:
  - `Empty files are not supported: <fileName>`
- Size limit:
  - max 5 MB per file
  - `File is too large: <fileName>. Max size is 5MB.`
- MIME allowlist only:
  - `application/pdf`
  - `text/plain`
  - `text/markdown`
  - `text/html`
  - `text/csv`
  - `application/json`
  - `application/xml`
  - `application/msword`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `application/vnd.ms-excel`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `application/vnd.ms-powerpoint`
  - `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- Unsupported MIME:
  - `Unsupported file type: <fileName>`

### Payload Handling

- `send-payload` now ignores image content parts.
- Only text + file parts are parsed and sent.
- Frontend has an extra guard in runtime provider:
  - if any image MIME slips through, show error toast and stop send.

## Backend Behavior

### Gateway Validation

- Normalize RPC attachments first.
- Validate normalized attachments before further processing:
  - `mimeType` is required
  - image MIME is rejected
  - MIME must be in backend allowlist
- Reject invalid request with explicit error.

### Processing

- Keep existing document parse/extract path for supported files.
- Keep history sanitization path that strips extracted appendix for display.

## Files Updated

- `ui-react/src/providers/chat/adapters/gateway-attachment-adapter.ts`
- `ui-react/src/components/chat/Composer.tsx`
- `ui-react/src/providers/chat/send-payload.ts`
- `ui-react/src/providers/chat/send-payload.test.ts`
- `ui-react/src/providers/chat/GatewayChatRuntimeProvider.tsx`
- `src/gateway/server-methods/attachment-normalize.ts`
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-methods/server-methods.test.ts`
- `src/gateway/chat-attachments.test.ts`

## Test and Verification

- Build passes:
  - `pnpm build`
- Targeted tests pass:
  - gateway attachment validator tests
  - updated chat attachment tests aligned with strict MIME policy
- Lint for changed files passes.

## Known Trade-offs

- Image input is intentionally disabled in this phase.
- MIME-based policy may reject some files when browser MIME is missing or unexpected.
- Adapter and composer both validate (intentional duplication for UX + safety).

## Next Recommended Improvements

- Add max file count limit with explicit inline guidance.
- Centralize error copy into a shared constants module to avoid drift.
- Add e2e scenario for:
  - invalid file selection
  - inline error visibility
  - send-block behavior
  - history rendering without full extracted appendix text
