/**
 * Web 平台集成示例
 * 
 * 在 web 应用中使用 setup-wizard 的方式
 */

import { SetupWizard, WebWizardAdapter } from '@openclaw/setup-wizard';

/**
 * 示例：在 web 应用中集成 setup-wizard
 */
export function SetupWizardPage() {
  // 创建 Web 适配器
  const adapter = new WebWizardAdapter({
    apiEndpoint: '/api/wizard',
    onComplete: () => {
      // 向导完成后的处理
      console.log('Setup wizard completed');
      // 可以在这里导航到主应用或刷新页面
      window.location.href = '/dashboard';
    },
    onCancel: () => {
      // 取消向导的处理
      console.log('Setup wizard cancelled');
    },
  });

  return <SetupWizard adapter={adapter} />;
}

/**
 * 示例：不使用适配器（本地模式，仅用于开发/演示）
 */
export function SetupWizardDemo() {
  return <SetupWizard />;
}
