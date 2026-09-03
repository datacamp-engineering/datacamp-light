import { describe, expect, it } from 'vitest';
import { JsonRpcSessionClient } from './session';
import type { JsonRpcMessage } from './types';

describe('JsonRpcSessionClient', () => {
  it('should send initialize request and transition status', async () => {
    let sentMessage: JsonRpcMessage | null = null;
    const client = new JsonRpcSessionClient((msg) => {
      sentMessage = msg;
    });

    const statusHistory: string[] = [];
    client.onStatusChange((status) => {
      statusHistory.push(status.status);
    });

    const initPromise = client.initialize({ pec: 'x = 1', packages: ['numpy'] });

    expect(statusHistory).toContain('starting');
    expect(sentMessage).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { pec: 'x = 1', packages: ['numpy'] },
    });

    // Simulate worker response
    client.handleMessageFromWorker({
      jsonrpc: '2.0',
      id: 1,
      result: { status: 'ready' },
    });

    await initPromise;
    expect(client.getStatus().status).toBe('ready');
  });

  it('should send runCode request and return result', async () => {
    let sentMessage: JsonRpcMessage | null = null;
    const client = new JsonRpcSessionClient((msg) => {
      sentMessage = msg;
    });

    const runPromise = client.runCode({ code: 'print("hello")' });

    expect(sentMessage).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'runCode',
      params: { code: 'print("hello")' },
    });

    // Simulate worker output notification + result response
    client.handleMessageFromWorker({
      jsonrpc: '2.0',
      method: 'session_output',
      params: { type: 'output', payload: 'hello' },
    });

    client.handleMessageFromWorker({
      jsonrpc: '2.0',
      id: 1,
      result: { output: 'hello' },
    });

    const result = await runPromise;
    expect(result).toEqual({ output: 'hello' });
  });

  it('should send submitCode request and handle SCT feedback', async () => {
    let sentMessage: JsonRpcMessage | null = null;
    const client = new JsonRpcSessionClient((msg) => {
      sentMessage = msg;
    });

    const submitPromise = client.submitCode({
      code: 'x = 5',
      sct: 'test_object("x")',
    });

    expect(sentMessage).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'submitCode',
      params: { code: 'x = 5', sct: 'test_object("x")' },
    });

    client.handleMessageFromWorker({
      jsonrpc: '2.0',
      id: 1,
      result: { correct: true, message: 'Passed', output: '' },
    });

    const result = await submitPromise;
    expect(result.correct).toBe(true);
    expect(result.message).toBe('Passed');
  });
});
