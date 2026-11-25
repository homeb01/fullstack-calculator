const SIGNIFICANT_DIGITS = 12;
const EXPONENT_FROM = 1e12;
const EXPONENT_BELOW = 1e-6;

// Values at or above 1e12, or below 1e-6, are shown in exponent notation.
export function formatNumber(value: number): string {
  if (value === 0) {
    return '0';
  }
  const magnitude = Math.abs(value);
  const text =
    magnitude >= EXPONENT_FROM || magnitude < EXPONENT_BELOW
      ? value.toExponential(SIGNIFICANT_DIGITS - 1)
      : value.toPrecision(SIGNIFICANT_DIGITS);
  return stripTrailingZeros(text);
}

function stripTrailingZeros(text: string): string {
  const [mantissa = '', exponent] = text.split('e');
  const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa;
  return exponent === undefined ? trimmed : `${trimmed}e${exponent}`;
}
