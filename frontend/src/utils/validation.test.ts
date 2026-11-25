import { describe, expect, it } from 'vitest';
import { MESSAGES, parseNumber } from './validation';

describe('parseNumber', () => {
  it.each([
    ['-12', -12],
    ['2.5', 2.5],
    ['.5', 0.5],
    ['-.5', -0.5],
    ['5.', 5],
    ['0', 0],
    ['1e3', 1000],
    ['1E3', 1000],
    ['2.5e-3', 0.0025],
    ['-1e+2', -100],
    ['  42  ', 42],
    ['1e-300', 1e-300],
    ['0e5', 0],
    ['0.000', 0],
  ])('accepts %j as %d', (input, expected) => {
    expect(parseNumber(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', MESSAGES.empty],
    ['   ', MESSAGES.empty],
    ['\t\n', MESSAGES.empty],
    ['2,5', MESSAGES.decimalComma],
    ['-0,5', MESSAGES.decimalComma],
    ['1,000', MESSAGES.decimalComma],
    ['0x10', MESSAGES.invalid],
    ['Infinity', MESSAGES.invalid],
    ['-Infinity', MESSAGES.invalid],
    ['NaN', MESSAGES.invalid],
    ['12abc', MESSAGES.invalid],
    ['abc', MESSAGES.invalid],
    ['.', MESSAGES.invalid],
    ['-', MESSAGES.invalid],
    ['1e', MESSAGES.invalid],
    ['e3', MESSAGES.invalid],
    ['1.2.3', MESSAGES.invalid],
    ['--1', MESSAGES.invalid],
    ['+5', MESSAGES.invalid],
    ['1 000', MESSAGES.invalid],
    ['0b101', MESSAGES.invalid],
    ['1_000', MESSAGES.invalid],
    ['1e400', MESSAGES.tooLarge],
    ['-1e400', MESSAGES.tooLarge],
    ['1e-400', MESSAGES.tooSmall],
  ])('rejects %j', (input, message) => {
    expect(parseNumber(input)).toEqual({ ok: false, message });
  });
});
