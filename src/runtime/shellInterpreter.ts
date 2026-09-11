import { AstShellInterpreter } from './astShellInterpreter.ts';
import {
  createBusyboxRunner,
  type WasmAppletRunner,
} from './shell/busyboxRunner.ts';
import {
  createShellBuiltins,
  type CommandExecutionResult,
  type PipInstallHandler,
  type PipInstallResult,
} from './shell/shellBuiltins.ts';
import {
  createEmscriptenVfs,
  createMemoryVfs,
  type IShellVfs,
  type IShellVfsStat,
} from './shell/virtualFileSystem.ts';

export type {
  IShellVfs,
  IShellVfsStat,
  WasmAppletRunner,
  PipInstallResult,
  PipInstallHandler,
  CommandExecutionResult,
};
export { createMemoryVfs, createEmscriptenVfs, createBusyboxRunner };

export interface CommandResult {
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface CreateShellInterpreterOptions {
  vfs?: IShellVfs;
  onPipInstall?: PipInstallHandler;
  wasmRunner?: WasmAppletRunner;
  preferWasmOverBuiltins?: boolean;
}

export interface IShellInterpreter {
  runCommand(commandLine: string, args?: string[]): CommandResult;
  runScript(script: string, args?: string[]): { output: string; error?: string };
  getCwd(): string;
  getVfs(): IShellVfs;
  writeFile(filePath: string, content: string): void;
  readFile(filePath: string): string;
  getAvailableCommands(): string[];
  waitForPipInstall(): Promise<void>;
  getLastPipInstallResult(): PipInstallResult | null;
}

/**
 * Creates the unified shell interpreter.
 */
export function createShellInterpreter(
  options?: CreateShellInterpreterOptions,
): IShellInterpreter {
  const virtualFileSystem = options?.vfs || createMemoryVfs();
  const onPipInstall = options?.onPipInstall;
  const wasmRunner = options?.wasmRunner;
  const preferWasm = options?.preferWasmOverBuiltins ?? Boolean(wasmRunner);
  const pendingPipInstallations: Array<Promise<PipInstallResult | void>> = [];
  let lastPipInstallResult: PipInstallResult | null = null;

  const builtins = createShellBuiltins({
    virtualFileSystem,
    onPipInstall,
    pendingPipInstallations,
    setLastPipInstallResult: (result) => {
      lastPipInstallResult = result;
    },
  });

  const astEngine = new AstShellInterpreter({
    vfs: virtualFileSystem,
    wasmRunner,
    preferWasmOverBuiltins: preferWasm,
    onPipInstall,
    builtins,
  });

  const executeWithWasmSh = (
    script: string,
    _args: string[] = [],
  ): { output: string; error?: string; exitCode: number } | null => {
    const globalScope = globalThis as any;
    if (typeof globalScope.dcl_run_sh_wasm !== 'function') {
      return null;
    }

    try {
      const execCallback = (cmd: string, cmdArgs: string[], stdin: string) => {
        const normalizedArgs = Array.isArray(cmdArgs) ? cmdArgs.map(String) : [];
        if (cmd === 'cd') {
          const target = normalizedArgs[0]
            ? normalizedArgs[0].startsWith('/')
              ? normalizedArgs[0]
              : `${virtualFileSystem.cwd()}/${normalizedArgs[0]}`.replace(/\/+/g, '/')
            : '/home/repl';
          try {
            virtualFileSystem.chdir(target);
            return { output: '', exitCode: 0 };
          } catch (chdirError: any) {
            return {
              error: `cd: ${chdirError?.message || target}: No such file or directory`,
              exitCode: 1,
            };
          }
        }
        if (builtins[cmd]) {
          const builtinRes = builtins[cmd](normalizedArgs, stdin || '');
          return {
            output: builtinRes.output || '',
            error: builtinRes.error || '',
            exitCode: builtinRes.exitCode ?? 0,
          };
        }
        if (wasmRunner) {
          const wasmRes = wasmRunner(cmd, normalizedArgs, stdin || '');
          return {
            output: wasmRes.output || '',
            error: wasmRes.error || '',
            exitCode: wasmRes.exitCode ?? 0,
          };
        }
        return { output: '', error: `${cmd}: command not found`, exitCode: 127 };
      };

      const rawResult = globalScope.dcl_run_sh_wasm(script, execCallback);
      if (rawResult && typeof rawResult === 'object') {
        return {
          output: rawResult.output || '',
          error: rawResult.error || undefined,
          exitCode: typeof rawResult.exitCode === 'number' ? rawResult.exitCode : 0,
        };
      }
    } catch (error) {
      console.warn('WASM parser fallback to JS:', error);
    }
    return null;
  };

  return {
    runCommand: (commandLine: string, args: string[] = []): CommandResult => {
      const wasmRun = executeWithWasmSh(commandLine, args);
      if (wasmRun) {
        return {
          output: wasmRun.output,
          error: wasmRun.error,
          exitCode: wasmRun.exitCode,
        };
      }
      const executionResult = astEngine.runScript(commandLine, args);
      const commandResult: CommandResult = {
        output: executionResult.output,
      };
      if (executionResult.error !== undefined) {
        commandResult.error = executionResult.error;
      }
      return commandResult;
    },
    runScript: (
      script: string,
      args: string[] = [],
    ): { output: string; error?: string } => {
      const wasmRun = executeWithWasmSh(script, args);
      if (wasmRun) {
        return {
          output: wasmRun.output,
          error: wasmRun.error,
        };
      }
      const executionResult = astEngine.runScript(script, args);
      return {
        output: executionResult.output,
        error: executionResult.error,
      };
    },
    getCwd: () => virtualFileSystem.cwd(),
    getVfs: () => virtualFileSystem,
    writeFile: (filePath: string, content: string) =>
      virtualFileSystem.writeFile(filePath, content),
    readFile: (filePath: string) => virtualFileSystem.readFile(filePath),
    getAvailableCommands: () => {
      const builtinNames = Object.keys(builtins);
      const vfsBinaries: string[] = [];
      try {
        if (virtualFileSystem.exists('/bin')) {
          vfsBinaries.push(...virtualFileSystem.readdir('/bin'));
        }
        if (virtualFileSystem.exists('/usr/bin')) {
          vfsBinaries.push(...virtualFileSystem.readdir('/usr/bin'));
        }
      } catch {}
      return Array.from(new Set([...builtinNames, ...vfsBinaries])).filter(Boolean).sort();
    },
    waitForPipInstall: async () => {
      while (pendingPipInstallations.length > 0) {
        const pendingBatch = pendingPipInstallations.splice(0);
        await Promise.all(pendingBatch);
      }
    },
    getLastPipInstallResult: () => lastPipInstallResult,
  };
}
