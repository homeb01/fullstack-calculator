import { useCallback, useEffect, useReducer, useRef } from 'react';
import { calculate, isUnaryOperation, type CalculateRequest, type Operation } from '../api/calculatorClient';
import { parseNumber } from '../utils/validation';

export type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; result: number }
  | { kind: 'error'; message: string };

export type FieldErrors = { a?: string; b?: string };

export type CalculatorState = {
  a: string;
  b: string;
  operation: Operation;
  status: Status;
  fieldErrors: FieldErrors;
};

export type CalculatorAction =
  | { type: 'setA'; value: string }
  | { type: 'setB'; value: string }
  | { type: 'setOperation'; operation: Operation }
  | { type: 'invalid'; fieldErrors: FieldErrors }
  | { type: 'start' }
  | { type: 'succeed'; result: number }
  | { type: 'fail'; message: string };

export const initialState: CalculatorState = {
  a: '',
  b: '',
  operation: 'add',
  status: { kind: 'idle' },
  fieldErrors: {},
};

const IDLE: Status = { kind: 'idle' };

// Any change to the inputs clears the result, so a result never sits next to inputs it does not match.
export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'setA':
      return { ...state, a: action.value, status: IDLE, fieldErrors: { ...state.fieldErrors, a: undefined } };
    case 'setB':
      return { ...state, b: action.value, status: IDLE, fieldErrors: { ...state.fieldErrors, b: undefined } };
    case 'setOperation':
      return {
        ...state,
        operation: action.operation,
        status: IDLE,
        fieldErrors: isUnaryOperation(action.operation) ? { a: state.fieldErrors.a } : state.fieldErrors,
      };
    case 'invalid':
      return { ...state, status: IDLE, fieldErrors: action.fieldErrors };
    case 'start':
      return { ...state, status: { kind: 'loading' }, fieldErrors: {} };
    case 'succeed':
      return { ...state, status: { kind: 'success', result: action.result } };
    case 'fail':
      return { ...state, status: { kind: 'error', message: action.message } };
  }
}

export function buildRequest(
  state: Pick<CalculatorState, 'a' | 'b' | 'operation'>,
): { ok: true; request: CalculateRequest } | { ok: false; fieldErrors: FieldErrors } {
  const a = parseNumber(state.a);
  if (isUnaryOperation(state.operation)) {
    return a.ok
      ? { ok: true, request: { operation: state.operation, a: a.value } }
      : { ok: false, fieldErrors: { a: a.message } };
  }

  const b = parseNumber(state.b);
  if (a.ok && b.ok) {
    return { ok: true, request: { operation: state.operation, a: a.value, b: b.value } };
  }
  return {
    ok: false,
    fieldErrors: { a: a.ok ? undefined : a.message, b: b.ok ? undefined : b.message },
  };
}

export function useCalculator() {
  const [state, dispatch] = useReducer(calculatorReducer, initialState);
  const pending = useRef<AbortController | null>(null);

  const cancelPending = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const setA = useCallback(
    (value: string) => {
      cancelPending();
      dispatch({ type: 'setA', value });
    },
    [cancelPending],
  );

  const setB = useCallback(
    (value: string) => {
      cancelPending();
      dispatch({ type: 'setB', value });
    },
    [cancelPending],
  );

  const setOperation = useCallback(
    (operation: Operation) => {
      cancelPending();
      dispatch({ type: 'setOperation', operation });
    },
    [cancelPending],
  );

  const submit = useCallback(async () => {
    if (state.status.kind === 'loading') {
      return;
    }
    const built = buildRequest(state);
    if (!built.ok) {
      dispatch({ type: 'invalid', fieldErrors: built.fieldErrors });
      return;
    }

    cancelPending();
    const controller = new AbortController();
    pending.current = controller;
    dispatch({ type: 'start' });

    const response = await calculate(built.request, { signal: controller.signal });
    if (pending.current !== controller) {
      return;
    }
    pending.current = null;
    dispatch(response.ok ? { type: 'succeed', result: response.result } : { type: 'fail', message: response.message });
  }, [state, cancelPending]);

  const copyResultToA = useCallback(() => {
    if (state.status.kind === 'success') {
      setA(String(state.status.result));
    }
  }, [state.status, setA]);

  return {
    a: state.a,
    b: state.b,
    operation: state.operation,
    fieldErrors: state.fieldErrors,
    loading: state.status.kind === 'loading',
    result: state.status.kind === 'success' ? state.status.result : null,
    error: state.status.kind === 'error' ? state.status.message : null,
    setA,
    setB,
    setOperation,
    submit,
    copyResultToA,
  };
}
