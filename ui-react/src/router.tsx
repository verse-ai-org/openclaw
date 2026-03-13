import { createBrowserRouter, Navigate } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ChatPage } from "@/pages/ChatPage";
import { DebugPage } from "@/pages/DebugPage";
import {
  AgentsPage,
  ChannelsPage,
  ConfigPage,
  CronPage,
  InstancesPage,
  LogsPage,
  NodesPage,
  OverviewPage,
  SessionsPage,
  SkillsPage,
  UsagePage,
} from "@/pages/index";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      // Default redirect to chat
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: "chat", element: <ChatPage /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "channels", element: <ChannelsPage /> },
      { path: "instances", element: <InstancesPage /> },
      { path: "sessions", element: <SessionsPage /> },
      { path: "usage", element: <UsagePage /> },
      { path: "cron", element: <CronPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "skills", element: <SkillsPage /> },
      { path: "nodes", element: <NodesPage /> },
      { path: "config", element: <ConfigPage /> },
      { path: "debug", element: <DebugPage /> },
      { path: "logs", element: <LogsPage /> },
    ],
  },
]);
