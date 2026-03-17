// Main component
export { SetupWizard } from './components/setup-wizard/index';
export { WizardContainer } from './components/setup-wizard/WizardContainer';

// Sub-components
export { Header } from './components/setup-wizard/Header';
export { ProgressBar } from './components/setup-wizard/ProgressBar';
export { GlassCard } from './components/setup-wizard/GlassCard';

// Steps
export { WelcomeStep } from './components/setup-wizard/steps/WelcomeStep';
export { SecurityStep } from './components/setup-wizard/steps/SecurityStep';
export { ModelSelectionStep } from './components/setup-wizard/steps/ModelSelectionStep';
export { ApiKeyStep } from './components/setup-wizard/steps/ApiKeyStep';
export { OptionalFeaturesStep } from './components/setup-wizard/steps/OptionalFeaturesStep';
export { CompletionStep } from './components/setup-wizard/steps/CompletionStep';

// Store
export { useWizardStore } from './store/setup-wizard.store';

// Adapters
export { WebWizardAdapter } from './adapters/WebWizardAdapter';
export { ElectronWizardAdapter } from './adapters/ElectronWizardAdapter';
export type { WizardAdapter, WebAdapterConfig, ElectronAdapterConfig } from './types/adapter';

// Context
export { AdapterProvider, useWizardAdapter } from './context/AdapterContext';

// Types
export type { WizardStep } from './types/index';
