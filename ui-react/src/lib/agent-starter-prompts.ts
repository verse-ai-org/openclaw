/**
 * Per-agent welcome copy and starter prompt cards (built-in agents only).
 * Custom agents without an entry get a simple welcome with no cards.
 */

export type AgentStarterPrompt = {
  title: string;
  subtitle?: string;
  /** Full user message sent when the card is clicked. */
  message: string;
};

export type AgentWelcomeConfig = {
  /** Shown below identity.name on the empty thread welcome screen. */
  headline: string;
  prompts: AgentStarterPrompt[];
};

const MAIN_WELCOME: AgentWelcomeConfig = {
  headline: "旅行规划、文档办公、日常问题，都可以从这里开始",
  prompts: [
    {
      title: "处理文档",
      subtitle: "Word / Excel / PPT / PDF",
      message:
        "我需要处理办公文档：说明要做的文件类型（Word、Excel、PPT 或 PDF）和内容要点，请直接生成或整理成可分享的成品。",
    },
    {
      title: "规划旅行",
      subtitle: "线路规划 + 机酒交通 + 每日行程",
      message:
        "帮我规划一次川西5日游",
    },
    {
      title: "出差一条龙",
      subtitle: "行程表 + 差旅说明文档",
      message:
        "下周我要出差：请先帮我规划往返交通、酒店和每日安排，再整理一份 Word 差旅说明（含日程表和注意事项）。",
    },
    {
      title: "快速答疑",
      subtitle: "概念讲解或排错思路",
      message:
        "我遇到一个具体问题（概念不懂或代码/工具报错）：请用通俗语言解释原因，并给出可操作的解决步骤或示例。",
    },
  ],
};

const TRAVEL_PLANNER_WELCOME: AgentWelcomeConfig = {
  headline: "想去哪儿玩？跟我说说就行",
  prompts: [
    {
      title: "规划五日游",
      subtitle: "6月份去川西",
      message: "帮我规划一个 5 天川西行程，包含路线规划、每日路书，总预算约 10000 元。",
    },
    {
      title: "查机票酒店",
      subtitle: "下周北京往返成都",
      message: "帮我查下周北京往返成都的航班和市中心酒店方案，并比较 2–3 个性价比选项。",
    },
    {
      title: "亲子轻松游",
      subtitle: "东京 4 日攻略",
      message: "帮我做一份适合带孩子的东京 4 日轻松行程，节奏不要太满，含交通和亲子友好景点。",
    },
    {
      title: "周末短途",
      subtitle: "巴黎两日美食+博物馆",
      message: "帮我规划巴黎周末两日游：以美食和博物馆为主，含交通建议和预约提示。",
    },
  ],
};

const OFFICE_HELPER_WELCOME: AgentWelcomeConfig = {
  headline: "今天要处理什么文档？",
  prompts: [
    {
      title: "做演示文稿",
      subtitle: "产品发布 10 页 PPT",
      message: "请生成一份 10 页左右的产品发布 PPT，风格专业简洁，含封面、亮点、路线图和 Q&A 页。",
    },
    {
      title: "写项目提案",
      subtitle: "Word + 预算表 + PPT",
      message:
        "请帮我创建一份项目提案：Word 正文含背景与计划，附 Excel 预算表，并生成 8–10 页 PPT 摘要版。",
    },
    {
      title: "做数据汇总",
      subtitle: "Excel 图表与分析",
      message: "请根据销售数据做 Excel 汇总表，包含同比环比、分类占比和 2–3 个直观图表。",
    },
    {
      title: "文档转换",
      subtitle: "Word 排版后导出 PDF",
      message: "请把这份 Word 文档统一排版（标题层级、页眉页脚、目录），并导出为适合分享的 PDF。",
    },
  ],
};

/** Built-in agent ids with starter cards. */
export const AGENT_WELCOME_BY_ID: Readonly<Record<string, AgentWelcomeConfig>> = {
  main: MAIN_WELCOME,
  "travel-planner": TRAVEL_PLANNER_WELCOME,
  "my-office-helper": OFFICE_HELPER_WELCOME,
};

export function getAgentWelcomeConfig(agentId: string): AgentWelcomeConfig | null {
  return AGENT_WELCOME_BY_ID[agentId] ?? null;
}

/**
 * Resolve agent id from a gateway session key.
 * Legacy `main` maps to `defaultAgentId` (usually `main`).
 */
export function parseAgentIdFromSessionKey(
  sessionKey: string,
  defaultAgentId = "main",
): string {
  const trimmed = sessionKey.trim();
  const parts = trimmed.split(":");
  if (parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  if (!trimmed || trimmed === "main") {
    return defaultAgentId;
  }
  return trimmed;
}
