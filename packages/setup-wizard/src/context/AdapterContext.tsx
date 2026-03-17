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
