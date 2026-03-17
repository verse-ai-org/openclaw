import type { ReactNode } from 'react';
import type { WizardAdapter } from '../../types/adapter';
import { AdapterProvider } from '../../context/AdapterContext';
import { WizardContainer } from './WizardContainer';

export interface SetupWizardProps {
  adapter?: WizardAdapter;
  children?: ReactNode;
}

export function SetupWizard({ adapter, children }: SetupWizardProps) {
  const content = (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <WizardContainer />
      {children}
    </div>
  );

  if (adapter) {
    return (
      <AdapterProvider adapter={adapter}>
        {content}
      </AdapterProvider>
    );
  }

  return content;
}

export default SetupWizard;
