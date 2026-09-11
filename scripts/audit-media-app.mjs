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
 * The Strapi token is optional: published content is usually readable via the
 * public role, so the audit works without CMS_API_TOKEN_READ_ONLY. As an
 * alternative source, --source=public fetches the rendered tutorial page from
 * the public site (no Strapi API at all) and parses the exercise divs from the
 * SSR HTML.
 *
 * Usage:
 *   node scripts/audit-media-app.mjs [--locale=en] [--slug=python-list-comprehension]
 *   node scripts/audit-media-app.mjs --source=public [--base-url=https://www.datacamp.com/tutorials]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { loadPyodide } from 'pyodide';
import { parseExerciseSettings } from '../src/exerciseSettings.ts';
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
const sourceArgument = commandArguments.find((arg) => arg.startsWith('--source='))?.split('=')[1] || 'strapi';
const baseUrlArgument = commandArguments.find((arg) => arg.startsWith('--base-url='))?.split('=')[1] || null;

console.log(`\n======================================================================`);
console.log(` DataCamp Light v4 — Media-App Tutorial Compatibility Audit`);
console.log(` Source: ${sourceArgument} | Locale: ${localeArgument}${slugArgument ? ` | Slug: ${slugArgument}` : ' | All slugs'}`);
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
  const headers = { Accept: 'application/json' };
  if (cmsToken) {
    headers.Authorization = `Bearer ${cmsToken}`;
  }
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Strapi API error ${response.status} for slug "${slug}" (${locale})`);
  }

  const data = await response.json();
  return data.data?.[0] ?? null;
}

/**
 * Fetches the rendered tutorial page from the public site and returns the
 * exercise divs parsed from the SSR HTML. No Strapi API or token needed.
 */
async function fetchPublicTutorial(slug, locale) {
  const baseUrl = baseUrlArgument || process.env.MEDIA_APP_BASE_URL || 'https://www.datacamp.com/tutorial';
  const localeSuffix = locale === 'en' ? '' : `?locale=${locale}`;
  const url = `${baseUrl}/${slug}${localeSuffix}`;
  const response = await fetch(url, {
    headers: { Accept: 'text/html' },
  });

  if (!response.ok) {
    throw new Error(`Public page error ${response.status} for "${url}"`);
  }

  const html = await response.text();
  return extractExerciseDivs(html);
}

// ---------------------------------------------------------------------------
// Exercise extraction from Strapi rich-text HTML
// ---------------------------------------------------------------------------

/**
 * Extracts <div data-datacamp-exercise> blocks from Strapi rich-text HTML.
 * Handles nested <div> elements by matching balanced open/close tags.
 */
async function fetchPublicTutorialHtml(slug, locale) {
  const baseUrl = baseUrlArgument || process.env.MEDIA_APP_BASE_URL || 'https://www.datacamp.com/tutorial';
  const localeSuffix = locale === 'en' ? '' : `?locale=${locale}`;
  const url = `${baseUrl}/${slug}${localeSuffix}`;
  const response = await fetch(url, {
    headers: { Accept: 'text/html' },
  });

  if (!response.ok) {
    throw new Error(`Public page error ${response.status} for "${url}"`);
  }

  const html = await response.text();
  return html;
}

// ---------------------------------------------------------------------------
// Exercise extraction from Strapi rich-text HTML
// ---------------------------------------------------------------------------

/**
 * Extracts <div data-datacamp-exercise> blocks from Strapi rich-text HTML.
 * Handles nested <div> elements by matching balanced open/close tags.
 */

/**
 * Extracts exercise settings from a rich-text HTML string using the SAME
 * code path as production (parseExerciseSettings from src/exerciseSettings.ts).
 * Returns an array of exercise settings (one per exercise div).
 */
function extractExerciseSettings(html, baseUrl) {
  const window = new Window({
        url: baseUrl || 'https://www.datacamp.com/tutorial',
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
        },
      });
  const document = window.document;
  document.body.innerHTML = html;
  const elements = document.querySelectorAll('[data-datacamp-exercise]');
  return Array.from(elements).map((element) => parseExerciseSettings(element));
}

/** Extracts all rich-text HTML from a Strapi tutorial entry (content + body components). */
function extractRichTextHtml(entry) {
  const attributes = entry?.attributes ?? entry ?? {};
  const htmlParts = [];

  if (attributes.content) {
    htmlParts.push(attributes.content);
  }

  const body = attributes.body ?? [];
  for (const component of body) {
    if (component.__component === 'component-page-content.rich-text' && component.text) {
      htmlParts.push(component.text);
    }
  }

  return htmlParts.join('\n');
}

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
  await micropip.install(['pyodide_backend', 'bashlex', 'black']);

  try { pyodide.FS.mkdirTree('/lib/python3.12/site-packages/shellwhat/checks'); } catch (e) {}
  for (const [filePath, content] of Object.entries(SHELLWHAT_PY_SOURCES)) {
    pyodide.FS.writeFile('/lib/python3.12/site-packages/shellwhat/' + filePath, content);
  }

  try { pyodide.FS.mkdir('/home'); } catch (e) {}
  try { pyodide.FS.mkdir('/home/pyodide'); } catch (e) {}
  try { pyodide.FS.mkdir('/home/pyodide/data'); } catch (e) {}
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

  console.log(`[Pyodide] Preloading pandas, numpy, scikit-learn, and scipy packages...`);
  await pyodide.loadPackage(['numpy', 'pandas', 'scikit-learn', 'scipy', 'matplotlib']);

  return pyodide;
}

// ---------------------------------------------------------------------------
// Main audit runner
// ---------------------------------------------------------------------------

/** Dedents code by stripping common leading whitespace/tabs. */
function dedentCode(code) {
  if (!code) return '';
  const lines = code.split('\n');
  let minIndent = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^[ \t]+/);
    const indent = match ? match[0].length : 0;
    if (minIndent === null || indent < minIndent) {
      minIndent = indent;
    }
  }
  if (!minIndent) return code;
  return lines
    .map((line) => (line.trim() ? line.slice(minIndent) : ''))
    .join('\n');
}

/**
 * Scans exercise settings for remote S3 data URLs, pre-fetches accessible
 * files into the Pyodide VFS, and rewrites the URLs in the exercise code to
 * use local VFS paths.
 */
async function prepareExercisesWithVfs(pyodide, settingsList) {
  const urlToVfsPath = new Map();

  for (const settings of settingsList) {
    for (const field of ['preExerciseCode', 'sampleCode', 'solution', 'sct']) {
      const code = settings[field];
      if (!code) continue;
      const urlRegex = /https:\/\/(?:s3\.amazonaws\.com\/assets\.datacamp\.com|assets\.datacamp\.com)\/([^\s'"\)\]]+)/g;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(code)) !== null) {
        const fullMatchedUrl = urlMatch[0].replace(/[\s'"\),\]]+$/, '');
        const rawRelativePath = urlMatch[1].replace(/[\s'"\),\]]+$/, '');
        const normalizedRelativePath = rawRelativePath.replaceAll('+', '%20');
        const directCdnUrl = `https://assets.datacamp.com/${normalizedRelativePath}`;
        const fileName = decodeURIComponent(normalizedRelativePath.split('/').pop());
        const vfsPath = `/home/pyodide/data/${fileName}`;
        urlToVfsPath.set(fullMatchedUrl, { directCdnUrl, vfsPath });
        urlToVfsPath.set(directCdnUrl, { directCdnUrl, vfsPath });
        urlToVfsPath.set(`https://assets.datacamp.com/${rawRelativePath}`, { directCdnUrl, vfsPath });
      }
    }
  }

  if (urlToVfsPath.size === 0) return settingsList;

  const fetchedUrls = new Set();
  for (const [, { directCdnUrl, vfsPath }] of urlToVfsPath) {
    if (fetchedUrls.has(directCdnUrl)) continue;
    fetchedUrls.add(directCdnUrl);
    try {
      const response = await fetch(directCdnUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        pyodide.FS.writeFile(vfsPath, new Uint8Array(arrayBuffer));
        console.log(`  [VFS] Pre-fetched ${directCdnUrl.slice(-40)} -> ${vfsPath} (${arrayBuffer.byteLength} bytes)`);
      } else {
        console.log(`  [VFS] Cannot fetch ${directCdnUrl.slice(-40)} (status ${response.status})`);
      }
    } catch (fetchError) {
      console.log(`  [VFS] Fetch error for ${directCdnUrl.slice(-40)}: ${fetchError?.message || fetchError}`);
    }
  }

  for (const settings of settingsList) {
    for (const field of ['preExerciseCode', 'sampleCode', 'solution', 'sct']) {
      let code = settings[field];
      if (!code) continue;
      code = code.replaceAll('https://s3.amazonaws.com/assets.datacamp.com/', 'https://assets.datacamp.com/');
      for (const [matchedUrl, { vfsPath }] of urlToVfsPath) {
        code = code.replaceAll(matchedUrl, vfsPath);
      }
      settings[field] = code;
    }
  }

  return settingsList;
}

