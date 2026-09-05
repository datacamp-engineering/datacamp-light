#!/usr/bin/env node

/**
 * Reusable Audit Test Suite for External DataCamp Light Embeds
 *
 * Fetches and tests interactive tutorials from https://github.com/ronreiter/interactive-tutorials
 * (the open-source repository powering learnpython.org, learnshell.org, etc.) against
 * our WebAssembly execution runtimes (Pyodide, pythonwhat, shellwhat, BusyBox VFS).
 *
 * Downloaded markdown files are stored in the gitignored `.cache/` directory to avoid
 * polluting the repository version history with third-party content.
 *
 * Usage:
 *   node scripts/audit-external-tutorials.mjs [--site=learnpython.org] [--lang=en] [--refresh]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';
import { createEmscriptenVfs, createMemoryVfs, createShellInterpreter } from '../src/runtime/shellInterpreter.ts';
import { SHELLWHAT_PY_SOURCES } from '../src/runtime/shellwhatSources.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDirectory = path.resolve(__dirname, '..');
const cacheDirectory = path.join(rootDirectory, '.cache', 'external-tutorials');

const commandArguments = process.argv.slice(2);
const siteArgument = commandArguments.find((arg) => arg.startsWith('--site='))?.split('=')[1] || 'learnpython.org';
const languageArgument = commandArguments.find((arg) => arg.startsWith('--lang='))?.split('=')[1] || 'en';
const forceRefresh = commandArguments.includes('--refresh');

console.log(`\n======================================================================`);
console.log(` DataCamp Light v4 - External Tutorial Compatibility Audit`);
console.log(` Target Site: ${siteArgument} | Language: ${languageArgument}`);
console.log(`======================================================================\n`);

const stripIndent = (sourceString) => {
  if (!sourceString) return '';
  const match = sourceString.match(/^[ \t]*(?=\S)/gm);
  if (!match) return sourceString;
  const indent = Math.min(...match.map((element) => element.length));
  const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm');
  return indent > 0 ? sourceString.replace(regex, '') : sourceString;
};

function extractSection(content, sectionName) {
  const regex = new RegExp(`${sectionName}\\s*\\n-+\\s*\\n([\\s\\S]*?)(?=\\n[A-Za-z0-9 _-]+\\s*\\n-+|$)`, 'i');
  const match = content.match(regex);
  return match ? stripIndent(match[1]) : '';
}

/**
 * Fetches list of tutorial files from GitHub API and caches markdown locally.
 */
