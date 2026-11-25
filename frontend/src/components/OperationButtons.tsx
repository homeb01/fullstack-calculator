import { OPERATIONS, type Operation } from '../api/calculatorClient';

const LABELS: Record<Operation, { symbol: string; name: string }> = {
  add: { symbol: '+', name: 'Add' },
  subtract: { symbol: '−', name: 'Subtract' },
  multiply: { symbol: '×', name: 'Multiply' },
  divide: { symbol: '÷', name: 'Divide' },
  power: { symbol: 'aᵇ', name: 'Power: a to the power of b' },
  sqrt: { symbol: '√a', name: 'Square root of a' },
  percentage: { symbol: 'a % of b', name: 'a % of b' },
};

type Props = {
  selected: Operation;
  disabled: boolean;
  onSelect: (operation: Operation) => void;
};

export function OperationButtons({ selected, disabled, onSelect }: Props) {
  return (
    <div className="operations" role="group" aria-label="Operation">
      {OPERATIONS.map((operation) => {
        const { symbol, name } = LABELS[operation];
        return (
          <button
            key={operation}
            type="button"
            className={`operation operation--${operation}`}
            aria-pressed={operation === selected}
            aria-label={name}
            title={name}
            disabled={disabled}
            onClick={() => onSelect(operation)}
          >
            {symbol}
          </button>
        );
      })}
    </div>
  );
}
