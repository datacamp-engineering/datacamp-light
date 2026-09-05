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
  try { pyodide.FS.mkdir('/home/pyodide'); } catch (error) {}
  try { pyodide.FS.mkdir('/tmp'); } catch (error) {}
  try { pyodide.FS.chdir('/home/pyodide'); } catch (error) {}

  // 4. Mount VFS and Shell Interpreter
  const wasmVirtualFileSystem = createEmscriptenVfs(pyodide);
  const activeShell = createShellInterpreter({ vfs: wasmVirtualFileSystem });

  globalThis.dcl_execute_shell = (commandString) => {
    const commandResult = activeShell.runCommand(commandString || '');
    return JSON.stringify(commandResult);
  };

  // 5. Load native Python modules
  console.log('[Modules] Loading dcl_shellwhat_parser, dcl_shell_bridge, dcl_ipython, dcl_introspection...');
  const shellwhatParserSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shellwhat_parser.py'), 'utf8');
  const shellBridgeSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shell_bridge.py'), 'utf8');
  const ipythonSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_ipython.py'), 'utf8');
  const introspectionSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_introspection.py'), 'utf8');

  await pyodide.runPythonAsync(shellwhatParserSource);
  await pyodide.runPythonAsync(shellBridgeSource);
  await pyodide.runPythonAsync(ipythonSource);
  await pyodide.runPythonAsync(introspectionSource);

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
  pyodide.FS.writeFile('/home/pyodide/integration_test.txt', 'Hello WASM Integration');
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

  console.log(`\n======================================================================`);
  console.log(` All WASM & Python Integration Tests PASSED (4/4)`);
  console.log(`======================================================================\n`);
}

runIntegrationTest().catch((error) => {
  console.error('\n❌ Fatal Integration Test Failure:', error);
  process.exit(1);
});
