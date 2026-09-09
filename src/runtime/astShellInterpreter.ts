// Polyfill process in Web Worker environments where it is not defined (never on window/main thread)
if (typeof window === 'undefined' && typeof globalThis !== 'undefined' && !(globalThis as any).process) {
  (globalThis as any).process = { env: { NODE_ENV: 'production' } };
}

import parse from 'bash-parser';
import type { WasmAppletRunner } from './shell/busyboxRunner.ts';
import {
  createShellBuiltins,
  type CommandExecutionResult,
  type PipInstallResult,
} from './shell/shellBuiltins.ts';
import type { IShellVfs } from './shell/virtualFileSystem.ts';

export interface AstShellOptions {
  vfs: IShellVfs;
  wasmRunner?: WasmAppletRunner;
  preferWasmOverBuiltins?: boolean;
  onPipInstall?: (packages: string[]) => Promise<PipInstallResult | void>;
  builtins?: Record<string, (args: string[], input?: string) => CommandExecutionResult>;
}

export interface AstExecutionResult {
  output: string;
  error?: string;
  exitCode: number;
}

/**
 * Clean, lightweight AST-driven Shell Visitor.
 *
 * Implements linear execution of POSIX commands, pipelines, redirects, conditionals,
 * loops, and variables on top of the shared Virtual File System and BusyBox WASM.
 */
export class AstShellInterpreter {
  private vfs: IShellVfs;
  private wasmRunner?: WasmAppletRunner;
  private preferWasmOverBuiltins: boolean;
  private onPipInstall?: (packages: string[]) => Promise<PipInstallResult | void>;
  private builtins: Record<string, (args: string[], input?: string) => CommandExecutionResult>;
  private environment: Record<string, string>;
  private arrays: Record<string, string[]>;
  private functions: Record<string, any>;
  private lastExitCode: number;
  private positionalArguments: string[];
  private breakRequested: boolean;
  private traps: Record<string, string>;
  private activeScriptContent?: string;

  constructor(options: AstShellOptions) {
    this.vfs = options.vfs;
    this.wasmRunner = options.wasmRunner;
    this.preferWasmOverBuiltins = options.preferWasmOverBuiltins ?? true;
    this.onPipInstall = options.onPipInstall;
    this.environment = {
      PWD: this.vfs.cwd(),
      HOME: '/home/repl',
      USER: 'repl',
      PATH: '/bin:/usr/bin',
      $: '1',
    };
    this.arrays = {};
    this.functions = {};
    this.lastExitCode = 0;
    this.positionalArguments = ['sh'];
    this.breakRequested = false;
    this.traps = {};

    const defaultBuiltins = createShellBuiltins({
      virtualFileSystem: this.vfs,
      onPipInstall: this.onPipInstall,
      pendingPipInstallations: [],
      setLastPipInstallResult: () => {},
      environment: this.environment,
      getEnvironment: () => this.environment,
      setEnvironmentVariable: (key: string, value: string) => {
        this.environment[key] = value;
      },
      getAvailableCommands: () => Object.keys(this.builtins || {}),
      wasmRunner: this.wasmRunner,
    });

    this.builtins = {
      ...defaultBuiltins,
      ...(options.builtins || {}),
    };
    this.builtins.export = defaultBuiltins.export;
    this.builtins.env = defaultBuiltins.env;
  }

  public getEnvironment(): Record<string, string> {
    return this.environment;
  }

  public setEnvironmentVariable(key: string, value: string): void {
    this.environment[key] = value;
  }

  public getLastExitCode(): number {
    return this.lastExitCode;
  }

  public runScript(script: string, args: string[] = []): AstExecutionResult {
    const trimmed = (script || '').trim();
    if (!trimmed) return { output: '', exitCode: 0 };

    if (args.length > 0) this.positionalArguments = args;
    this.activeScriptContent = trimmed;

    const preprocessed = this.preprocessScript(trimmed);

    let ast: any;
    try {
      ast = parse(preprocessed, { mode: 'bash' });
    } catch {
      try {
        ast = parse(preprocessed, { mode: 'posix' });
      } catch (parseError: any) {
        return {
          output: '',
          error: `sh: syntax error: ${parseError?.message || 'parse error'}`,
          exitCode: 2,
        };
      }
    }

    return this.executeAstNode(ast);
  }

