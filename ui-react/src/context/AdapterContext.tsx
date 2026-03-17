import { createContext, useContext, type ReactNode } from 'react';
import type { WizardAdapter } from '../types/adapter';

const AdapterContext = createContext<WizardAdapter | null>(null);

export interface AdapterProviderProps {
  adapter: WizardAdapter;
  children: ReactNode;
}

export function AdapterProvider({ adapter, children }: AdapterProviderProps) {
  return (
    <AdapterContext.Provider value={adapter}>
      {children}
    </AdapterContext.Provider>
  );
}

export function useWizardAdapter(): WizardAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) {
    throw new Error(
      'useWizardAdapter must be used within AdapterProvider. ' +
      'Wrap your SetupWizard component with <AdapterProvider adapter={...}>'
    );
  }
  return adapter;
}

/**
 * Like useWizardAdapter but returns null instead of throwing when there is no
 * AdapterProvider in the tree (e.g. web-only / standalone rendering).
 */
export function useOptionalWizardAdapter(): WizardAdapter | null {
  return useContext(AdapterContext);
}
