import { stripMediaAttachedDisplayLines } from "./strip-media-attached-lines";

/** Keep in sync with `LEADING_TIMESTAMP_PREFIX_RE` in `src/auto-reply/reply/strip-inbound-meta.ts`. */
const LEADING_TIMESTAMP_PREFIX_RE = /^\[[A-Za-z]{3} \d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\]]*\] /;

/** Remove gateway `injectTimestamp` prefix from user-visible chat text. */
export function stripGatewayTimestampPrefix(message: string): string {
  return message.replace(LEADING_TIMESTAMP_PREFIX_RE, "");
}

/** Strip AI-facing inbound prefixes from gateway user rows for Control UI display. */
export function stripGatewayUserDisplayText(message: string): string {
  return stripGatewayTimestampPrefix(stripMediaAttachedDisplayLines(message));
}
