import { useState } from "react";
import { SetupWizard } from "@/components/setup-wizard";

/**
 * Setup Wizard 集成示例
 *
 * 这个文件展示了如何在你的应用中集成 Setup Wizard
 */

// 方案 1: 作为独立页面
export function SetupPage() {
  return (
    <div>
      <SetupWizard />
    </div>
  );
}

// 方案 2: 条件渲染（首次用户）
export function AppWithSetupCheck() {
  const [setupComplete] = useState(() => {
    // 从 localStorage 检查是否已完成设置
    return localStorage.getItem("openclaw-setup-complete") === "true";
  });

  if (!setupComplete) {
    return (
      <div>
        <SetupWizard />
        {/* 在 wizard 完成时调用 */}
        {/* onComplete={() => {
          localStorage.setItem('openclaw-setup-complete', 'true');
          setSetupComplete(true);
        }} */}
      </div>
    );
  }

  return <MainApp />;
}

// 方案 3: 模态框中的 Setup Wizard
export function AppWithSetupModal() {
  const [showSetup, setShowSetup] = useState(false);

  return (
    <div>
      <MainApp />
      {showSetup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <SetupWizard />
          </div>
        </div>
      )}
      <button
        onClick={() => setShowSetup(true)}
        className="fixed bottom-4 right-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        重新配置
      </button>
    </div>
  );
}

// 方案 4: 路由集成
export const setupRoutes = [
  {
    path: "/setup",
    element: <SetupPage />,
    meta: {
      title: "Setup Wizard",
      requiresAuth: false,
    },
  },
];

// 示例主应用
function MainApp() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">欢迎使用 OpenClaw</h1>
      <p className="text-slate-600 mt-2">设置已完成，你可以开始使用了！</p>
    </div>
  );
}

export default AppWithSetupCheck;
