export type WizardStep = 'welcome' | 'security' | 'model' | 'api-key' | 'features' | 'completion';

export interface WizardState {
  currentStep: WizardStep;
  isComplete: boolean;
}
