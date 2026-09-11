#!/usr/bin/env node

/**
 * Media-App Strapi Tutorial Audit for DataCamp Light v4
 *
 * Fetches Strapi tutorial content (via the CMS REST API) for the media-app
 * tutorial slugs that contain `data-datacamp-exercise` blocks, parses the
 * exercise definitions from the rich-text HTML, and runs them through the
 * v4 runtime (Pyodide + pythonwhat) to validate exercise compatibility.
 *
 * Focuses on Python exercises (the majority); R exercises are reported but
 * skipped (webR cannot run in Node with the current audit infrastructure).
 *
 * Usage:
 *   CMS_BASE_URL=http://cms.datacamp.test \
 *   CMS_API_TOKEN_READ_ONLY=... \
 *   node scripts/audit-media-app.mjs [--locale=en] [--slug=python-list-comprehension] [--refresh]
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

const cmsBaseUrl = process.env.CMS_BASE_URL || 'http://127.0.0.1:1337';
const cmsToken = process.env.CMS_API_TOKEN_READ_ONLY || '';

const commandArguments = process.argv.slice(2);
const localeArgument = commandArguments.find((arg) => arg.startsWith('--locale='))?.split('=')[1] || 'en';
const slugArgument = commandArguments.find((arg) => arg.startsWith('--slug='))?.split('=')[1] || null;

console.log(`\n======================================================================`);
console.log(` DataCamp Light v4 — Media-App Strapi Tutorial Compatibility Audit`);
console.log(` Locale: ${localeArgument}${slugArgument ? ` | Slug: ${slugArgument}` : ' | All slugs'}`);
console.log(`======================================================================\n`);

// ---------------------------------------------------------------------------
// Slug/locale matrix (media-app tutorials containing data-datacamp-exercise)
// ---------------------------------------------------------------------------

const MEDIA_APP_SLUGS = [
  // English (en) — python
  { slug: 'python-list-comprehension', locale: 'en', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'en', type: 'python' },
  { slug: 'deep-learning-python', locale: 'en', type: 'python' },
  { slug: 'finance-python-trading', locale: 'en', type: 'python' },
  { slug: '18-most-common-python-list-questions-learn-python', locale: 'en', type: 'python' },
  { slug: 'tensorflow-tutorial', locale: 'en', type: 'python' },
  { slug: 'asyncio-introduction', locale: 'en', type: 'python' },
  { slug: 'preprocessing-in-data-science-part-2-centering-scaling-and-logistic-regression', locale: 'en', type: 'python' },
  { slug: 'data-structures-python', locale: 'en', type: 'python' },
  { slug: 'loops-python-tutorial', locale: 'en', type: 'python' },
  { slug: 'pandas-idiomatic', locale: 'en', type: 'python' },
  { slug: 'asyncio-introduction', locale: 'en', type: 'python' },
  { slug: 'scikit-learn-tutorial-baseball-2', locale: 'en', type: 'python' },
  { slug: 'scikit-learn-fake-news', locale: 'en', type: 'python' },
  { slug: 'exploratory-data-analysis-python', locale: 'en', type: 'python' },
  { slug: 'python-dictionary-tutorial', locale: 'en', type: 'python' },
  { slug: 'python-scipy-tutorial', locale: 'en', type: 'python' },
  { slug: 'scikit-learn-tutorial-baseball-1', locale: 'en', type: 'python' },
  { slug: 'scikit-learn-python', locale: 'en', type: 'python' },
  { slug: 'preprocessing-in-data-science-part-3-scaling-synthesized-data', locale: 'en', type: 'python' },
  // R tutorials (en)
  { slug: 'creating-lists-r', locale: 'en', type: 'r' },
  { slug: 'machine-learning-in-r', locale: 'en', type: 'r' },
  { slug: 'merging-datasets-r', locale: 'en', type: 'r' },
  { slug: 'autocorrelation-r', locale: 'en', type: 'r' },
  { slug: 'basic-programming-skills-r', locale: 'en', type: 'r' },
  { slug: 'intro-data-frame-r', locale: 'en', type: 'r' },
  { slug: 'subsetting-datasets-r', locale: 'en', type: 'r' },
  { slug: 'confusion-matrix-calculation-r', locale: 'en', type: 'r' },
  { slug: 'data-frames-r', locale: 'en', type: 'r' },
  { slug: 'regular-expressions-clean-strings', locale: 'en', type: 'r' },
  { slug: 'factor-levels-r', locale: 'en', type: 'r' },
  { slug: 'creating-lists-r', locale: 'en', type: 'r' },
  { slug: 'for-loops-r', locale: 'en', type: 'r' },
  { slug: 'top-5-r-graphics', locale: 'en', type: 'r' },
  { slug: '15-easy-solutions-data-frame-problems-r', locale: 'en', type: 'r' },
  { slug: 'recreate-bloomberg-terminal-news-trends-r', locale: 'en', type: 'r' },
  // Spanish (es)
  { slug: 'creating-lists-r', locale: 'es', type: 'r' },
  { slug: 'machine-learning-in-r', locale: 'es', type: 'r' },
  { slug: 'loops-python-tutorial', locale: 'es', type: 'python' },
  { slug: 'tensorflow-tutorial', locale: 'es', type: 'python' },
  { slug: 'data-structures-python', locale: 'es', type: 'python' },
  { slug: 'deep-learning-python', locale: 'es', type: 'python' },
  { slug: 'python-list-comprehension', locale: 'es', type: 'python' },
  // Portuguese (pt-BR)
  { slug: 'creating-lists-r', locale: 'pt-BR', type: 'r' },
  { slug: 'loops-python-tutorial', locale: 'pt-BR', type: 'python' },
  { slug: 'python-list-comprehension', locale: 'pt-BR', type: 'python' },
  { slug: 'data-structures-python', locale: 'pt-BR', type: 'python' },
  // German (de-DE)
  { slug: 'functions-python-tutorial', locale: 'de-DE', type: 'python' },
  { slug: 'loops-python-tutorial', locale: 'de-DE', type: 'python' },
  { slug: 'data-structures-python', locale: 'de-DE', type: 'python' },
  { slug: 'python-list-comprehension', locale: 'de-DE', type: 'python' },
  // French (fr-FR)
  { slug: 'functions-python-tutorial', locale: 'fr-FR', type: 'python' },
  { slug: 'creating-lists-r', locale: 'fr-FR', type: 'r' },
  { slug: 'loops-python-tutorial', locale: 'fr-FR', type: 'python' },
  { slug: 'python-list-comprehension', locale: 'fr-FR', type: 'python' },
  { slug: 'data-structures-python', locale: 'fr-FR', type: 'python' },
  // Other locales (python only for brevity)
  { slug: 'functions-python-tutorial', locale: 'tr-TR', type: 'python' },
  { slug: 'loops-python-tutorial', locale: 'tr-TR', type: 'python' },
  { slug: 'python-list-comprehension', locale: 'tr-TR', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'sv-SE', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'it-IT', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'ru-RU', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'vi-VN', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'th-TH', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'id-ID', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'ja-JP', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'nl-NL', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'ko-KR', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'zh-CN', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'hi-IN', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'ro-RO', type: 'python' },
  { slug: 'functions-python-tutorial', locale: 'pl-PL', type: 'python' },
];

// ---------------------------------------------------------------------------
// Strapi content fetching
// ---------------------------------------------------------------------------

async function fetchStrapiTutorial(slug, locale) {
  const cmsBaseUrl = process.env.CMS_BASE_URL || 'http://127.0.0.1:1337';
  const cmsToken = process.env.CMS_API_TOKEN_READ_ONLY || '';

  const url = `${cmsBaseUrl}/api/tutorials?filters[slug][$eq]=${slug}&locale=${locale}&publicationState=live&fields[0]=content&fields[1]=type&fields[2]=isCodeExecutable&fields[3]=title`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cmsToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Strapi API error ${response.status} for slug "${slug}" (${locale})`);
  }

  const data = await response.json();
  return data.data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Exercise extraction from Strapi rich-text HTML
// ---------------------------------------------------------------------------

/**
 * Extracts <div data-datacamp-exercise> blocks from Strapi rich-text HTML.
 * Handles nested <div> elements by matching balanced open/close tags.
 */
