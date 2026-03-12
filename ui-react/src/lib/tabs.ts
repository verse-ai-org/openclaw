import {
  BarChart,
  Bug,
  FileText,
  FolderOpen,
  Link,
  Loader,
  MessageSquare,
  Monitor,
  Radio,
  ScrollText,
  Settings,
  Zap,
} from "lucide-react";
import type { Tab } from "@/types/gateway";

export function tabIcon(tab: Tab) {
  switch (tab) {
    case "chat":
      return MessageSquare;
    case "overview":
      return BarChart;
    case "channels":
      return Link;
    case "instances":
      return Radio;
    case "sessions":
      return FileText;
    case "usage":
      return BarChart;
    case "cron":
      return Loader;
    case "agents":
      return FolderOpen;
    case "skills":
      return Zap;
    case "nodes":
      return Monitor;
    case "config":
      return Settings;
    case "debug":
      return Bug;
    case "logs":
      return ScrollText;
    default:
      return FolderOpen;
  }
}

export function tabLabel(tab: Tab): string {
  const labels: Record<Tab, string> = {
    chat: "Chat",
    overview: "Overview",
    channels: "Channels",
    instances: "Instances",
    sessions: "Sessions",
    usage: "Usage",
    cron: "Cron",
    agents: "Agents",
    skills: "Skills",
    nodes: "Nodes",
    config: "Config",
    debug: "Debug",
    logs: "Logs",
  };
  return labels[tab] ?? tab;
}
