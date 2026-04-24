import type { InteractiveSummaryPair } from "@/store/chat.store";

const QA_BLOCK_RE = /Q:\s*(.+?)\nA:\s*([\s\S]*?)(?=\n\nQ:\s*|$)/g;

export function formatQaDisplayText(pairs: InteractiveSummaryPair[]): string {
  return pairs
    .map((pair) => `Q: ${pair.question}\nA: ${pair.answer || "—"}`)
    .join("\n\n");
}

export function parseQaPairsFromMessage(content: string): InteractiveSummaryPair[] {
  const pairs: InteractiveSummaryPair[] = [];
  for (const match of content.matchAll(QA_BLOCK_RE)) {
    const question = (match[1] ?? "").trim();
    const answer = (match[2] ?? "").trim();
    if (!question) {
      continue;
    }
    pairs.push({ question, answer: answer || "—" });
  }
  return pairs;
}
