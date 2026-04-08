import { readJsonFromCliValue, runScript } from "./cli_args.mjs";

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/[,\s]/g, "");
  if (!normalized) return 0;
  if (normalized.endsWith("w"))
    return Math.round(Number.parseFloat(normalized.slice(0, -1)) * 10000);
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pickLikeCount(item) {
  return Math.max(
    toNumber(item?.like_count),
    toNumber(item?.liked_count),
    toNumber(item?.likedCount),
    toNumber(item?.interact_info?.liked_count),
    toNumber(item?.interactInfo?.likedCount),
    toNumber(item?.interaction?.likes),
    toNumber(item?.metrics?.likes),
  );
}

function isVideoNote(item) {
  const candidates = [
    String(item?.note_type || ""),
    String(item?.type || ""),
    String(item?.model_type || ""),
    String(item?.display_type || ""),
  ]
    .join(" ")
    .toLowerCase();
  return candidates.includes("视频") || candidates.includes("video");
}

function parseLoopFromText(text, destinationHint) {
  const cleaned = String(text || "").replace(/\s+/g, "");
  if (!cleaned) return [];
  const dayMatches = [...cleaned.matchAll(/(?:day|Day|DAY|第?\d+天)[：:：-]?([^。；;]+)/g)];
  if (dayMatches.length > 0) {
    const merged = dayMatches
      .map((m) => String(m[1] || "").trim())
      .filter(Boolean)
      .join("→");
    return parseLoopFromText(merged, destinationHint);
  }
  const delimiter = cleaned.includes("→")
    ? "→"
    : cleaned.includes("-")
      ? "-"
      : cleaned.includes("—")
        ? "—"
        : "";
  if (!delimiter) {
    return destinationHint ? [destinationHint] : [];
  }
  const parts = cleaned
    .split(delimiter)
    .map((part) =>
      part
        .replace(/[D天第\d日]/g, "")
        .replace(/[(（][^)）]*[)）]/g, "")
        .replace(/^\W+|\W+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return parts.length >= 2 ? parts : destinationHint ? [destinationHint] : [];
}

function inferTitle(item) {
  return String(item?.title || item?.displayTitle || item?.display_title || item?.name || "").trim();
}

function inferId(item) {
  return String(item?.id || item?.note_id || item?.noteId || "").trim();
}

function inferUrl(item, id) {
  const raw = String(item?.url || item?.note_url || item?.noteUrl || item?.share_url || "").trim();
  if (raw) return raw;
  if (id) return `https://www.xiaohongshu.com/explore/${id}`;
  return "";
}

function inferText(item) {
  return String(
    item?.desc || item?.description || item?.content || item?.note_content || inferTitle(item),
  ).trim();
}

export function buildXhsSearchQueries(destinationText, durationDays) {
  const d = Number.parseInt(String(durationDays || 0), 10);
  const dayPart = d > 0 ? `${d}天行程安排` : "行程安排";
  const destination = String(destinationText || "").trim();
  return [
    `J人${destination}${dayPart}`.trim(),
    `J人${destination}${dayPart}攻略`.trim(),
    `${destination}${dayPart}`.trim(),
  ].filter(Boolean);
}

export function buildXhsEvidence(input = {}) {
  const destinationText = String(input.destination_text || "").trim();
  const durationDays = Number.parseInt(String(input.duration_days || 0), 10) || 0;
  const searchResults = Array.isArray(input.search_results) ? input.search_results : [];

  const filtered = searchResults
    .filter((item) => !isVideoNote(item))
    .map((item) => {
      const id = inferId(item);
      return {
      id,
      title: inferTitle(item),
      url: inferUrl(item, id),
      like_count: pickLikeCount(item),
      text: inferText(item),
      note_type: String(item?.note_type || item?.type || item?.noteType || "").trim(),
    };
    })
    .filter((item) => item.url && item.title)
    .sort((a, b) => b.like_count - a.like_count);

  const top = filtered.slice(0, 3);
  const loops = top
    .map((item) => parseLoopFromText(item.text, destinationText))
    .filter((loop) => loop.length > 0);
  const stops = [...new Set(loops.flat())].filter(Boolean).slice(0, 10);

  return {
    query: {
      destination_text: destinationText,
      duration_days: durationDays,
      search_keywords: buildXhsSearchQueries(destinationText, durationDays),
      search_filters: {
        note_type: "图文",
        sort_by: "最多点赞",
      },
    },
    evidence_quality:
      top.length >= 2 && loops.length > 0 ? "high" : top.length > 0 ? "medium" : "low",
    generated_at: new Date().toISOString(),
    sources: top.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      like_count: item.like_count,
      note_type: item.note_type || "图文",
    })),
    route_hints: {
      popular_loops: loops,
      popular_stops: stops,
    },
    risk_hints: [],
    stay_hints: {
      recommended_bases: stops.slice(0, 3),
    },
    summary:
      top.length > 0
        ? `已选取 ${top.length} 篇高点赞图文笔记，用于路线框定。`
        : "未找到可用的小红书图文笔记。",
  };
}

runScript({
  name: "xhs-evidence-builder.mjs",
  description: "规范化小红书搜索结果，输出 xhs_evidence 对象供 route-plan 消费",
  usage: "node xhs-evidence-builder.mjs --input=<json|@file>",
  flags: [
    {
      name: "input",
      desc: "{ destination_text, duration_days, search_results[] } JSON 或 @文件路径",
    },
  ],
  required: ["input"],
  callerUrl: import.meta.url,
  run(args) {
    const payload = readJsonFromCliValue("input", args.input, undefined);
    console.log(JSON.stringify(buildXhsEvidence(payload), null, 2));
  },
});