  public executeAstNode(node: any, input = ''): AstExecutionResult {
    if (!node || this.breakRequested) return { output: '', exitCode: 0 };

    switch (node.type) {
      case 'Script':
      case 'CompoundList':
      case 'Subshell':
        return this.executeCompoundList(node.commands || node.list?.commands || [], input);

      case 'Pipeline':
        return this.executePipeline(node.commands || [], input);

      case 'LogicalExpression':
        return this.executeLogicalExpression(node, input);

      case 'Command':
        return this.executeSimpleCommand(node, input);

      case 'If':
        return this.executeIf(node, input);

      case 'For':
        return this.executeFor(node, input);

      case 'While':
        return this.executeWhile(node, input);

      case 'Until':
        return this.executeUntil(node, input);

      case 'Case':
        return this.executeCase(node, input);

      case 'Function':
        if (node.name?.text) this.functions[node.name.text] = node.body;
        return { output: '', exitCode: 0 };

      default:
        return { output: '', exitCode: 0 };
    }
  }

  private executeCompoundList(commands: any[], input = ''): AstExecutionResult {
    const outputs: string[] = [];
    const errors: string[] = [];
    let currentInput = input;

    for (const cmdNode of commands) {
      if (this.breakRequested) break;
      const result = this.executeAstNode(cmdNode, currentInput);
      if (result.output) outputs.push(result.output);
      if (result.error) errors.push(result.error);
      this.lastExitCode = result.exitCode ?? 0;
      currentInput = '';
    }

    return {
      output: outputs.join('\n'),
      error: errors.length > 0 ? errors.join('\n') : undefined,
      exitCode: this.lastExitCode,
    };
  }

  private executeLogicalExpression(node: any, input = ''): AstExecutionResult {
    const leftResult = this.executeAstNode(node.left, input);
    this.lastExitCode = leftResult.exitCode ?? 0;

    const outputs: string[] = [];
    const errors: string[] = [];
    if (leftResult.output) outputs.push(leftResult.output);
    if (leftResult.error) errors.push(leftResult.error);

    const shouldRunRight = (node.op === 'and' && this.lastExitCode === 0) || (node.op === 'or' && this.lastExitCode !== 0);
    if (shouldRunRight && !this.breakRequested) {
      const rightResult = this.executeAstNode(node.right, '');
      if (rightResult.output) outputs.push(rightResult.output);
      if (rightResult.error) errors.push(rightResult.error);
      this.lastExitCode = rightResult.exitCode ?? 0;
    }

    return {
      output: outputs.join('\n'),
      error: errors.length > 0 ? errors.join('\n') : undefined,
      exitCode: this.lastExitCode,
    };
  }

  private executePipeline(commands: any[], initialInput = ''): AstExecutionResult {
    let intermediateInput = initialInput;
    let lastResult: AstExecutionResult = { output: '', exitCode: 0 };
    const accumulatedErrors: string[] = [];

    for (const cmdNode of commands) {
      lastResult = this.executeAstNode(cmdNode, intermediateInput);
      if (lastResult.error) accumulatedErrors.push(lastResult.error);
      intermediateInput = lastResult.output || '';
      this.lastExitCode = lastResult.exitCode ?? 0;
    }

    return {
      output: intermediateInput,
      error: accumulatedErrors.length > 0 ? accumulatedErrors.join('\n') : undefined,
      exitCode: this.lastExitCode,
    };
  }

  private executeIf(node: any, input = ''): AstExecutionResult {
    const clauseResult = this.executeAstNode(node.clause, input);
    const conditionSuccess = (clauseResult.exitCode ?? 0) === 0;

    if (conditionSuccess && node.then) return this.executeAstNode(node.then, '');
    if (!conditionSuccess && node.else) return this.executeAstNode(node.else, '');
    return { output: '', exitCode: clauseResult.exitCode ?? 0 };
  }