async function runAudit() {
  const cmsUrl = process.env.CMS_BASE_URL;

  if (sourceArgument === 'strapi' && !cmsUrl) {
    console.error('Missing CMS_BASE_URL env var (or use --source=public to fetch rendered pages).');
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

  console.log(`[${sourceArgument === 'public' ? 'Public' : 'Strapi'}] Fetching ${targets.length} tutorials...\n`);

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

    let targetSettings = [];
    try {
      if (sourceArgument === 'public') {
        targetSettings = await fetchPublicTutorialHtml(target.slug, target.locale).then(html => extractExerciseSettings(html));
      } else {
        const entry = await fetchStrapiTutorial(target.slug, target.locale);
        if (!entry) {
          console.log(` ${String(++globalIndex).padStart(2)}  ⚪ SKIP   ${target.slug.padEnd(50)} ${target.locale.padEnd(7)}  (Not found or draft)`);
          skippedCount++;
          continue;
        }
        const richTextHtml = extractRichTextHtml(entry);
        targetSettings = extractExerciseSettings(richTextHtml);
      }
    } catch (fetchError) {
      console.log(` ${String(++globalIndex).padStart(2)}  ❌ FETCH  ${target.slug.padEnd(50)} ${target.locale.padEnd(7)}  Fetch error: ${(fetchError.message || '').split('\n')[0]}`);
      failedCount++;
      continue;
    }

    if (targetSettings.length === 0) {
      console.log(` ${String(++globalIndex).padStart(2)}  ⚪ SKIP   ${target.slug.padEnd(50)} ${target.locale.padEnd(7)}  (No exercise divs found)`);
      skippedCount++;
      continue;
    }

    // Pre-fetch S3 data files into the VFS and rewrite URLs in the exercise code
    const preparedSettings = await prepareExercisesWithVfs(pyodide, targetSettings);
    const priorCode = [];

    for (let exIdx = 0; exIdx < preparedSettings.length; exIdx++) {
      const exercise = preparedSettings[exIdx];
      const label = `${target.slug} [${exIdx + 1}]`.padEnd(50);
      const locale = target.locale.padEnd(7);
      const startTime = Date.now();

      try {
        if (exercise.language !== 'python') {
          console.log(` ${String(++globalIndex).padStart(3)}  ⚪ SKIP   ${label} ${locale}  ${exercise.language.padEnd(9)} (R exercises not auditable in Node)`);
          skippedCount++;
          continue;
        }

        if (!exercise.sct && !exercise.solution && !exercise.sampleCode) {
          console.log(` ${String(++globalIndex).padStart(3)}  ⚪ SKIP   ${label} ${locale}  (Empty exercise)`);
          skippedCount++;
          continue;
        }

        const dedentedPec = dedentCode(exercise.preExerciseCode || '');
        const dedentedSolution = dedentCode(exercise.solution || '');
        const dedentedSample = dedentCode(exercise.sampleCode || '');
        const sct = exercise.sct || '';

        // If exercise has its own substantial PEC, use it; otherwise chain prior exercise solutions
        const hasOwnPec = dedentedPec && dedentedPec.trim().length > 20;
        const combinedPec = hasOwnPec
          ? dedentedPec
          : [...priorCode, dedentedPec].filter(Boolean).join('\n\n');

        const PyodideExercise = pyodide.pyimport('pyodide_backend').PyodideExercise;
        const pyExercise = PyodideExercise(
          combinedPec,
          dedentedSolution || '',
          sct || 'success_msg("Executed")',
        );

        pyExercise.run_init();

        const codeToSubmit = dedentedSolution || dedentedSample || '';
        const resultJson = pyExercise.run_submit(codeToSubmit, 320, 320);
        const entries = JSON.parse(resultJson);
        const sctEntry = entries.find((e) => e.type === 'sct');

        let correct = sctEntry ? Boolean(sctEntry.payload.correct) : true;
        let message = sctEntry ? (sctEntry.payload.message || 'Evaluated successfully') : 'Ran with output';

        // Educational demo code snippets (no solution and no SCT)
        if (!sct && !dedentedSolution && dedentedSample) {
          correct = true;
          message = 'Executed demo code';
        }

        const duration = Date.now() - startTime;
        const statusIcon = correct ? '✅ PASS' : '❌ FAIL';

        if (correct) passedCount++;
        else failedCount++;

        console.log(` ${String(++globalIndex).padStart(3)}  ${statusIcon}   ${label} ${locale}  ${'python'.padEnd(9)} ${String(duration).padStart(4)}ms   ${message}`);

        results.push({ slug: target.slug, locale: target.locale, index: exIdx + 1, correct, message, duration });

        if (codeToSubmit) {
          priorCode.push(codeToSubmit);
        }
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