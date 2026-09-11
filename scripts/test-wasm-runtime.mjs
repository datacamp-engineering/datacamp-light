#!/usr/bin/env node

/**
 * End-to-End Node Integration Test for WebAssembly Runtimes & Python Modules
 *
 * Boots real Pyodide in Node, mounts POSIX VFS & Shell Interpreter, loads
 * native Python runtime modules (dcl_package_manager, dcl_shellwhat_parser,
 * dcl_shell_bridge, dcl_ipython), and executes Matplotlib, IPython, and
 * subprocess calls end-to-end to ensure zero runtime regressions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';
import { createEmscriptenVfs, createShellInterpreter } from '../src/runtime/shellInterpreter.ts';
import { SHELLWHAT_PY_SOURCES } from '../src/runtime/shellwhatSources.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDirectory = path.resolve(__dirname, '..');
const pythonDirectory = path.join(rootDirectory, 'src', 'runtime', 'python');

console.log(`\n======================================================================`);
console.log(` DataCamp Light v4 - WASM & Python Runtime Integration Test`);
console.log(`======================================================================\n`);

async function runIntegrationTest() {
  console.log('[Pyodide] Booting Python WebAssembly environment...');
  const pyodide = await loadPyodide();
  await pyodide.loadPackage('micropip');

  // 1. Install package manager shim
  const packageManagerSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_package_manager.py'), 'utf8');
  await pyodide.runPythonAsync(packageManagerSource);

  // 2. Load required dependencies
  await pyodide.loadPackage([
    'jinja2',
    'markupsafe',
    'asttokens',
    'six',
    'click',
    'packaging',
    'setuptools',
  ]);
  const micropip = pyodide.pyimport('micropip');
  await micropip.install(['pyodide_backend', 'bashlex']);

  // 3. Mount shellwhat sources into virtual filesystem
  try {
    pyodide.FS.mkdirTree('/lib/python3.12/site-packages/shellwhat/checks');
  } catch (error) {}
  for (const [filePath, content] of Object.entries(SHELLWHAT_PY_SOURCES)) {
    pyodide.FS.writeFile('/lib/python3.12/site-packages/shellwhat/' + filePath, content);
  }

  try { pyodide.FS.mkdir('/home'); } catch (error) {}
  try { pyodide.FS.mkdir('/home/repl'); } catch (error) {}
  try { pyodide.FS.mkdir('/tmp'); } catch (error) {}
  try { pyodide.FS.chdir('/home/repl'); } catch (error) {}

// 4. Mount VFS and Shell Interpreter
  const wasmVirtualFileSystem = createEmscriptenVfs(pyodide);
  const activeShell = createShellInterpreter({
    vfs: wasmVirtualFileSystem,
    onPipInstall: async (packages) => {
      try {
        await micropip.install(packages);
        return { output: 'Installed ' + packages.join(', '), exitCode: 0 };
      } catch (error) {
        return { error: 'pip: ' + String(error), exitCode: 1, output: '' };
      }
    },
  });

  globalThis.dcl_execute_shell = (commandString) => {
    const commandResult = activeShell.runCommand(commandString || '');
    return JSON.stringify(commandResult);
  };

  // 5. Load native Python modules
  console.log('[Modules] Loading dcl_shellwhat_parser, dcl_shell_bridge, dcl_ipython, dcl_introspection, dcl_plain_runner...');
  const shellwhatParserSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shellwhat_parser.py'), 'utf8');
  const shellBridgeSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shell_bridge.py'), 'utf8');
  const ipythonSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_ipython.py'), 'utf8');
  const introspectionSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_introspection.py'), 'utf8');
  const plainRunnerSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_plain_runner.py'), 'utf8');

  await pyodide.runPythonAsync(shellwhatParserSource);
  await pyodide.runPythonAsync(shellBridgeSource);
  await pyodide.runPythonAsync(ipythonSource);
  await pyodide.runPythonAsync(introspectionSource);
  await pyodide.runPythonAsync(plainRunnerSource);

  // 6. Load data science libraries
  console.log('[Packages] Preloading numpy and matplotlib...');
  await pyodide.loadPackage(['numpy', 'matplotlib']);

  const PyodideExercise = pyodide.pyimport('pyodide_backend').PyodideExercise;
  const exercise = PyodideExercise('', '', '');
  exercise.run_init();

  // Test Case 1: Matplotlib plotting (Playground Example 2)
  console.log('\n[Test 1] Executing Matplotlib plotting code (Playground Example 2)...');
  const plottingCode = `
import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 50)
y = np.sin(x)

plt.figure(figsize=(6, 3))
plt.plot(x, y, label="Sine Wave", color="#0578ff")
plt.title("Matplotlib Sine Wave")
plt.legend()
plt.show()
print("Plot generated successfully!")
`;
  const resultJson = exercise.run_code(plottingCode, 320, 320);
  const entries = JSON.parse(resultJson);

  const errorEntry = entries.find((entry) => entry.type === 'error');
  if (errorEntry) {
    throw new Error(`Matplotlib execution failed: ${errorEntry.payload}`);
  }

  const graphEntry = entries.find((entry) => entry.type === 'graph');
  if (!graphEntry || typeof graphEntry.payload !== 'string' || graphEntry.payload.length < 50) {
    throw new Error('Matplotlib execution did not emit SVG plot payload');
  }
  console.log(`  ✅ PASS: Emitted SVG graph payload (${graphEntry.payload.length} bytes) without error.`);

  // Test Case 2: Subprocess return types and font discovery
  console.log('\n[Test 2] Verifying subprocess bytes return type and fontconfig discovery...');
  const fontResult = await pyodide.runPythonAsync(`
from matplotlib.font_manager import _get_fontconfig_fonts
_get_fontconfig_fonts()
`);
  console.log('  ✅ PASS: font_manager discovery completed without TypeError.');

  // Test Case 3: IPython shell escape with virtual filesystem file creation
  console.log('\n[Test 3] Verifying IPython shell escape (!cat) on virtual filesystem...');
  pyodide.FS.writeFile('/home/repl/integration_test.txt', 'Hello WASM Integration');
  const transformPythonFunction = pyodide.globals.get('dcl_transform_ipython');
  const shellEscapeCode = transformPythonFunction('!cat integration_test.txt');
  const shellResultJson = exercise.run_code(shellEscapeCode, 320, 320);
  const shellEntries = JSON.parse(shellResultJson);
  const shellOutput = shellEntries.find((entry) => entry.type === 'output');
  if (!shellOutput || !shellOutput.payload.includes('Hello WASM Integration')) {
    throw new Error(`IPython shell escape failed: ${JSON.stringify(shellEntries)}`);
  }
  console.log('  ✅ PASS: IPython shell escape accurately read file from virtual filesystem.');

  // Test Case 4: IPython %whos magic
  console.log('\n[Test 4] Verifying IPython %whos magic table formatting...');
  const whosCode = transformPythonFunction('test_var = 12345\n%whos');
  const whosResultJson = exercise.run_code(whosCode, 320, 320);
  const whosEntries = JSON.parse(whosResultJson);
  const whosOutput = whosEntries.find((entry) => entry.type === 'output');
  if (!whosOutput || !whosOutput.payload.includes('test_var') || !whosOutput.payload.includes('12345')) {
    throw new Error(`%whos magic output failed: ${JSON.stringify(whosEntries)}`);
  }
  console.log('  ✅ PASS: %whos magic formatted variables table successfully.');

  // Test Case 5: Dynamic introspection via dcl_introspect
  console.log('\n[Test 5] Verifying runtime dynamic autocompletion introspection (dcl_introspect)...');
  const introspectPythonFunction = pyodide.globals.get('dcl_introspect');
  const introspectionResultJson = introspectPythonFunction('import numpy as np\nnp.', 2, 3, 'np.', '.');
  const introspectionSuggestions = JSON.parse(introspectionResultJson);
  if (!Array.isArray(introspectionSuggestions) || introspectionSuggestions.length === 0) {
    throw new Error('dcl_introspect returned empty suggestions for np.');
  }
  const hasLinspace = introspectionSuggestions.some((item) => item.label === 'linspace');
  if (!hasLinspace) {
    throw new Error('dcl_introspect did not find linspace on np');
  }
  console.log(`  ✅ PASS: dcl_introspect returned ${introspectionSuggestions.length} attributes on np (including linspace).`);

  // Test Case 6: Post-execution live variables in dcl_introspect
  console.log('\n[Test 6] Verifying live variables visibility in autocompletion after code execution...');
  exercise.run_code('post_exec_metric_score = 98.7\nuser_id_lookup = "usr_123"', 320, 320);
  if (exercise && exercise.user_process && exercise.user_process.shell) {
    pyodide.globals.set('_dcl_active_locals', exercise.user_process.shell.locals);
  }
  const postExecJson = introspectPythonFunction('', 0, 0, 'post_exec', '');
  const postExecSuggestions = JSON.parse(postExecJson);
  const foundMetric = postExecSuggestions.find((item) => item.label === 'post_exec_metric_score');
  if (!foundMetric || foundMetric.type !== 'variable') {
    throw new Error(`post_exec_metric_score not found in live introspection: ${postExecJson}`);
  }
  console.log('  ✅ PASS: Post-execution live variables discovered with correct types.');

  // Test Case 7: Static in-editor variables and functions without code execution
  console.log('\n[Test 7] Verifying static in-editor symbols without code execution...');
  const unexecutedBuffer = `
unexecuted_dataset_path = "/data/file.csv"
def parse_records(raw_rows):
    """Parses raw row records."""
    pass
class DataPipeline:
    pass
`;
  const staticJson = introspectPythonFunction(unexecutedBuffer, 0, 0, 'unexec', '');
  const staticSuggestions = JSON.parse(staticJson);
  const foundDataset = staticSuggestions.find((item) => item.label === 'unexecuted_dataset_path');
  if (!foundDataset || foundDataset.type !== 'variable') {
    throw new Error(`unexecuted_dataset_path not found in static introspection: ${staticJson}`);
  }

  const staticFuncJson = introspectPythonFunction(unexecutedBuffer, 0, 0, 'parse_rec', '');
  const staticFuncSuggestions = JSON.parse(staticFuncJson);
  const foundFunc = staticFuncSuggestions.find((item) => item.label === 'parse_records');
  if (!foundFunc || foundFunc.type !== 'function' || foundFunc.detail !== '(raw_rows)') {
    throw new Error(`parse_records function not found in static introspection: ${staticFuncJson}`);
  }
  console.log('  ✅ PASS: Static in-code variables and functions discovered without execution.');

  // Test Case 8: Python and Shell shared virtual filesystem (Python writes file -> Shell reads file via runCommand)
  console.log('\n[Test 8] Verifying Python -> Shell shared filesystem...');
  await pyodide.runPythonAsync(`
with open('python_to_shell.txt', 'w') as file:
    file.write('hello from python')
`);
  const shellReadResult = activeShell.runCommand('cat python_to_shell.txt');
  if (shellReadResult.output !== 'hello from python') {
    throw new Error(`Python -> Shell shared VFS failed: ${JSON.stringify(shellReadResult)}`);
  }

  const shellLsResult = activeShell.runCommand('ls');
  if (!shellLsResult.output || !shellLsResult.output.includes('python_to_shell.txt')) {
    throw new Error(`Shell ls did not find python_to_shell.txt: ${JSON.stringify(shellLsResult)}`);
  }

  const pythonBangLs = transformPythonFunction('!ls');
  const bangLsResultJson = exercise.run_code(pythonBangLs, 320, 320);
  const bangLsEntries = JSON.parse(bangLsResultJson);
  const bangLsOutput = bangLsEntries.find((entry) => entry.type === 'output');
  if (!bangLsOutput || !bangLsOutput.payload.includes('python_to_shell.txt')) {
    throw new Error(`Python !ls did not find python_to_shell.txt: ${JSON.stringify(bangLsEntries)}`);
  }
  console.log('  ✅ PASS: Python wrote file, Shell read it via runCommand, and !ls lists it in Python.');

  // Test Case 9: Shell and Python shared virtual filesystem (Shell creates file -> Python reads file)
  console.log('\n[Test 9] Verifying Shell -> Python shared filesystem...');
  activeShell.runCommand('echo hello-from-shell > shell_to_python.txt');
  const pythonReadBack = await pyodide.runPythonAsync(`open('shell_to_python.txt').read()`);
  if (pythonReadBack !== 'hello-from-shell\n') {
    throw new Error(`Shell -> Python shared VFS failed: ${JSON.stringify(pythonReadBack)}`);
  }
  console.log('  ✅ PASS: Shell created file and Python read it.');

  // Test Case 10: Shell pip install inside Pyodide worker
  console.log('\n[Test 10] Verifying shell pip install inside Pyodide worker...');
  const pipInitialResult = activeShell.runCommand('pip install idna');
  if (!pipInitialResult.output || !pipInitialResult.output.includes('Installing')) {
    throw new Error(`pip install did not return install feedback: ${JSON.stringify(pipInitialResult)}`);
  }
  await activeShell.waitForPipInstall();
  const pipFinalResult = activeShell.getLastPipInstallResult();
  if (!pipFinalResult || pipFinalResult.exitCode !== 0) {
    throw new Error(`pip install failed: ${JSON.stringify(pipFinalResult)}`);
  }
  await pyodide.pyimport('idna');
  console.log('  ✅ PASS: pip install installed idna and module imports in Pyodide.');

  // Test Case 11: writeFile / readFile contract over the shared virtual filesystem
  // (the shellWorker JSON-RPC handlers wrap exactly these interpreter calls; the
  // wire-level RPC round-trip is exercised in shellWorker.spec.ts under vitest)
  console.log('\n[Test 11] Verifying writeFile/readFile contract over shared VFS...');
  const sharedVfs = activeShell.getVfs();
  sharedVfs.writeFile('/home/repl/rpc_shared.txt', 'hello rpc');
  const rpcReadBack = sharedVfs.readFile('/home/repl/rpc_shared.txt');
  if (rpcReadBack !== 'hello rpc') {
    throw new Error(`writeFile/readFile contract failed: ${JSON.stringify(rpcReadBack)}`);
  }
  // Relative paths resolve against the shell cwd exactly as the RPC handlers do.
  const relativeWrite = activeShell.writeFile('rpc_relative.txt', 'relative path');
  const relativeRead = activeShell.getVfs().readFile('/home/repl/rpc_relative.txt');
  if (relativeRead !== 'relative path') {
    throw new Error(`writeFile/readFile relative path resolution failed: ${JSON.stringify(relativeRead)}`);
  }
  console.log('  ✅ PASS: writeFile/readFile contract round-trip and cwd resolution succeeded.');

  // Test Case 12: Plain Python execution via _dcl_run_plain_code (non-SCT path)
  console.log('\n[Test 12] Verifying plain Python execution via _dcl_run_plain_code (zero-dependency path)...');
  const plainRunnerFunction = pyodide.globals.get('_dcl_run_plain_code');
  const plainResultJson = plainRunnerFunction('val_a = 21\nval_b = 2\nval_a * val_b');
  const plainEntries = JSON.parse(plainResultJson);
  const plainOutput = plainEntries.find((entry) => entry.type === 'output');
  if (!plainOutput || !plainOutput.payload.includes('42')) {
    throw new Error(`Plain Python execution failed: ${JSON.stringify(plainEntries)}`);
  }
  console.log('  ✅ PASS: Plain Python execution captured stdout expression result correctly.');

  // Test Case 13: shellwhat SCT evaluation via evaluate_shellwhat
  console.log('\n[Test 13] Verifying shellwhat AST evaluation via evaluate_shellwhat...');
  const evaluateShellwhatFunction = pyodide.globals.get('evaluate_shellwhat');
  const shellwhatRaw = evaluateShellwhatFunction(
    "Ex().has_output('testing_shellwhat')",
    'echo testing_shellwhat',
    'testing_shellwhat\n',
    '',
    'echo testing_shellwhat',
  );
  const shellwhatParsed = JSON.parse(shellwhatRaw);
  if (!shellwhatParsed.correct) {
    throw new Error(`shellwhat evaluation failed: ${shellwhatRaw}`);
  }
  console.log('  ✅ PASS: shellwhat evaluation parsed AST and returned correct = true.');

  // Test Case 14: Matplotlib plotting in plain execution mode (_dcl_run_plain_code)
  console.log('\n[Test 14] Verifying Matplotlib plotting in plain execution mode (notebook runner)...');
  const plainPlotCode = `
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 5, 20)
y = x ** 2
plt.figure(figsize=(5, 3))
plt.plot(x, y, color='#0578ff')
plt.title('Plain Mode Curve')
plt.show()
print('Plotted in plain mode!')
`;
  const plainPlotResultJson = plainRunnerFunction(plainPlotCode);
  const plainPlotEntries = JSON.parse(plainPlotResultJson);
  const plainPlotGraph = plainPlotEntries.find((entry) => entry.type === 'graph');
  const plainPlotError = plainPlotEntries.find((entry) => entry.type === 'error');
  if (plainPlotError) {
    throw new Error(`Plain Matplotlib execution error: ${plainPlotError.payload}`);
  }
  if (!plainPlotGraph || !plainPlotGraph.payload || plainPlotGraph.payload.length < 50) {
    throw new Error(`Plain Matplotlib did not produce graph: ${plainPlotResultJson}`);
  }
  console.log(`  ✅ PASS: Plain mode Matplotlib generated graph SVG (${plainPlotGraph.payload.length} bytes) without error.`);

  console.log(`\n======================================================================`);
  console.log(` All WASM & Python Integration Tests PASSED (14/14)`);
  console.log(`======================================================================\n`);
}

runIntegrationTest().catch((error) => {
  console.error('\n❌ Fatal Integration Test Failure:', error);
  process.exit(1);
});