function extractExerciseDivs(html) {
  const exercises = [];
  const regex = /<div[^>]*data-datacamp-exercise[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const start = match.index;
    const startTag = match[0];

    // Extract lang from the div attributes
    const langMatch = start.match(/data-lang="([^"]*)"/);
    const lang = langMatch ? langMatch[1] : 'python';

    // Count nested <div> opens/closes to find the matching close tag
    let depth = 1;
    let pos = start + start.length;
    const divRegex = /<\/?div[\s>]/gi;
    divRegex.lastIndex = pos;
    let innerMatch;
    while ((innerMatch = divRegex.exec(html)) !== null) {
      if (innerMatch[0].startsWith('</')) depth--;
      else depth++;
      if (depth === 0) break;
      pos = divRegex.lastIndex;
    }
    const end = content_safe_index(html, pos);
    const block = html.slice(start, end);

    exercises.push({ lang: langMatch?.[1] || 'python', block });
  }
  return exercises;
}

function content_safe_index(html, from) {
  // Find the closing </div> that matches depth 0 — scan forward
  const closeIdx = html.indexOf('</div>', from);
  return closeIdx === -1 ? html.length : closeIdx + 6;
}

/**
 * Parses exercise definitions from an exercise div block.
 * Returns { preExerciseCode, sampleCode, solution, sct, packages }.
 */
