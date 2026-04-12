import {
  BarChart,
  Bug,
  CalendarClock,
  FileText,
  FolderOpen,
  Rss,
  Blocks,
  Loader,
  MessageSquare,
  Monitor,
  Radio,
  ScrollText,
  Settings,
  Zap,
  UserRound,
} from "lucide-react";
import type { Tab } from "@/types/gateway";

export function tabIcon(tab: Tab) {
  switch (tab) {
    case "chat":
      return MessageSquare;
    case "overview":
      return BarChart;
    case "channels":
      return Rss;
    case "instances":
      return Radio;
    case "sessions":
      return FileText;
    case "usage":
      return BarChart;
    case "cron":
      return Loader;
    case "scheduled-tasks":
      return CalendarClock;
    case "agents":
      return FolderOpen;
    case "employees":
      return UserRound;
    case "plugins":
      return Blocks;
    case "skills":
      return Zap;
    case "nodes":
      return Monitor;
    case "config":
      return Settings;
    case "settings":
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
    "scheduled-tasks": "Scheduled Tasks",
    agents: "Agents",
    employees: "Employees",
    plugins: "Plugins",
    skills: "Skills",
    nodes: "Nodes",
    config: "Config",
    settings: "Settings",
    debug: "Debug",
    logs: "Logs",
  };
  return labels[tab] ?? tab;
}
