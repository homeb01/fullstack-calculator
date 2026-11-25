import { formatNumber } from '../utils/format';

type Props = {
  loading: boolean;
  result: number | null;
  error: string | null;
  onUseResult: () => void;
};

export function ResultDisplay({ loading, result, error, onUseResult }: Props) {
  return (
    <section className="result" aria-label="Result">
      <div className="result__value" aria-live="polite" aria-atomic="true">
        {loading && <span className="result__muted">Calculating…</span>}
        {!loading && error !== null && (
          <span className="result__error" role="alert">
            {capitalize(error)}
          </span>
        )}
        {!loading && result !== null && (
          <output className="result__number" title={String(result)}>
            {formatNumber(result)}
          </output>
        )}
        {!loading && error === null && result === null && (
          <span className="result__muted">Enter values and press =</span>
        )}
      </div>
      <button type="button" className="secondary" disabled={result === null} onClick={onUseResult}>
        Use result as a
      </button>
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
