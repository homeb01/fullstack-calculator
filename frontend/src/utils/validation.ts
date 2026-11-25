export type ParseResult = { ok: true; value: number } | { ok: false; message: string };

const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export const MESSAGES = {
  empty: 'Enter a number.',
  decimalComma: 'Use a dot (.) as the decimal separator, for example 2.5.',
  invalid: 'Enter a valid number, for example -12, 2.5 or 1e3.',
  tooLarge: 'This number is too large.',
  tooSmall: 'This number is too close to zero to be represented.',
} as const;

export function parseNumber(input: string): ParseResult {
  const text = input.trim();

  if (text === '') {
    return { ok: false, message: MESSAGES.empty };
  }
  if (text.includes(',')) {
    return { ok: false, message: MESSAGES.decimalComma };
  }
  if (!NUMBER_PATTERN.test(text)) {
    return { ok: false, message: MESSAGES.invalid };
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { ok: false, message: MESSAGES.tooLarge };
  }
  // Reject values like 1e-400 that would silently become 0 and change the result.
  if (value === 0 && /[1-9]/.test(text.split(/[eE]/)[0] ?? '')) {
    return { ok: false, message: MESSAGES.tooSmall };
  }
  return { ok: true, value };
}
