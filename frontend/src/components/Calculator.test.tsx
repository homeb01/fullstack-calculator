// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Calculator } from './Calculator';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

let fetchMock: FetchMock;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function respondWith(status: number, body: unknown) {
  fetchMock.mockImplementation(async () => jsonResponse(status, body));
}

function setup() {
  const user = userEvent.setup();
  render(<Calculator />);
  return {
    user,
    inputA: screen.getByRole('textbox', { name: 'a' }),
    inputB: screen.getByRole('textbox', { name: 'b' }),
    equals: screen.getByRole('button', { name: '=' }),
  };
}

async function calculate10DividedBy4() {
  const view = setup();
  respondWith(200, { operation: 'divide', a: 10, b: 4, result: 2.5 });
  await view.user.type(view.inputA, '10');
  await view.user.type(view.inputB, '4');
  await view.user.click(screen.getByRole('button', { name: 'Divide' }));
  await view.user.click(view.equals);
  expect(await screen.findByText('2.5')).toBeInTheDocument();
  return view;
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Calculator', () => {
  it('shows the result of a calculation', async () => {
    await calculate10DividedBy4();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ operation: 'divide', a: 10, b: 4 });
  });

  it('shows a validation error next to the field and does not call the server', async () => {
    const { user, inputA, inputB, equals } = setup();

    await user.type(inputA, '2,5');
    await user.type(inputB, '1');
    await user.click(equals);

    expect(screen.getByText('Use a dot (.) as the decimal separator, for example 2.5.')).toBeInTheDocument();
    expect(inputA).toBeInvalid();
    expect(inputB).toBeValid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the error returned by the API', async () => {
    const { user, inputA, inputB, equals } = setup();
    respondWith(422, { error: { code: 'DIVISION_BY_ZERO', message: 'cannot divide by zero' } });

    await user.type(inputA, '7');
    await user.type(inputB, '0');
    await user.click(screen.getByRole('button', { name: 'Divide' }));
    await user.click(equals);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot divide by zero');
  });

  it('disables the operation buttons and = while a request is loading', async () => {
    const { user, inputA, inputB, equals } = setup();
    let respond: (response: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => (respond = resolve)));
    const operationButtons = () => screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed'));

    await user.type(inputA, '1');
    await user.type(inputB, '2');
    await user.click(equals);

    expect(screen.getByText('Calculating…')).toBeInTheDocument();
    expect(equals).toBeDisabled();
    expect(operationButtons()).toHaveLength(7);
    for (const button of operationButtons()) {
      expect(button).toBeDisabled();
    }

    respond(jsonResponse(200, { operation: 'add', a: 1, b: 2, result: 3 }));

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(equals).toBeEnabled();
    for (const button of operationButtons()) {
      expect(button).toBeEnabled();
    }
  });

  it('ignores a response that arrives after an input was edited', async () => {
    const { user, inputA, inputB, equals } = setup();
    let respond: (response: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise((resolve) => (respond = resolve)));

    await user.type(inputA, '1');
    await user.type(inputB, '2');
    await user.click(equals);
    expect(screen.getByText('Calculating…')).toBeInTheDocument();

    await user.type(inputB, '5');
    await act(async () => {
      respond(jsonResponse(200, { operation: 'add', a: 1, b: 2, result: 3 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByText('Enter values and press =')).toBeInTheDocument();
    expect(inputB).toHaveValue('25');
    expect(equals).toBeEnabled();
  });

  it.each([
    ['a is edited', 'a'],
    ['b is edited', 'b'],
  ])('clears the result when %s', async (_name, field) => {
    const { user } = await calculate10DividedBy4();

    await user.type(screen.getByRole('textbox', { name: field }), '1');

    expect(screen.queryByText('2.5')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use result as a' })).toBeDisabled();
  });

  it('clears the result when the operation changes', async () => {
    const { user } = await calculate10DividedBy4();

    await user.click(screen.getByRole('button', { name: 'Multiply' }));

    expect(screen.queryByText('2.5')).not.toBeInTheDocument();
  });

  it('disables b for sqrt and calculates with a only', async () => {
    const { user, inputA, inputB, equals } = setup();
    respondWith(200, { operation: 'sqrt', a: 9, result: 3 });

    await user.type(inputB, '5');
    await user.click(screen.getByRole('button', { name: 'Square root of a' }));

    expect(inputB).toBeDisabled();
    expect(inputB).toHaveValue('');

    await user.type(inputA, '9');
    await user.click(equals);

    expect(await screen.findByText('3')).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ operation: 'sqrt', a: 9 });
  });

  it('copies the result into a with "Use result as a"', async () => {
    const { user, inputA, inputB } = await calculate10DividedBy4();

    await user.click(screen.getByRole('button', { name: 'Use result as a' }));

    expect(inputA).toHaveValue('2.5');
    expect(inputB).toHaveValue('4');
    expect(screen.queryByText('2.5', { selector: 'output' })).not.toBeInTheDocument();
  });
});
