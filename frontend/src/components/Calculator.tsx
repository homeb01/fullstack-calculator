import type { FormEvent } from 'react';
import { isUnaryOperation } from '../api/calculatorClient';
import { useCalculator } from '../hooks/useCalculator';
import { OperationButtons } from './OperationButtons';
import { ResultDisplay } from './ResultDisplay';

export function Calculator() {
  const calculator = useCalculator();
  const bDisabled = isUnaryOperation(calculator.operation);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void calculator.submit();
  }

  return (
    <main className="calculator">
      <h1 className="calculator__title">Calculator</h1>
      <form className="calculator__form" onSubmit={handleSubmit} noValidate>
        <div className="fields">
          <NumberField
            id="a"
            label="a"
            value={calculator.a}
            error={calculator.fieldErrors.a}
            onChange={calculator.setA}
          />
          <NumberField
            id="b"
            label="b"
            value={bDisabled ? '' : calculator.b}
            error={bDisabled ? undefined : calculator.fieldErrors.b}
            disabled={bDisabled}
            placeholder={bDisabled ? 'Not used' : undefined}
            onChange={calculator.setB}
          />
        </div>

        <OperationButtons
          selected={calculator.operation}
          disabled={calculator.loading}
          onSelect={calculator.setOperation}
        />

        <button type="submit" className="primary" disabled={calculator.loading}>
          =
        </button>
      </form>

      <ResultDisplay
        loading={calculator.loading}
        result={calculator.result}
        error={calculator.error}
        onUseResult={calculator.copyResultToA}
      />
    </main>
  );
}

type NumberFieldProps = {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  disabled?: boolean;
  placeholder?: string | undefined;
  onChange: (value: string) => void;
};

function NumberField({ id, label, value, error, disabled = false, placeholder, onChange }: NumberFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error !== undefined && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
