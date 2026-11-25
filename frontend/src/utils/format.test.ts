import { describe, expect, it } from 'vitest';
import { formatNumber } from './format';

describe('formatNumber', () => {
  it.each([
    [2.5, '2.5'],
    [1024, '1024'],
    [-12, '-12'],
    [0, '0'],
    [-0, '0'],
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.333333333333'],
    [-2 / 3, '-0.666666666667'],
    [100000000000, '100000000000'],
    [999999999999, '999999999999'],
    [0.000001, '0.000001'],
    [123.456, '123.456'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it.each([
    [1e12, '1e+12'],
    [1.5e21, '1.5e+21'],
    [-2.25e15, '-2.25e+15'],
    [999999999999.9, '1e+12'],
    [0.0000009, '9e-7'],
    [1.23456789e-10, '1.23456789e-10'],
    [Number.MIN_VALUE, '4.94065645841e-324'],
    [Number.MAX_VALUE, '1.79769313486e+308'],
  ])('uses exponent notation for %d', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
});
