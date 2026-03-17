/**
 * Web Setup Wizard 完整示例应用
 * 
 * 这是一个完整的示例，展示如何在 Web 应用中集成 setup-wizard
 */

import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { SetupWizardPage } from '@openclaw/setup-wizard';

/**
 * 主应用组件
 */
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/setup" element={<SetupWizardRoute />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/" element={<HomePage />} />
      </Routes>
    </Router>
  );
}

/**
 * Setup Wizard 路由
 */
function SetupWizardRoute() {
  const navigate = useNavigate();

  return (
    <SetupWizardPage
      apiEndpoint={`${process.env.REACT_APP_API_URL || ''}/api/wizard`}
      onComplete={() => {
        // 向导完成后导航到仪表板
        navigate('/dashboard');
      }}
      onCancel={() => {
        // 取消向导后导航到首页
        navigate('/');
      }}
    />
  );
}

/**
 * 仪表板页面
 */
function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
          Dashboard
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Setup wizard completed successfully!
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Configuration
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Your setup configuration has been saved.
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Gateway
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Gateway is running and ready to use.
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Status
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              All systems operational.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 首页
 */
function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-slate-900 dark:text-white mb-4">
            Welcome to OpenClaw
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">
            Your personal AI assistant, helping you anytime, anywhere.
          </p>
          <button
            onClick={() => navigate('/setup')}
            className="px-8 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold text-lg"
          >
            Start Setup
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-8">
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Quick Setup
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Get started in minutes with our guided setup wizard.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-8">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Secure
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Your data is encrypted and stored securely.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-8">
            <div className="text-4xl mb-4">⚡</div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Fast
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Lightning-fast responses powered by AI.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