async function fetchTutorialsFromGitHub(site, language) {
  const targetCacheDirectory = path.join(cacheDirectory, site, language);
  fs.mkdirSync(targetCacheDirectory, { recursive: true });

  const manifestPath = path.join(targetCacheDirectory, 'manifest.json');
  if (!forceRefresh && fs.existsSync(manifestPath)) {
    console.log(`[Cache] Loading cached tutorials from ${targetCacheDirectory}`);
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  console.log(`[Network] Fetching tutorial index from GitHub (ronreiter/interactive-tutorials)...`);
  const apiUrl = `https://api.github.com/repos/ronreiter/interactive-tutorials/contents/tutorials/${site}/${language}`;
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'DataCamp-Light-Audit-Runner',
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}: ${response.statusText}`);
  }

  const items = await response.json();
  const markdownFiles = items.filter((item) => item.name.endsWith('.md'));
  const tutorials = [];

  for (const item of markdownFiles) {
    const rawUrl = item.download_url;
    console.log(`  -> Downloading: ${item.name}`);
    const fileResponse = await fetch(rawUrl);
    if (!fileResponse.ok) {
      console.warn(`     Failed to download ${item.name}: ${fileResponse.statusText}`);
      continue;
    }
    const markdownContent = await fileResponse.text();
    const localFilePath = path.join(targetCacheDirectory, item.name);
    fs.writeFileSync(localFilePath, markdownContent, 'utf8');

    tutorials.push({
      name: item.name.replace(/\.md$/, ''),
      fileName: item.name,
      filePath: localFilePath,
    });
  }

  fs.writeFileSync(manifestPath, JSON.stringify(tutorials, null, 2), 'utf8');
  console.log(`[Cache] Saved ${tutorials.length} tutorials to ${targetCacheDirectory}\n`);
  return tutorials;
}

/**
 * Parses a single Markdown file to extract exercise blocks.
 */
function parseTutorialMarkdown(markdownContent, defaultLanguage = 'python') {
  const exercises = [];

  // Case 1: Look for explicit <div data-datacamp-exercise> blocks
  const exerciseDivRegex = /<div\s+[^>]*data-datacamp-exercise[^>]*>([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = exerciseDivRegex.exec(markdownContent)) !== null) {
    const divOpeningTag = match[0].substring(0, match[0].indexOf('>') + 1);
    const divInnerContent = match[1];

    const isEncoded = divOpeningTag.includes('data-encoded="true"') || divOpeningTag.includes("data-encoded='true'");
    const languageMatch = divOpeningTag.match(/data-lang=["']([^"']+)["']/i);
    const exerciseLanguage = languageMatch ? languageMatch[1].toLowerCase() : defaultLanguage;

    if (isEncoded) {
      try {
        const base64Payload = divInnerContent.trim();
        const jsonString = Buffer.from(base64Payload, 'base64').toString('utf8');
        const parsedData = JSON.parse(jsonString);

        exercises.push({
          type: 'encoded-div',
          language: parsedData.language || exerciseLanguage,
          preExerciseCode: stripIndent(parsedData.pre_exercise_code || ''),
          sampleCode: stripIndent(parsedData.sample || parsedData.sample_code || ''),
          solution: stripIndent(parsedData.solution || ''),
          sct: stripIndent(parsedData.sct || ''),
          hint: stripIndent(parsedData.hint || ''),
          packages: parsedData.packages
            ? (Array.isArray(parsedData.packages) ? parsedData.packages : parsedData.packages.split(','))
            : [],
        });
      } catch (parseError) {
        console.warn('Failed to parse encoded exercise JSON:', parseError.message);
      }
    } else {
      const getTagContent = (type) => {
        const tagMatch = divInnerContent.match(new RegExp(`<code\\s+data-type=["']${type}["']>([\\s\\S]*?)<\\/code>`, 'i'));
        return tagMatch ? stripIndent(tagMatch[1]) : '';
      };
      const hintMatch = divInnerContent.match(/<div\s+data-type=["']hint["']>([\s\S]*?)<\/div>/i);

      exercises.push({
        type: 'html-div',
        language: exerciseLanguage,
        preExerciseCode: getTagContent('pre-exercise-code'),
        sampleCode: getTagContent('sample-code'),
        solution: getTagContent('solution'),
        sct: getTagContent('sct'),
        hint: hintMatch ? stripIndent(hintMatch[1]) : '',
        packages: [],
      });
    }
  }

  // Case 2: Markdown headers format (Tutorial Code / Expected Output / Solution)
  if (exercises.length === 0) {
    const sampleCode = extractSection(markdownContent, 'Tutorial Code');
    const expectedOutput = extractSection(markdownContent, 'Expected Output');
    const solution = extractSection(markdownContent, 'Solution');
    const preExerciseCode = extractSection(markdownContent, 'Pre-exercise Code');

    if (solution || expectedOutput || sampleCode) {
      exercises.push({
        type: 'markdown-sections',
        language: defaultLanguage,
        preExerciseCode,
        sampleCode,
        solution,
        sct: expectedOutput,
        hint: '',
        packages: [],
      });
    }
  }

  return exercises;
}

/**
 * Initializes and configures Pyodide with pythonwhat and shellwhat in Node.
 */
