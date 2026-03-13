import { PlaceholderPage } from "@/components/layout/PlaceholderPage";
export { SkillsPage } from "./SkillsPage";
export function OverviewPage() {
  return <PlaceholderPage tab="overview" />;
}
export function ChannelsPage() {
  return <PlaceholderPage tab="channels" />;
}
export function InstancesPage() {
  return <PlaceholderPage tab="instances" />;
}
export function SessionsPage() {
  return <PlaceholderPage tab="sessions" />;
}
export function UsagePage() {
  return <PlaceholderPage tab="usage" />;
}
export function CronPage() {
  return <PlaceholderPage tab="cron" />;
}
export function AgentsPage() {
  return <PlaceholderPage tab="agents" />;
}
// SkillsPage is now a real implementation — re-exported above
export function NodesPage() {
  return <PlaceholderPage tab="nodes" />;
}
export function ConfigPage() {
  return <PlaceholderPage tab="config" />;
}
export function DebugPage() {
  return <PlaceholderPage tab="debug" />;
}
export function LogsPage() {
  return <PlaceholderPage tab="logs" />;
}
