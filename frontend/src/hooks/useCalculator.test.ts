import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../utils/validation';
import {
  buildRequest,
  calculatorReducer,
  initialState,
  type CalculatorAction,
  type CalculatorState,
} from './useCalculator';

const withResult: CalculatorState = {
  ...initialState,
  a: '10',
  b: '4',
  operation: 'divide',
  status: { kind: 'success', result: 2.5 },
};

describe('calculatorReducer', () => {
  it.each<[string, CalculatorAction]>([
    ['a changes', { type: 'setA', value: '11' }],
    ['b changes', { type: 'setB', value: '5' }],
    ['the operation changes', { type: 'setOperation', operation: 'multiply' }],
  ])('clears the result when %s', (_name, action) => {
    expect(calculatorReducer(withResult, action).status).toEqual({ kind: 'idle' });
  });

  it('clears an error when an input changes', () => {
    const state: CalculatorState = { ...withResult, status: { kind: 'error', message: 'cannot divide by zero' } };

    expect(calculatorReducer(state, { type: 'setB', value: '2' }).status).toEqual({ kind: 'idle' });
  });

  it('clears only the edited field error', () => {
    const state: CalculatorState = { ...initialState, fieldErrors: { a: 'bad a', b: 'bad b' } };

    expect(calculatorReducer(state, { type: 'setA', value: '1' }).fieldErrors).toEqual({ a: undefined, b: 'bad b' });
  });

  it('drops the b error when switching to sqrt', () => {
    const state: CalculatorState = { ...initialState, fieldErrors: { a: 'bad a', b: 'bad b' } };

    expect(calculatorReducer(state, { type: 'setOperation', operation: 'sqrt' }).fieldErrors).toEqual({ a: 'bad a' });
  });

  it('moves through loading to success', () => {
    const loading = calculatorReducer(withResult, { type: 'start' });
    expect(loading.status).toEqual({ kind: 'loading' });

    expect(calculatorReducer(loading, { type: 'succeed', result: 3 }).status).toEqual({ kind: 'success', result: 3 });
  });

  it('moves through loading to error', () => {
    const loading = calculatorReducer(initialState, { type: 'start' });

    expect(calculatorReducer(loading, { type: 'fail', message: 'boom' }).status).toEqual({
      kind: 'error',
      message: 'boom',
    });
  });
});

describe('buildRequest', () => {
  it('builds a binary request', () => {
    expect(buildRequest({ a: '10', b: '4', operation: 'divide' })).toEqual({
      ok: true,
      request: { operation: 'divide', a: 10, b: 4 },
    });
  });

  it('omits b for sqrt and ignores its content', () => {
    expect(buildRequest({ a: '9', b: 'not a number', operation: 'sqrt' })).toEqual({
      ok: true,
      request: { operation: 'sqrt', a: 9 },
    });
  });

  it('reports errors for both fields', () => {
    expect(buildRequest({ a: '', b: '2,5', operation: 'add' })).toEqual({
      ok: false,
      fieldErrors: { a: MESSAGES.empty, b: MESSAGES.decimalComma },
    });
  });

  it('accepts a chained result in exponent notation', () => {
    expect(buildRequest({ a: String(1.5e21), b: '2', operation: 'multiply' })).toEqual({
      ok: true,
      request: { operation: 'multiply', a: 1.5e21, b: 2 },
    });
  });
});
