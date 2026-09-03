import { describe, expect, it, vi } from 'vitest';
import { RWebRSession } from './RWebRSession';

describe('RWebRSession', () => {
  it('instantiates and initializes properly', async () => {
    const session = new RWebRSession();
    expect(session.getStatus().status).toBe('none');
  });

  it('unpacks testwhat success result correctly from webR named list structure', async () => {
    const session = new RWebRSession();

    const mockWebR = {
      installPackages: vi.fn().mockResolvedValue(undefined),
      evalRVoid: vi.fn().mockResolvedValue(undefined),
      evalR: vi.fn().mockResolvedValue({
        toJs: vi.fn().mockResolvedValue({
          type: 'list',
          names: ['correct', 'message'],
          values: [
            { type: 'logical', names: null, values: [true] },
            { type: 'character', names: null, values: ['Well done!\n'] },
          ],
        }),
      }),
    };

    // Inject mocked webR instance
    (session as any).webRPromise = Promise.resolve(mockWebR);

    const result = await session.submitCode({
      code: 'area <- pi * (radius ** 2)',
      sct: "ex() %>% check_object('area') %>% check_equal()",
      pec: 'radius <- 5',
      solution: 'area <- pi * (radius ** 2)',
    });

    expect(result.correct).toBe(true);
    expect(result.message).toBe('Well done!');
    expect(session.getStatus().status).toBe('ready');
  });

  it('unpacks testwhat failure result correctly with diagnostic message', async () => {
    const session = new RWebRSession();

    const mockWebR = {
      installPackages: vi.fn().mockResolvedValue(undefined),
      evalRVoid: vi.fn().mockResolvedValue(undefined),
      evalR: vi.fn().mockResolvedValue({
        toJs: vi.fn().mockResolvedValue({
          type: 'list',
          names: ['correct', 'message'],
          values: [
            { type: 'logical', names: null, values: [false] },
            {
              type: 'character',
              names: null,
              values: ['The contents of the variable <code>area</code> aren’t correct.\n'],
            },
          ],
        }),
      }),
    };

    (session as any).webRPromise = Promise.resolve(mockWebR);

    const result = await session.submitCode({
      code: 'area <- 999',
      sct: "ex() %>% check_object('area') %>% check_equal()",
      pec: 'radius <- 5',
      solution: 'area <- pi * (radius ** 2)',
    });

    expect(result.correct).toBe(false);
    expect(result.message).toBe('The contents of the variable <code>area</code> aren’t correct.');
    expect(session.getStatus().status).toBe('ready');
  });
});
