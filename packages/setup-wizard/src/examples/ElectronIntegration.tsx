/**
 * Electron 平台集成示例
 * 
 * 在 Electron 应用中使用 setup-wizard 的方式
 */

import { SetupWizard, ElectronWizardAdapter } from '@openclaw/setup-wizard';

/**
 * 示例：在 Electron 应用中集成 setup-wizard
 */
export function SetupWizardPage() {
  // 创建 Electron 适配器
  const adapter = new ElectronWizardAdapter({
    onComplete: async () => {
      // 向导完成后的处理
      console.log('Setup wizard completed');
      // 通知主进程向导已完成
      await window.electronBridge.notifyOnboardingComplete();
    },
    onCancel: async () => {
      // 取消向导的处理
      console.log('Setup wizard cancelled');
      await window.electronBridge.notifyOnboardingComplete();
    },
  });

  return <SetupWizard adapter={adapter} />;
}

/**
 * 示例：完整的 Electron 应用集成
 * 
 * 这是一个完整的示例，展示如何在 Electron 应用中处理
 * 加载、错误和完成状态
 */
export function ElectronSetupApp() {
  const [state, setState] = React.useState<'loading' | 'wizard' | 'done' | 'error'>('loading');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // 初始化适配器
    const adapter = new ElectronWizardAdapter({
      onComplete: async () => {
        setState('done');
      },
    });

    // 验证 electronBridge 可用
    if (!window.electronBridge) {
      setError('Electron bridge not available');
      setState('error');
      return;
    }

    setState('wizard');
  }, []);

  if (state === 'loading') {
    return <div>Loading...</div>;
  }

  if (state === 'error') {
    return <div>Error: {error}</div>;
  }

  if (state === 'done') {
    return <div>Setup complete!</div>;
  }

  const adapter = new ElectronWizardAdapter({
    onComplete: async () => {
      setState('done');
    },
  });

  return <SetupWizard adapter={adapter} />;
}
