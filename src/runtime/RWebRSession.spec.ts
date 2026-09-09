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
          names: ['correct', 'message', 'output'],
          values: [
            { type: 'logical', names: null, values: [true] },
            { type: 'character', names: null, values: ['Well done!\n'] },
            { type: 'character', names: null, values: ['[1] 78.53975'] },
          ],
        }),
      }),
    };

    // Inject mocked webR instance
    (session as any).webRPromise = Promise.resolve(mockWebR);

    const emittedOutputs: any[] = [];
    session.onOutput((notif) => {
      emittedOutputs.push(notif);
    });

    const result = await session.submitCode({
      code: 'area <- pi * (radius ** 2)',
      sct: "ex() %>% check_object('area') %>% check_equal()",
      pec: 'radius <- 5',
      solution: 'area <- pi * (radius ** 2)',
    });

    expect(result.correct).toBe(true);
    expect(result.message).toBe('Well done!');
    expect(result.output).toBe('[1] 78.53975');
    expect(emittedOutputs).toEqual([{ type: 'output', payload: '[1] 78.53975' }]);
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

  it('exposes writeFileand readFile over the webR filesystem', async () => {
    const session = new RWebRSession();
    const store: Record<string, string> = {};
    const mockWebR = {
      FS: {
        cwd: () => '/home/webr',
        writeFile: (path: string, data: string) => {
          store[path] = data;
        },
        readFile: (path: string) => store[path] || '',
      },
    };

    (session as any).webRPromise = Promise.resolve(mockWebR);
    await session.writeFile({ path: 'notes.txt', data: 'hello r' });
    expect(await session.readFile({ path: 'notes.txt' })).toEqual({
      content: 'hello r',
      cwd: '/home/webr',
    });
  });

  it('runs plain R code without installing testwhat CRAN packages', async () => {
    const session = new RWebRSession();
    const mockWebR = {
      installPackages: vi.fn().mockResolvedValue(undefined),
      globalShelter: {
        captureR: vi.fn().mockResolvedValue({
          output: [{ type: 'stdout', data: '[1] 42\n' }],
          images: [],
        }),
      },
      evalR: vi.fn().mockResolvedValue({
        toJs: vi.fn().mockResolvedValue({
          type: 'character',
          values: ['[1] 42'],
        }),
      }),
      evalRVoid: vi.fn().mockResolvedValue(undefined),
    };
    (session as any).webRPromise = Promise.resolve(mockWebR);

    await session.runCode({ code: 'x <- 42\nx' });
    expect(mockWebR.installPackages).not.toHaveBeenCalled();
    expect(session.getStatus().status).toBe('ready');
  });

  it('grades non-testwhat assertions without installing testwhat CRAN packages', async () => {
    const session = new RWebRSession();
    const mockWebR = {
      installPackages: vi.fn().mockResolvedValue(undefined),
      globalShelter: {
        captureR: vi.fn().mockResolvedValue({
          output: [{ type: 'stdout', data: '[1] 10\n' }],
          images: [],
        }),
      },
      evalR: vi.fn().mockResolvedValue({
        toJs: vi.fn().mockResolvedValue({
          type: 'logical',
          values: [true],
        }),
      }),
      evalRVoid: vi.fn().mockResolvedValue(undefined),
    };
    (session as any).webRPromise = Promise.resolve(mockWebR);

    const result = await session.submitCode({
      code: 'x <- 10',
      sct: 'stopifnot(x == 10)',
    });
    expect(mockWebR.installPackages).not.toHaveBeenCalled();
    expect(result.correct).toBe(true);
  });
});
