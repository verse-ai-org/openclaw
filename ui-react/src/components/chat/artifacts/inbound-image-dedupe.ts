/** Basename from `media://inbound/...` or a plain filename. */
export function inboundImageBasename(value: string): string {
  const trimmed = value.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/** Collapse OpenClaw inbound `name---uuid.ext` suffixes for display dedupe. */
export function inboundImageStem(value: string): string {
  const base = inboundImageBasename(value).toLowerCase();
  const dash = base.indexOf("---");
  const stem = dash >= 0 ? base.slice(0, dash) : base;
  const dot = stem.lastIndexOf(".");
  return dot >= 0 ? stem.slice(0, dot) : stem;
}

export function inboundImagesMatch(a: string, b: string): boolean {
  const left = inboundImageBasename(a).toLowerCase();
  const right = inboundImageBasename(b).toLowerCase();
  if (left === right) {
    return true;
  }
  const leftStem = inboundImageStem(a);
  const rightStem = inboundImageStem(b);
  if (leftStem.length > 0 && leftStem === rightStem) {
    return true;
  }
  return left.startsWith(`${rightStem}.`) || right.startsWith(`${leftStem}.`);
}

export function inboundImageSeen(seen: Set<string>, candidate: string): boolean {
  for (const key of seen) {
    if (inboundImagesMatch(key, candidate)) {
      return true;
    }
  }
  return false;
}

export function inboundImageRemember(seen: Set<string>, candidate: string): void {
  seen.add(inboundImageBasename(candidate).toLowerCase());
}