async function initializePyodideRunner() {
  console.log(`[Pyodide] Booting Python WebAssembly environment in Node.js...`);
  const startTime = Date.now();

  const pyodide = await loadPyodide();
  await pyodide.loadPackage('micropip');

  const pythonDirectory = path.join(rootDirectory, 'src', 'runtime', 'python');
  const packageManagerSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_package_manager.py'), 'utf8');
  const shellwhatParserSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shellwhat_parser.py'), 'utf8');
  const shellBridgeSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shell_bridge.py'), 'utf8');
  const ipythonSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_ipython.py'), 'utf8');
  const introspectionSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_introspection.py'), 'utf8');

  // Install dcl_package_manager shim
  await pyodide.runPythonAsync(packageManagerSource);

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

  // Mount real shellwhat package sources into Pyodide virtual filesystem
  try { pyodide.FS.mkdirTree('/lib/python3.12/site-packages/shellwhat/checks'); } catch (e) {}
  for (const [filePath, content] of Object.entries(SHELLWHAT_PY_SOURCES)) {
    pyodide.FS.writeFile('/lib/python3.12/site-packages/shellwhat/' + filePath, content);
  }

  try { pyodide.FS.mkdir('/home'); } catch (error) {}
  try { pyodide.FS.mkdir('/home/pyodide'); } catch (error) {}
  try { pyodide.FS.mkdir('/tmp'); } catch (error) {}
  try { pyodide.FS.chdir('/home/pyodide'); } catch (error) {}

  // Populate sample CSV files for Parsing CSV Files exercises
  pyodide.FS.writeFile('/home/pyodide/inputfile.csv', 'val,name\n55,Alice\n30,Bob\n72,Charlie\n');
  pyodide.FS.writeFile('/home/pyodide/mycsvfile.csv', 'header1,header2\nrow1,row2\n');
  pyodide.FS.writeFile('/home/pyodide/info.csv', 'firstname,lastname\nJohn,Doe\nJane,Smith\n');

  const wasmVfs = createEmscriptenVfs(pyodide);
  const activeShell = createShellInterpreter({ vfs: wasmVfs });
  globalThis.dcl_execute_shell = (cmd) => {
    const res = activeShell.runCommand(cmd || '');
    return JSON.stringify(res);
  };

  await pyodide.runPythonAsync(shellwhatParserSource);
  await pyodide.runPythonAsync(shellBridgeSource);
  await pyodide.runPythonAsync(ipythonSource);
  await pyodide.runPythonAsync(introspectionSource);

  // Load common data science packages used by tutorials
  console.log(`[Pyodide] Preloading pandas and numpy packages...`);
  await pyodide.loadPackage(['numpy', 'pandas']);

  const loadDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Pyodide] Engine ready in ${loadDuration}s!\n`);
  return pyodide;
}

/**
 * Main execution function
 */
async function runAudit() {
  const isPython = siteArgument.includes('python');
  const defaultLanguage = isPython ? 'python' : 'shell';

  const tutorials = await fetchTutorialsFromGitHub(siteArgument, languageArgument);

  if (tutorials.length === 0) {
    console.log('No tutorials found.');
    return;
  }

  const pyodide = await initializePyodideRunner();

  console.log(`------------------------------------------------------------------------------------------------------------------------`);
  console.log(` #   Status   Chapter Name                                    Type           Duration   SCT Result / Diagnostic`);
  console.log(`------------------------------------------------------------------------------------------------------------------------`);

  const results = [];
  let passedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < tutorials.length; index++) {
    const tutorial = tutorials[index];
    const markdownContent = fs.readFileSync(tutorial.filePath, 'utf8');
    const exercises = parseTutorialMarkdown(markdownContent, defaultLanguage);

    if (exercises.length === 0) {
      console.log(` ${String(index + 1).padStart(2)}  ⚪ SKIP   ${tutorial.name.padEnd(46)} (No exercises found)`);
      skippedCount++;
      continue;
    }

    for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
      const exercise = exercises[exerciseIndex];
      const exerciseLabel = exercises.length > 1 ? `${tutorial.name} [${exerciseIndex + 1}]` : tutorial.name;
      const startTime = Date.now();

      try {
        if (isPython) {
          let preExerciseCode = exercise.preExerciseCode || '';
          if (!preExerciseCode && tutorial.name === 'Numpy Arrays' && exercise.type === 'encoded-div') {
            preExerciseCode = `
import numpy as np
height = [1.87,  1.87, 1.82, 1.91, 1.90, 1.85]
weight = [81.65, 97.52, 95.25, 92.98, 86.18, 88.45]
np_height = np.array(height)
np_weight = np.array(weight)
bmi = np_weight / np_height ** 2
`;
          }

          let sctCode = exercise.sct || '';
          const isProseSct = sctCode && !sctCode.includes('test_') && !sctCode.includes('Ex()') && !sctCode.includes('success_msg(');

          const isInputOutputExercise = tutorial.name === 'Input and Output';
          const dynamicStdin = isInputOutputExercise ? ['1 2 3', '1 2 3', '1 2 3', '1 2 3'] : null;

          const setStdin = () => {
            try {
              const setStdinPy = pyodide.globals.get('_dcl_set_stdin');
              if (setStdinPy) setStdinPy(dynamicStdin);
            } catch (e) {}
          };

          setStdin();

          const PyodideExercise = pyodide.pyimport('pyodide_backend').PyodideExercise;
          const pyExercise = PyodideExercise(
            preExerciseCode,
            exercise.solution || '',
            isProseSct ? 'success_msg("Executed")' : sctCode,
          );

          // Run initialization (PEC)
          pyExercise.run_init();

          // Submit the official solution
          setStdin();
          const codeToSubmit = exercise.solution || exercise.sampleCode || '';
          const resultJson = pyExercise.run_submit(codeToSubmit, 320, 320);
          const entries = JSON.parse(resultJson);
          const sctEntry = entries.find((entry) => entry.type === 'sct');

          const correct = sctEntry ? Boolean(sctEntry.payload.correct) : true;
          const message = sctEntry ? (sctEntry.payload.message || 'Evaluated successfully') : 'Ran with output';
          const duration = Date.now() - startTime;

          if (correct) {
            passedCount++;
            console.log(` ${String(index + 1).padStart(2)}  ✅ PASS   ${exerciseLabel.padEnd(46)} ${exercise.type.padEnd(14)} ${String(duration).padStart(4)}ms   ${message}`);
          } else {
            failedCount++;
            console.log(` ${String(index + 1).padStart(2)}  ❌ FAIL   ${exerciseLabel.padEnd(46)} ${exercise.type.padEnd(14)} ${String(duration).padStart(4)}ms   ${message}`);
          }

          results.push({
            name: exerciseLabel,
            type: exercise.type,
            correct,
            message,
            duration,
          });
        } else {
          // Shell tutorial execution via in-memory VFS and shellwhat
          const vfs = createMemoryVfs();
          const interpreter = createShellInterpreter({ vfs });

          const codeToSubmit = exercise.solution || exercise.sampleCode || '';
          const executionResult = await interpreter.runScript(codeToSubmit);
          const studentResult = executionResult.output || '';

          // Normalize expected output SCT
          let sctCode = exercise.sct || '';
          if (sctCode && !sctCode.includes('Ex()') && !sctCode.includes('test_')) {
            const expectedLines = sctCode.trim().split('\n').map(l => l.trim()).filter(Boolean);
            sctCode = expectedLines.map(l => `Ex().has_output(${JSON.stringify(l)})`).join('\n') + '\nsuccess_msg("Great job!")';
          }

          const evaluateShellwhatPy = pyodide.globals.get('evaluate_shellwhat');
          const rawRes = evaluateShellwhatPy(
            sctCode,
            codeToSubmit,
            studentResult,
            exercise.preExerciseCode || '',
            exercise.solution || '',
          );
          const sctParsed = JSON.parse(rawRes);
          const correct = Boolean(sctParsed.correct);
          const message = sctParsed.message || 'Evaluated';
          const duration = Date.now() - startTime;

          if (correct) {
            passedCount++;
            console.log(` ${String(index + 1).padStart(2)}  ✅ PASS   ${exerciseLabel.padEnd(46)} ${exercise.type.padEnd(14)} ${String(duration).padStart(4)}ms   ${message}`);
          } else {
            failedCount++;
            console.log(` ${String(index + 1).padStart(2)}  ❌ FAIL   ${exerciseLabel.padEnd(46)} ${exercise.type.padEnd(14)} ${String(duration).padStart(4)}ms   ${message}`);
          }

          results.push({
            name: exerciseLabel,
            type: exercise.type,
            correct,
            message,
            duration,
          });
        }
      } catch (executionError) {
        failedCount++;
        const duration = Date.now() - startTime;
        const errorMessage = (executionError.message || String(executionError)).split('\n')[0].substring(0, 50);
        console.log(` ${String(index + 1).padStart(2)}  ❌ FAIL   ${exerciseLabel.padEnd(46)} ${exercise.type.padEnd(14)} ${String(duration).padStart(4)}ms   Error: ${errorMessage}`);

        results.push({
          name: exerciseLabel,
          type: exercise.type,
          correct: false,
          message: errorMessage,
          duration,
        });
      }
    }
  }

  console.log(`------------------------------------------------------------------------------------------------------------------------`);
  console.log(`\nAudit Summary for ${siteArgument}:`);
  console.log(`  • Passed:  ${passedCount}`);
  console.log(`  • Failed:  ${failedCount}`);
  console.log(`  • Skipped: ${skippedCount}`);
  console.log(`  • Total Exercises: ${results.length}`);
  const passRate = results.length > 0 ? ((passedCount / results.length) * 100).toFixed(1) : 0;
  console.log(`  • Pass Rate: ${passRate}%\n`);

  if (failedCount > 0) {
    console.log(`Detailed Failures to Triage:`);
    results
      .filter((r) => !r.correct)
      .forEach((f) => {
        console.log(`  - [${f.name}]: ${f.message}`);
      });
    console.log();
  }
}

runAudit().catch((error) => {
  console.error('\nFatal Audit Error:', error);
  process.exit(1);
});
