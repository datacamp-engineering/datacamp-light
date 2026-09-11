import type { IShellVfs } from './virtualFileSystem.ts';

export type WasmAppletRunner = (
  applet: string,
  args: string[],
  input?: string,
) => {
  output?: string;
  error?: string;
  exitCode: number;
};

/**
 * Runner that invokes compiled BusyBox C applets via callMain().
 */
export function createBusyboxRunner(
  emscriptenModule: any,
  virtualFileSystem: IShellVfs,
): WasmAppletRunner {
  let pipeCounter = 0;
  return (applet: string, args: string[], input?: string) => {
    if (typeof emscriptenModule.__resetBuffers === 'function') {
      emscriptenModule.__resetBuffers();
    }

    let temporaryInputFile: string | null = null;
    const effectiveArgs = [...args];
    if (input !== undefined && input !== '') {
      temporaryInputFile = '/tmp/.dcl_input_' + ++pipeCounter;
      try {
        virtualFileSystem.writeFile(temporaryInputFile, input);
        const hasExplicitInputFile = args.some(
          (argument) => !argument.startsWith('-') && virtualFileSystem.exists(argument),
        );
        if (!hasExplicitInputFile) {
          effectiveArgs.push(temporaryInputFile);
        }
      } catch {}
    }

    let exitCode = 0;
    try {
      emscriptenModule.callMain([applet, ...effectiveArgs]);
    } catch (callError: any) {
      if (typeof callError?.status === 'number') {
        exitCode = callError.status;
      } else if (typeof callError === 'number') {
        exitCode = callError;
      } else {
        exitCode = 1;
      }
    } finally {
      if (temporaryInputFile && virtualFileSystem.exists(temporaryInputFile)) {
        try {
          virtualFileSystem.unlink(temporaryInputFile);
        } catch {}
      }
    }

    const output =
      typeof emscriptenModule.__getStdout === 'function'
        ? emscriptenModule.__getStdout()
        : '';
    const rawError =
      typeof emscriptenModule.__getStderr === 'function'
        ? emscriptenModule.__getStderr()
        : '';

    const error = rawError.replace(/^busybox:\s*/, '').trim() || undefined;

    return {
      output: output ? output.replace(/\n$/, '') : '',
      error,
      exitCode,
    };
  };
}