function parseExerciseBlock(block) {
  const extractCode = (type) => {
    const regex = new RegExp(`<code[^>]*data-type="${type}"[^>]*>([\\s\\S]*?)</code>`, 'i');
    const match = block.match(regex);
    if (!match) return '';
    // Strip HTML tags from the code content (rich text may wrap in spans, etc.)
    return match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .trim();
  };

  return {
    preExerciseCode: extractCode('pre-exercise-code'),
    sampleCode: extractCode('sample-code'),
    solution: extractCode('solution'),
    sct: extractCode('sct'),
    packages: '',
  };
}

/**
 * Extracts all rich-text HTML from a Strapi tutorial entry (content + body components).
 */
function extractRichTextHtml(entry) {
  const attributes = entry?.attributes ?? entry ?? {};
  const htmlParts = [];

  // Main content field (single rich text)
  if (attributes.content) {
    htmlParts.push(attributes.content);
  }

  // Dynamic zone body components with rich text
  const body = attributes.body ?? [];
  for (const component of body) {
    if (component.__component === 'component-page-content.rich-text' && component.text) {
      htmlParts.push(component.text);
    }
  }

  return htmlParts.join('\n');
}

// ---------------------------------------------------------------------------
// Pyodide runner (reused from audit-external-tutorials.mjs)
// ---------------------------------------------------------------------------

async function initializePyodideRunner() {
  const { loadPyodide } = await import('pyodide');
  const pyodide = await loadPyodide();
  await pyodide.loadPackage('micropip');

  const pythonDirectory = path.join(rootDirectory, 'src', 'runtime', 'python');
  const packageManagerSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_package_manager.py'), 'utf8');
  const shellwhatParserSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shellwhat_parser.py'), 'utf8');
  const shellBridgeSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_shell_bridge.py'), 'utf8');
  const ipythonSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_ipython.py'), 'utf8');
  const introspectionSource = fs.readFileSync(path.join(pythonDirectory, 'dcl_introspection.py'), 'utf8');

  await pyodide.runPythonAsync(packageManagerSource);

  await pyodide.loadPackage([
    'jinja2', 'markupsafe', 'asttokens', 'six', 'click', 'packaging', 'setuptools',
  ]);

  const micropip = pyodide.pyimport('micropip');
  await micropip.install(['pyodide_backend', 'bashlex']);

  try { pyodide.FS.mkdirTree('/lib/python3.12/site-packages/shellwhat/checks'); } catch (e) {}
  for (const [filePath, content] of Object.entries(SHELLWHAT_PY_SOURCES)) {
    pyodide.FS.writeFile('/lib/python3.12/site-packages/shellwhat/' + filePath, content);
  }

  try { pyodide.FS.mkdir('/home'); } catch (e) {}
  try { pyodide.FS.mkdir('/home/pyodide'); } catch (e) {}
  try { pyodide.FS.mkdir('/tmp'); } catch (e) {}
  try { pyodide.FS.chdir('/home/pyodide'); } catch (e) {}

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

  console.log(`[Pyodide] Preloading pandas and numpy packages...`);
  await pyodide.loadPackage(['numpy', 'pandas']);

  return pyodide;
}

// ---------------------------------------------------------------------------
// Main audit runner
// ---------------------------------------------------------------------------

