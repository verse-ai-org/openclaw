import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export { PluginsPage } from "./PluginsPage";
export { SkillsPage } from "./SkillsPage";
export { OverviewPage } from "./OverviewPage";
export { ChannelsPage } from "./ChannelsPage";
export { AgentsPage } from "./AgentsPage";
export { CronPage } from "./CronPage";
export { ScheduledTasksPage } from "./ScheduledTasksPage";
export { ConfigPage } from "./ConfigPage";
export { DebugPage } from "./DebugPage";
export { LogsPage } from "./LogsPage";
export function InstancesPage() {
  return <PlaceholderPage tab="instances" />;
}
export function SessionsPage() {
  return <PlaceholderPage tab="sessions" />;
}
export function UsagePage() {
  return <PlaceholderPage tab="usage" />;
}
export function NodesPage() {
  return <PlaceholderPage tab="nodes" />;
}
