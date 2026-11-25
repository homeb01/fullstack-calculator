export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage';
export type UnaryOperation = 'sqrt';
export type Operation = BinaryOperation | UnaryOperation;

export const OPERATIONS: readonly Operation[] = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'sqrt',
  'percentage',
];

export function isUnaryOperation(operation: Operation): operation is UnaryOperation {
  return operation === 'sqrt';
}

export type CalculateRequest =
  | { operation: UnaryOperation; a: number }
  | { operation: BinaryOperation; a: number; b: number };

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_OPERATION'
  | 'DIVISION_BY_ZERO'
  | 'INVALID_OPERAND'
  | 'RESULT_OUT_OF_RANGE'
  | 'INTERNAL_ERROR';

export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'ABORTED';

export type ErrorCode = ApiErrorCode | ClientErrorCode;

export type CalculateResult =
  | { ok: true; result: number }
  | { ok: false; code: ErrorCode; message: string };

export type CalculateOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export const CALCULATE_URL = '/api/v1/calculate';
export const DEFAULT_TIMEOUT_MS = 5000;

const API_ERROR_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  'INVALID_REQUEST',
  'UNSUPPORTED_OPERATION',
  'DIVISION_BY_ZERO',
  'INVALID_OPERAND',
  'RESULT_OUT_OF_RANGE',
  'INTERNAL_ERROR',
]);

const CLIENT_ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
  TIMEOUT: 'The server took too long to respond. Please try again.',
  INVALID_RESPONSE: 'The server returned an unexpected response. Please try again.',
  ABORTED: 'The request was cancelled.',
};

export async function calculate(
  request: CalculateRequest,
  { timeoutMs = DEFAULT_TIMEOUT_MS, signal }: CalculateOptions = {},
): Promise<CalculateResult> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const response = await fetch(CALCULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: combined,
    });
    return toResult(response.ok, await readJson(response));
  } catch {
    if (timeout.aborted) {
      return clientError('TIMEOUT');
    }
    if (signal?.aborted) {
      return clientError('ABORTED');
    }
    return clientError('NETWORK_ERROR');
  }
}

const INVALID_JSON = Symbol('invalid JSON');

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return INVALID_JSON;
    }
    throw error;
  }
}

function toResult(ok: boolean, body: unknown): CalculateResult {
  if (ok && isSuccessBody(body)) {
    return { ok: true, result: body.result };
  }
  if (!ok && isErrorBody(body)) {
    return { ok: false, code: body.error.code, message: body.error.message };
  }
  return clientError('INVALID_RESPONSE');
}

function clientError(code: ClientErrorCode): CalculateResult {
  return { ok: false, code, message: CLIENT_ERROR_MESSAGES[code] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSuccessBody(body: unknown): body is { result: number } {
  return isRecord(body) && typeof body.result === 'number' && Number.isFinite(body.result);
}

function isErrorBody(body: unknown): body is { error: { code: ApiErrorCode; message: string } } {
  if (!isRecord(body) || !isRecord(body.error)) {
    return false;
  }
  const { code, message } = body.error;
  return typeof code === 'string' && API_ERROR_CODES.has(code) && typeof message === 'string';
}