async function runAudit() {
  const cmsUrl = process.env.CMS_BASE_URL;
  const cmsAuth = process.env.CMS_API_TOKEN_READ_ONLY;

  if (!cmsUrl || !cmsAuth) {
    console.error('Missing CMS_BASE_URL or CMS_API_TOKEN_READ_ONLY env vars.');
    console.error('Set them to point at the Strapi instance serving the media-app tutorials.');
    process.exit(1);
  }

  // Build the target matrix
  const targets = MEDIA_APP_SLUGS.filter(
    (entry) => entry.locale === localeArgument && (!slugArgument || entry.slug === slugArgument)
  );

  if (targets.length === 0) {
    console.log(`No tutorial slugs found for locale "${localeArgument}".`);
    return;
  }

  console.log(`[Strapi] Fetching ${targets.length} tutorials from ${cmsUrl}...\n`);

  const pyodide = await initializePyodideRunner();

  console.log(`------------------------------------------------------------------------------------------------------------------------`);
  console.log(` #   Status   Slug                                             Locale  Type      Duration   SCT Result / Diagnostic`);
  console.log(`------------------------------------------------------------------------------------------------------------------------`);

  let globalIndex = 0;
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const results = [];

  for (const target of targets) {
    globalIndex++;

    let entry = null;
    try {
      entry = await fetchStrapiTutorial(target.slug, target.locale);
    } catch (fetchError) {
      console.log(` ${String(++globalIndex).padStart(2)}  ❌ FETCH  ${target.slug.padEnd(50)} ${target.locale.padEnd(7)}  Strapi fetch error: ${(fetchError.message || '').split('\n')[0]}`);
      failedCount++;
      continue;
    }

    if (!entry) {
      console.log(` ${String(++globalIndex).padStart(2)}  ⚪ SKIP   ${target.slug.padEnd(50)} ${target.locale.padEnd(7)}  (Not found or draft)`);
      skippedCount++;
      continue;
    }

    const richTextHtml = extractRichTextHtml(entry);
    const exerciseDivs = extractExerciseDivs(richTextHtml);

    if (exerciseDivs.length === 0) {
      console.log(` ${String(++globalIndex).padStart(2)}  ⚪ SKIP   ${target.slug.padEnd(50)} ${target.locale.padEnd(7)}  (No exercise divs found)`);
      skippedCount++;
      continue;
    }

    const title = entry.attributes?.title || target.slug;

    for (let exIdx = 0; exIdx < exerciseDivs.length; exIdx++) {
      const exercise = parseExerciseBlock(exerciseDivs[exIdx].block);
      const label = `${target.slug} [${exIdx + 1}]`.padEnd(50);
      const locale = target.locale.padEnd(7);
      const startTime = Date.now();

      try {
        if (exerciseDivs[exIdx].lang !== 'python') {
          console.log(` ${String(++globalIndex).padStart(3)}  ⚪ SKIP   ${label} ${locale}  ${exerciseDivs[exIdx].lang.padEnd(9)} (R exercises not auditable in Node)`);
          skippedCount++;
          continue;
        }

        if (!exercise.sct && !exercise.solution && !exercise.sampleCode) {
          console.log(` ${String(++globalIndex).padStart(3)}  ⚪ SKIP   ${label} ${locale}  (Empty exercise)`);
          skippedCount++;
          continue;
        }

        const PyodideExercise = pyodide.pyimport('pyodide_backend').PyodideExercise;
        const pyExercise = PyodideExercise(
          exercise.preExerciseCode || '',
          exercise.solution || '',
          exercise.sct || 'success_msg("Executed")',
        );

        pyExercise.run_init();

        const codeToSubmit = exercise.solution || exercise.sampleCode || '';
        const resultJson = pyExercise.run_submit(codeToSubmit, 320, 320);
        const entries = JSON.parse(resultJson);
        const sctEntry = entries.find((e) => e.type === 'sct');

        const correct = sctEntry ? Boolean(sctEntry.payload.correct) : true;
        const message = sctEntry ? (sctEntry.payload.message || 'Evaluated successfully') : 'Ran with output';
        const duration = Date.now() - startTime;
        const statusIcon = correct ? '✅ PASS' : '❌ FAIL';

        if (correct) passedCount++;
        else failedCount++;

        console.log(` ${String(++globalIndex).padStart(3)}  ${statusIcon}   ${label} ${locale}  ${'python'.padEnd(9)} ${String(duration).padStart(4)}ms   ${message}`);

        results.push({ slug: target.slug, locale: target.locale, index: exIdx + 1, correct, message, duration });
      } catch (executionError) {
        failedCount++;
        const duration = Date.now() - startTime;
        const errorMessage = (executionError.message || String(executionError)).split('\n')[0].substring(0, 60);
        console.log(` ${String(++globalIndex).padStart(3)}  ❌ FAIL   ${label} ${locale}  ${'python'.padEnd(9)} ${String(duration).padStart(4)}ms   Error: ${errorMessage}`);

        results.push({ slug: target.slug, locale: target.locale, index: exIdx + 1, correct: false, message: errorMessage, duration });
      }
    }
  }

  console.log(`------------------------------------------------------------------------------------------------------------------------`);
  console.log(`\nAudit Summary for media-app Strapi tutorials (locale: ${localeArgument}):`);
  console.log(`  • Passed:  ${passedCount}`);
  console.log(`  • Failed:  ${failedCount}`);
  console.log(`  • Skipped: ${skippedCount} (R exercises, drafts, not found)`);
  console.log(`  • Total Python Exercises: ${results.length}`);
  const passRate = results.length > 0 ? ((passedCount / results.length) * 100).toFixed(1) : 0;
  console.log(`  • Pass Rate: ${passRate}%\n`);

  if (failedCount > 0) {
    console.log(`Detailed Failures to Triage:`);
    results.filter((r) => !r.correct).forEach((f) => {
      console.log(`  - [${f.slug} (locale: ${f.locale}) #${f.index}]: ${f.message}`);
    });
    console.log();
  }
}

runAudit().catch((error) => {
  console.error('\nFatal Audit Error:', error);
  process.exit(1);
});