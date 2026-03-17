/**
 * Web Setup Wizard 页面组件
 * 
 * 在 Web 应用中集成 setup-wizard 的完整示例
 */

import { useState, useEffect } from 'react';
import { SetupWizard, WebWizardAdapter } from '@openclaw/setup-wizard';

interface SetupWizardPageProps {
  apiEndpoint?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

type PageState = 'loading' | 'wizard' | 'success' | 'error';

interface ErrorState {
  message: string;
  code?: string;
}

/**
 * Setup Wizard 页面
 * 
 * 使用方式：
 * <SetupWizardPage 
 *   apiEndpoint="/api/wizard"
 *   onComplete={() => navigate('/dashboard')}
 *   onCancel={() => navigate('/')}
 * />
 */
export function SetupWizardPage({
  apiEndpoint = '/api/wizard',
  onComplete,
  onCancel,
}: SetupWizardPageProps) {
  const [state, setState] = useState<PageState>('loading');
  const [error, setError] = useState<ErrorState | null>(null);
  const [adapter, setAdapter] = useState<WebWizardAdapter | null>(null);

  // 初始化适配器
  useEffect(() => {
    const initAdapter = async () => {
      try {
        const newAdapter = new WebWizardAdapter({
          apiEndpoint,
          onComplete: () => {
            setState('success');
            // 延迟调用 onComplete，给 UI 时间显示成功状态
            setTimeout(() => {
              onComplete?.();
            }, 1500);
          },
          onCancel: () => {
            onCancel?.();
          },
        });

        setAdapter(newAdapter);
        setState('wizard');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError({
          message,
          code: 'INIT_ERROR',
        });
        setState('error');
      }
    };

    initAdapter();
  }, [apiEndpoint, onComplete, onCancel]);

  // 加载中
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Initializing setup wizard...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6">
            <div className="text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">Setup Error</h1>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                {error?.message || 'An error occurred while initializing the setup wizard.'}
              </p>
              {error?.code && (
                <p className="text-sm text-slate-500 mb-6">Error code: {error.code}</p>
              )}
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-semibold"
              >
                Retry
              </button>
              <button
                onClick={() => onCancel?.()}
                className="w-full mt-3 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 成功状态
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block mb-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <span className="text-4xl">✓</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Setup Complete
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Your setup is complete. Redirecting to dashboard...
          </p>
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  // 向导状态
  return (
    <div className="min-h-screen bg-background">
      {adapter && <SetupWizard adapter={adapter} />}
    </div>
  );
}

export default SetupWizardPage;