  private executeFor(node: any, _input = ''): AstExecutionResult {
    const varName = node.name?.text || 'i';
    const values = (node.wordlist || []).flatMap((w: any) => this.expandWordNode(w));
    const outputs: string[] = [];
    const errors: string[] = [];

    for (const val of values) {
      if (this.breakRequested) break;
      this.environment[varName] = val;
      if (node.do) {
        const stepResult = this.executeAstNode(node.do, '');
        if (stepResult.output) outputs.push(stepResult.output);
        if (stepResult.error) errors.push(stepResult.error);
        this.lastExitCode = stepResult.exitCode ?? 0;
      }
    }
    this.breakRequested = false;

    return {
      output: outputs.join('\n'),
      error: errors.length > 0 ? errors.join('\n') : undefined,
      exitCode: this.lastExitCode,
    };
  }

  private executeWhile(node: any, _input = ''): AstExecutionResult {
    const outputs: string[] = [];
    const errors: string[] = [];
    let iterations = 0;

    while (iterations++ < 10000) {
      if (this.breakRequested) break;
      const clauseResult = this.executeAstNode(node.clause, '');
      if ((clauseResult.exitCode ?? 0) !== 0) break;
      if (node.do) {
        const stepResult = this.executeAstNode(node.do, '');
        if (stepResult.output) outputs.push(stepResult.output);
        if (stepResult.error) errors.push(stepResult.error);
        this.lastExitCode = stepResult.exitCode ?? 0;
      }
    }
    this.breakRequested = false;

    return {
      output: outputs.join('\n'),
      error: errors.length > 0 ? errors.join('\n') : undefined,
      exitCode: this.lastExitCode,
    };
  }

  private executeUntil(node: any, _input = ''): AstExecutionResult {
    const outputs: string[] = [];
    const errors: string[] = [];
    let iterations = 0;

    while (iterations++ < 10000) {
      if (this.breakRequested) break;
      const clauseResult = this.executeAstNode(node.clause, '');
      if ((clauseResult.exitCode ?? 0) === 0) break;
      if (node.do) {
        const stepResult = this.executeAstNode(node.do, '');
        if (stepResult.output) outputs.push(stepResult.output);
        if (stepResult.error) errors.push(stepResult.error);
        this.lastExitCode = stepResult.exitCode ?? 0;
      }
    }
    this.breakRequested = false;

    return {
      output: outputs.join('\n'),
      error: errors.length > 0 ? errors.join('\n') : undefined,
      exitCode: this.lastExitCode,
    };
  }

