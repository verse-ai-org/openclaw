/**
 * WizardStep 类型，与服务端 src/wizard/session.ts 的定义对齐。
 */

export type WizardStepOption = {
  value: string;
  label?: string;
};

export type WizardStep = {
  id: string;
  title: string;
  subtitle?: string;
  type: "note" | "action" | "text" | "confirm" | "select" | "multiselect" | "progress";
  options?: WizardStepOption[];
  placeholder?: string;
  password?: boolean;
  done?: boolean;
  sessionId?: string;
};

export type WizardSession = {
  sessionId: string;
  step: WizardStep | null;
  done: boolean;
};

export type WizardStartResult = {
  sessionId: string;
  step: WizardStep | null;
  done: boolean;
  status?: string;
  error?: string;
};

export type WizardNextResult = {
  step: WizardStep | null;
  done: boolean;
  status?: string;
  error?: string;
};
