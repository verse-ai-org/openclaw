import { createHashRouter, Navigate } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { ChatPage } from "@/pages/ChatPage";
import { ScheduledTasksPage } from "@/pages/ScheduledTasksPage";
import { ProfilePage } from "@/pages/ProfilePage";
import {
  AgentsPage,
  ChannelsPage,
  ConfigPage,
  CronPage,
  OverviewPage,
  PluginsPage,
  SkillsPage
} from "@/pages/index";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      // Default redirect to chat
      { index: true, element: <Navigate to="/employees" replace /> },
      { path: "chat", element: <ChatPage /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "channels", element: <ChannelsPage /> },
      { path: "cron", element: <CronPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "employees", element: <AgentsPage /> },
      { path: "skills", element: <SkillsPage /> },
      { path: "automation", element: <ScheduledTasksPage /> },
      { path: "plugins", element: <PluginsPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "settings", element: <ConfigPage /> }
    ],
  },
])