  private executeCase(node: any, input = ''): AstExecutionResult {
    const targetVal = (this.expandWordNode(node.clause) || [])[0] || '';
    const cases = node.cases || [];

    for (const c of cases) {
      const matched = (c.pattern || []).some((pw: any) => {
        const pText = (this.expandWordNode(pw) || [])[0] || '';
        if (pText === '*' || pText === targetVal) return true;
        try {
          const re = new RegExp('^' + pText.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          return re.test(targetVal);
        } catch {
          return false;
        }
      });
      if (matched && c.body) return this.executeAstNode(c.body, input);
    }
    return { output: '', exitCode: 0 };
  }

  private executeSimpleCommand(node: any, pipedInput = ''): AstExecutionResult {
    const localEnv: Record<string, string> = {};
    if (node.prefix) {
      for (const prefixNode of node.prefix) {
        if (prefixNode.type === 'AssignmentWord' && prefixNode.text) {
          const eqIdx = prefixNode.text.indexOf('=');
          if (eqIdx !== -1) {
            const k = prefixNode.text.slice(0, eqIdx);
            const rawV = prefixNode.text.slice(eqIdx + 1);

            const idxMatch = k.match(/^([a-zA-Z_]\w*)\[(.*)\]$/);
            if (idxMatch) {
              const arrName = idxMatch[1];
              const arrIdx = parseInt(this.expandStringText(idxMatch[2]), 10) || 0;
              if (!this.arrays[arrName]) this.arrays[arrName] = [];
              const expandedV = this.expandStringText(rawV, prefixNode.expansion);
              this.arrays[arrName][arrIdx] = expandedV;
              this.environment[arrName] = this.arrays[arrName].filter(Boolean).join(' ');
            } else {
              const expandedV = this.expandStringText(rawV, prefixNode.expansion);
              if (!node.name) this.environment[k] = expandedV;
              else localEnv[k] = expandedV;
            }
          }
        }
      }
    }

    if (!node.name) return { output: '', exitCode: 0 };

    const commandName = (this.expandWordNode(node.name) || [])[0] || node.name.text;

    const directIdxMatch = commandName.match(/^([a-zA-Z_]\w*)\[(.*)\]=(.*)$/);
    if (directIdxMatch) {
      const arrName = directIdxMatch[1];
      const arrIdx = parseInt(this.expandStringText(directIdxMatch[2]), 10) || 0;
      if (!this.arrays[arrName]) this.arrays[arrName] = [];
      const expandedV = this.expandStringText(directIdxMatch[3]);
      this.arrays[arrName][arrIdx] = expandedV;
      this.environment[arrName] = this.arrays[arrName].filter(Boolean).join(' ');
      return { output: '', exitCode: 0 };
    }

    const argumentVector: string[] = [];
    let stdinFile: string | undefined;
    let stdoutFile: string | undefined;
    let appendStdout = false;

    if (node.suffix) {
      for (const s of node.suffix) {
        if (s.type === 'Redirect') {
          const op = s.op?.text;
          const targetFile = (this.expandWordNode(s.file) || [])[0] || s.file?.text;
          if (op === '<') stdinFile = targetFile;
          else if (op === '>') { stdoutFile = targetFile; appendStdout = false; }
          else if (op === '>>') { stdoutFile = targetFile; appendStdout = true; }
        } else {
          argumentVector.push(...this.expandWordNode(s));
        }
      }
    }

    let effectiveInput = pipedInput;
    if (stdinFile) {
      try {
        effectiveInput = this.vfs.readFile(stdinFile);
      } catch {
        return { output: '', error: `sh: ${stdinFile}: No such file or directory`, exitCode: 1 };
      }
    }

    if (commandName === 'break') { this.breakRequested = true; return { output: '', exitCode: 0 }; }
    if (commandName === '__dcl_set_array') {
      const arrName = argumentVector[0];
      const items = argumentVector.slice(1);
      this.arrays[arrName] = items;
      this.environment[arrName] = items.join(' ');
      return { output: '', exitCode: 0 };
    }
    if (commandName === 'trap') {
      if (argumentVector.length >= 2) this.traps[argumentVector[1]] = argumentVector[0];
      return { output: '', exitCode: 0 };
    }
    if (commandName === 'kill') {
      const sigArg = argumentVector.find((a) => a.startsWith('-SIG') || a.startsWith('-'));
      const sigName = sigArg ? sigArg.replace(/^-SIG|^-/, '') : 'SIGINT';
      const handler = this.traps[sigName] || this.traps[`SIG${sigName}`];
      if (handler) return this.runScript(handler);
      return { output: '', exitCode: 0 };
    }
    if (commandName === 'exit') {
      const code = parseInt(argumentVector[0], 10) || 0;
      this.lastExitCode = code;
      this.breakRequested = true;
      return { output: '', exitCode: code };
    }

    if (this.functions[commandName]) {
      const savedArgs = [...this.positionalArguments];
      const savedScript = this.activeScriptContent;
      this.positionalArguments = [commandName, ...argumentVector];
      const funcResult = this.executeAstNode(this.functions[commandName], effectiveInput);
      this.positionalArguments = savedArgs;
      this.activeScriptContent = savedScript;
      return funcResult;
    }

    if (commandName === 'bash' || commandName === 'sh') {
      if (argumentVector.length > 0) {
        const targetScript = argumentVector[0];
        const scriptContent = this.vfs.exists(targetScript) ? this.vfs.readFile(targetScript) : this.activeScriptContent;
        if (scriptContent) {
          const sub = new AstShellInterpreter({
            vfs: this.vfs,
            wasmRunner: this.wasmRunner,
            preferWasmOverBuiltins: this.preferWasmOverBuiltins,
            onPipInstall: this.onPipInstall,
            builtins: this.builtins,
          });
          return sub.runScript(scriptContent, argumentVector);
        }
      }
    }

    let result: CommandExecutionResult;
    const filesystemBuiltins = new Set([
      'cd',
      'pwd',
      'mkdir',
      'rmdir',
      'touch',
      'rm',
      'cp',
      'mv',
      'pip',
      'date',
      'which',
      'expr',
      'export',
      'env',
    ]);

    if (this.preferWasmOverBuiltins && this.wasmRunner && !filesystemBuiltins.has(commandName)) {
      const wasmRun = this.wasmRunner(commandName, argumentVector, effectiveInput);
      if (wasmRun.error && wasmRun.error.includes('applet not found')) {
        result = this.builtins[commandName] ? this.builtins[commandName](argumentVector, effectiveInput) : wasmRun;
      } else {
        result = wasmRun;
      }
    } else if (this.builtins[commandName]) {
      result = this.builtins[commandName](argumentVector, effectiveInput);
    } else if (this.wasmRunner) {
      result = this.wasmRunner(commandName, argumentVector, effectiveInput);
    } else {
      const isComparison = argumentVector.some(
        (a) =>
          a === '=' ||
          a === '==' ||
          a === '!=' ||
          a === '-eq' ||
          a === '-ne' ||
          a === '-gt' ||
          a === '-ge' ||
          a === '-lt' ||
          a === '-le' ||
          a === ']]' ||
          a === ']',
      );
      if (isComparison && this.builtins['test']) {
        result = this.builtins['test']([commandName, ...argumentVector]);
      } else {
        return { output: '', error: `${commandName}: command not found`, exitCode: 127 };
      }
    }

    if (stdoutFile) {
      try {
        const contentToWrite = (result.output || '') + (result.output ? '\n' : '');
        const existing = appendStdout && this.vfs.exists(stdoutFile) ? this.vfs.readFile(stdoutFile) : '';
        this.vfs.writeFile(stdoutFile, existing + contentToWrite);
        return { output: '', error: result.error, exitCode: result.exitCode ?? 0 };
      } catch (writeError: any) {
        return { output: '', error: `sh: cannot write ${stdoutFile}: ${writeError.message}`, exitCode: 1 };
      }
    }

    return { output: result.output || '', error: result.error, exitCode: result.exitCode ?? 0 };
  }

  private preprocessScript(script: string): string {
    const lines = (script || '').split('\n');
    const processed: string[] = [];
    let heredocTarget: string | null = null;
    let heredocBuffer: string[] = [];
    let heredocDelimiter: string | null = null;
    let procSubCounter = 0;

    for (let line of lines) {
      if (heredocDelimiter) {
        if (line.trim() === heredocDelimiter) {
          if (heredocTarget) {
            try { this.vfs.writeFile(heredocTarget, heredocBuffer.join('\n') + '\n'); } catch {}
          }
          heredocDelimiter = null;
          heredocTarget = null;
          heredocBuffer = [];
        } else {
          heredocBuffer.push(line);
        }
        continue;
      }

      const heredocMatch = line.match(/^(\s*cat\s*<<\s*([A-Za-z0-9_]+)\s*>\s*([^\s]+)\s*)$/);
      if (heredocMatch) {
        heredocDelimiter = heredocMatch[2];
        heredocTarget = heredocMatch[3];
        heredocBuffer = [];
        continue;
      }

      let l = line;
      l = l.replace(/<\(([^)]+)\)/g, (_, subCmd) => {
        const subRes = this.runScript(subCmd);
        const tmpFile = `/tmp/.proc_sub_${++procSubCounter}`;
        try { this.vfs.writeFile(tmpFile, subRes.output || ''); } catch {}
        return tmpFile;
      });
      l = l.replace(/^\s*function\s+([a-zA-Z_]\w*)\s*\{/g, '$1() {');
      l = l.replace(/^\s*function\s+([a-zA-Z_]\w*)\s*\(\s*\)\s*\{/g, '$1() {');
      l = l.replace(/\(\s*([^\n()]+?)\s*\)\s*(\|\||&&)/g, '$1 $2').replace(/(\|\||&&)\s*\(\s*([^\n()]+?)\s*\)/g, '$1 $2');
      const arrayInitMatch = l.match(/^\s*([a-zA-Z_]\w*)=\s*\(\s*(.*)\s*\)\s*$/);
      if (arrayInitMatch) {
        l = `__dcl_set_array ${arrayInitMatch[1]} ${arrayInitMatch[2].trim()}`;
      }
      processed.push(l);
    }
    return processed.join('\n');
  }

  private expandWordNode(wordNode: any): string[] {
    if (!wordNode) return [];
    const text = wordNode.text || '';
    const expansions = wordNode.expansion || [];
    const resolvedString = this.expandStringText(text, expansions);
    const globs = this.expandGlobs([resolvedString]);

    const result: string[] = [];
    for (const g of globs) {
      const isUnquotedExpansion = (text.includes('${') || text.includes('$@') || text.includes('$*')) && !text.startsWith('"') && !text.startsWith("'");
      const isQuotedArrayExpansion = text === `"\${${text.slice(3, -2)}}"` && text.includes('[@]');
      if (isUnquotedExpansion || isQuotedArrayExpansion) {
        result.push(...g.split(/\s+/).filter(Boolean));
      } else {
        result.push(g);
      }
    }
    return result;
  }

  public evaluateArithmeticExpression(expression: string): number {
    let substituted = expression;
    substituted = substituted.replace(/\$([0-9]+)/g, (_, indexString) => {
      const positionalValue = this.positionalArguments[parseInt(indexString, 10)];
      return positionalValue !== undefined && !isNaN(Number(positionalValue))
        ? positionalValue
        : '0';
    });
    const cleanExpression = substituted.replace(/\$([a-zA-Z_]\w*)/g, '$1');
    substituted = cleanExpression.replace(/([a-zA-Z_]\w*)/g, (match) => {
      const environmentValue = this.environment[match];
      return environmentValue !== undefined && !isNaN(Number(environmentValue))
        ? environmentValue
        : '0';
    });
    try {
      return Function(`"use strict"; return (${substituted});`)();
    } catch {
      return 0;
    }
  }

  private expandStringText(rawText: string, expansions?: any[]): string {
    if (!rawText) return '';
    let result = rawText;

    result = result.replace(/\$\(\((.*?)\)\)/g, (_, expression) =>
      String(this.evaluateArithmeticExpression(expression)),
    );
    result = result.replace(
      /\$\{([a-zA-Z_]\w*)(?:\[@\])?\/\/([^/]*)\/([^}]*)\}/g,
      (_, varName, pattern, repl) => (this.environment[varName] || '').split(pattern).join(repl),
    );
    result = result.replace(
      /\$\{([a-zA-Z_]\w*)(?:\[@\])?\/([^/]*)\/([^}]*)\}/g,
      (_, varName, pattern, repl) => (this.environment[varName] || '').replace(pattern, repl),
    );
    result = result.replace(
      /\$\{([a-zA-Z_]\w*)::([^}]+)\}/g,
      (_, varName, lenExpr) =>
        (this.environment[varName] || '').substring(0, this.evaluateArithmeticExpression(lenExpr)),
    );
    result = result.replace(
      /\$\{([a-zA-Z_]\w*):([^:]+):([^}]+)\}/g,
      (_, varName, offsetExpr, lenExpr) =>
        (this.environment[varName] || '').substring(
          this.evaluateArithmeticExpression(offsetExpr),
          this.evaluateArithmeticExpression(offsetExpr) +
            this.evaluateArithmeticExpression(lenExpr),
        ),
    );

    result = result.replace(/\$\{#([a-zA-Z_]\w*)\[[@*]\]\}/g, (_, arrName) => {
      const arr =
        this.arrays[arrName] ||
        (this.environment[arrName] ? this.environment[arrName].split(/\s+/) : []);
      return String(arr.length);
    });
    result = result.replace(/\$\{([a-zA-Z_]\w*)\[[@*]\]\}/g, (_, arrName) => {
      const arr =
        this.arrays[arrName] ||
        (this.environment[arrName] ? this.environment[arrName].split(/\s+/) : []);
      return arr.join(' ');
    });
    result = result.replace(/\$\{([a-zA-Z_]\w*)\[([^\]]+)\]\}/g, (_, arrName, idxExpr) => {
      const expandedIdx = this.expandStringText(idxExpr);
      const idx =
        this.evaluateArithmeticExpression(expandedIdx) || parseInt(expandedIdx, 10) || 0;
      const arr =
        this.arrays[arrName] ||
        (this.environment[arrName] ? this.environment[arrName].split(/\s+/) : []);
      return arr[idx] !== undefined ? arr[idx] : '';
    });

    if (expansions && expansions.length > 0) {
      for (const exp of expansions) {
        if (exp.type === 'ParameterExpansion') {
          const p = String(exp.parameter);
          let val = '';
          if (p === '?') val = String(this.lastExitCode);
          else if (p === '#') val = String(Math.max(0, this.positionalArguments.length - 1));
          else if (p === '$') val = '1';
          else if (p === '*' || p === '@') val = this.positionalArguments.slice(1).join(' ');
          else if (/^\d+$/.test(p)) val = this.positionalArguments[parseInt(p, 10)] !== undefined ? this.positionalArguments[parseInt(p, 10)] : '';
          else val = this.environment[p] !== undefined ? this.environment[p] : '';

          const searchKey = `$${p}`;
          const searchKeyBrace = `\${${p}}`;
          if (result.includes(searchKeyBrace)) result = result.replace(searchKeyBrace, val);
          else if (result.includes(searchKey)) result = result.replace(searchKey, val);
        } else if (exp.type === 'CommandExpansion') {
          const subResult = this.runScript(exp.command);
          const subOutput = (subResult.output || '').trim();
          result = result.replace(`$(${exp.command})`, subOutput).replace(`\`${exp.command}\``, subOutput);
        } else if (exp.type === 'ArithmeticExpansion') {
          result = result.replace(
            `$((${exp.expression}))`,
            String(this.evaluateArithmeticExpression(exp.expression)),
          );
        }
      }
    }

    result = result.replace(/\$([1-9]\d*)/g, (_, idxStr) => this.positionalArguments[parseInt(idxStr, 10)] !== undefined ? this.positionalArguments[parseInt(idxStr, 10)] : '');
    result = result.replace(/\$#/g, String(Math.max(0, this.positionalArguments.length - 1)));
    result = result.replace(/\$\*/g, this.positionalArguments.slice(1).join(' '));
    result = result.replace(/\$@/g, this.positionalArguments.slice(1).join(' '));
    result = result.replace(/\$([a-zA-Z_]\w*)/g, (_, varName) => this.environment[varName] !== undefined ? this.environment[varName] : '');
    result = result.replace(/\$\{([a-zA-Z_]\w*)\}/g, (_, varName) => this.environment[varName] !== undefined ? this.environment[varName] : '');
    result = result.replace(/\$\?/g, String(this.lastExitCode));

    if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
      result = result.slice(1, -1);
    }
    return result;
  }

  private expandGlobs(tokens: string[]): string[] {
    const result: string[] = [];
    for (const token of tokens) {
      if (!token.includes('*') && !token.includes('?')) {
        result.push(token);
        continue;
      }
      let targetDir = this.vfs.cwd();
      let pattern = token;
      let prefix = '';
      const lastSlash = token.lastIndexOf('/');
      if (lastSlash !== -1) {
        const dirPart = token.slice(0, lastSlash);
        pattern = token.slice(lastSlash + 1);
        targetDir = dirPart.startsWith('/') ? dirPart : `${this.vfs.cwd()}/${dirPart}`;
        prefix = dirPart + '/';
      }
      try {
        const entries = this.vfs.readdir(targetDir);
        let reStr = '^';
        for (let i = 0; i < pattern.length; i++) {
          const c = pattern[i];
          if (c === '*') reStr += '.*';
          else if (c === '?') reStr += '.';
          else if ('.+^$}{()|[]\\'.includes(c)) reStr += '\\' + c;
          else reStr += c;
        }
        const regex = new RegExp(reStr + '$');
        const matches = entries.filter((entry) => regex.test(entry)).sort();
        if (matches.length > 0) result.push(...matches.map((match) => prefix + match));
        else result.push(token);
      } catch {
        result.push(token);
      }
    }
    return result;
  }
}
