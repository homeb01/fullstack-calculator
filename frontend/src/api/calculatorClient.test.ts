import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALCULATE_URL, calculate } from './calculatorClient';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function hangUntilAborted(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('calculate', () => {
  it('sends the request and returns the result', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse(200, { operation: 'divide', a: 10, b: 4, result: 2.5 }),
    );

    const result = await calculate({ operation: 'divide', a: 10, b: 4 });

    expect(result).toEqual({ ok: true, result: 2.5 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(CALCULATE_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ operation: 'divide', a: 10, b: 4 });
  });

  it('omits b for sqrt', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(200, { operation: 'sqrt', a: 9, result: 3 }));

    await calculate({ operation: 'sqrt', a: 9 });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ operation: 'sqrt', a: 9 });
  });

  it('returns the API error code and message', async () => {
    mockFetch(async () =>
      jsonResponse(422, { error: { code: 'DIVISION_BY_ZERO', message: 'cannot divide by zero' } }),
    );

    const result = await calculate({ operation: 'divide', a: 1, b: 0 });

    expect(result).toEqual({ ok: false, code: 'DIVISION_BY_ZERO', message: 'cannot divide by zero' });
  });

  it('maps an HTML error page to INVALID_RESPONSE', async () => {
    mockFetch(async () =>
      new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const result = await calculate({ operation: 'add', a: 1, b: 2 });

    expect(result).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' });
  });

  it.each([
    ['an empty body', new Response('', { status: 200 })],
    ['a success status with an error body', jsonResponse(200, { error: { code: 'INVALID_REQUEST', message: 'x' } })],
    ['an error status with a success body', jsonResponse(500, { result: 3 })],
    ['a non-numeric result', jsonResponse(200, { result: '3' })],
    ['an unknown error code', jsonResponse(400, { error: { code: 'SOMETHING_NEW', message: 'x' } })],
    ['a missing error message', jsonResponse(400, { error: { code: 'INVALID_REQUEST' } })],
  ])('maps %s to INVALID_RESPONSE', async (_name, response) => {
    mockFetch(async () => response);

    const result = await calculate({ operation: 'add', a: 1, b: 2 });

    expect(result).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' });
  });

  it('maps a network failure to NETWORK_ERROR', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await calculate({ operation: 'add', a: 1, b: 2 });

    expect(result).toMatchObject({ ok: false, code: 'NETWORK_ERROR' });
  });

  it('maps a timeout to TIMEOUT', async () => {
    mockFetch(hangUntilAborted);

    const result = await calculate({ operation: 'add', a: 1, b: 2 }, { timeoutMs: 10 });

    expect(result).toMatchObject({ ok: false, code: 'TIMEOUT' });
  });

  it('maps a caller abort to ABORTED', async () => {
    mockFetch(hangUntilAborted);
    const controller = new AbortController();

    const pending = calculate({ operation: 'add', a: 1, b: 2 }, { signal: controller.signal });
    controller.abort('superseded by a newer request');

    expect(await pending).toMatchObject({ ok: false, code: 'ABORTED' });
  });
});
