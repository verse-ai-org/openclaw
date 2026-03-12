import type { WizardStep, WizardStepOption } from "./types.ts";
import "./WizardStep.css";

type Props = {
  step: WizardStep;
  textValue: string;
  selectedValue: string | undefined;
  selectedValues: Set<string>;
  submitting: boolean;
  onTextChange: (value: string) => void;
  onSelectChange: (value: string) => void;
  onMultiselectChange: (values: Set<string>) => void;
  onSubmit: (value: unknown) => void;
};

export function WizardStepView({
  step,
  textValue,
  selectedValue,
  selectedValues,
  submitting,
  onTextChange,
  onSelectChange,
  onMultiselectChange,
  onSubmit,
}: Props) {
  const handleTextSubmit = () => {
    onSubmit(textValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !submitting) {
      handleTextSubmit();
    }
  };

  const handleOptionClick = (opt: WizardStepOption) => {
    if (step.type === "select") {
      onSelectChange(opt.value);
      onSubmit(opt.value);
    } else if (step.type === "multiselect") {
      const next = new Set(selectedValues);
      if (next.has(opt.value)) {
        next.delete(opt.value);
      } else {
        next.add(opt.value);
      }
      onMultiselectChange(next);
    }
  };

  if (step.type === "note" || step.type === "action") {
    return (
      <div className="wizard-step wizard-step--note">
        <button
          className="wizard-btn wizard-btn--primary"
          disabled={submitting}
          onClick={() => onSubmit(null)}
        >
          {submitting ? "Please wait…" : "Continue"}
        </button>
      </div>
    );
  }

  if (step.type === "text") {
    return (
      <div className="wizard-step wizard-step--text">
        <input
          className="wizard-input"
          type={step.password ? "password" : "text"}
          placeholder={step.placeholder ?? ""}
          value={textValue}
          disabled={submitting}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button
          className="wizard-btn wizard-btn--primary"
          disabled={submitting || !textValue.trim()}
          onClick={handleTextSubmit}
        >
          {submitting ? "Please wait…" : "Continue"}
        </button>
      </div>
    );
  }

  if (step.type === "confirm") {
    return (
      <div className="wizard-step wizard-step--confirm">
        <div className="wizard-confirm-buttons">
          <button
            className="wizard-btn wizard-btn--primary"
            disabled={submitting}
            onClick={() => onSubmit(true)}
          >
            {submitting ? "Please wait…" : "Yes"}
          </button>
          <button
            className="wizard-btn wizard-btn--secondary"
            disabled={submitting}
            onClick={() => onSubmit(false)}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  if (step.type === "select") {
    return (
      <div className="wizard-step wizard-step--select">
        <div className="wizard-options">
          {(step.options ?? []).map((opt) => (
            <button
              key={opt.value}
              className={`wizard-option ${selectedValue === opt.value ? "wizard-option--selected" : ""}`}
              disabled={submitting}
              onClick={() => handleOptionClick(opt)}
            >
              {opt.label ?? opt.value}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step.type === "multiselect") {
    return (
      <div className="wizard-step wizard-step--multiselect">
        <div className="wizard-options">
          {(step.options ?? []).map((opt) => (
            <button
              key={opt.value}
              className={`wizard-option ${selectedValues.has(opt.value) ? "wizard-option--selected" : ""}`}
              disabled={submitting}
              onClick={() => handleOptionClick(opt)}
            >
              {opt.label ?? opt.value}
            </button>
          ))}
        </div>
        <button
          className="wizard-btn wizard-btn--primary"
          disabled={submitting || selectedValues.size === 0}
          onClick={() => onSubmit([...selectedValues])}
        >
          {submitting ? "Please wait…" : "Continue"}
        </button>
      </div>
    );
  }

  if (step.type === "progress") {
    return (
      <div className="wizard-step wizard-step--progress">
        <div className="wizard-spinner" />
        <p className="wizard-progress-text">{step.subtitle ?? "Setting up…"}</p>
      </div>
    );
  }

  return null;
}
