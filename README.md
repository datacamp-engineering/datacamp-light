<h1 align="center">DataCamp Light v3</h1>
<p align="center">
  <a href="https://github.com/datacamp/datacamp-light/projects/1">Roadmap</a>
</p>

[![DataCamp Light banner](https://assets.datacamp.com/img/github/datacamp-light/banner-new.png "Banner")](https://cdn.datacamp.com/dcl-react/standalone-example.html)

<details>
<summary><strong>Table of Contents</strong></summary>

- [Features](#features)
- [How to run the app](#how-to-run-the-app)
- [Writing the HTML block](#writing-the-html-block)
  * [HTML Data Attributes](#html-data-attributes)
  * [Pre-Exercise Code](#pre-exercise-code)
  * [Sample Code](#sample-code)
  * [Solution](#solution)
  * [Submission Correctness Test (SCT)](#submission-correctness-test-sct)
  * [Hint](#hint)
  * [Other Options](#other-options)
- [How does it work?](#how-does-it-work)
- [Developing locally](#developing-locally)
  * [Prerequisites](#prerequisites)
  * [Run the dev server](#run-the-dev-server)
  * [Verification commands](#verification-commands)
  * [End-to-end checks](#end-to-end-checks)
- [Architecture](#architecture)
- [Known limitations and roadmap](#known-limitations-and-roadmap)

</details>

--------------------------------------------------------------------------------

## Features

* Convert any website or blog to an interactive learning platform.
* Runs **entirely in the browser via WebAssembly** — no server sessions:
  * **Python** via [Pyodide](https://pyodide.org), with real
    [pythonwhat](https://github.com/datacamp/pythonwhat) /
    [protowhat](https://github.com/datacamp/protowhat) SCT grading and
    matplotlib SVG plot capture. Packages install dynamically via [micropip](https://pyodide.org/en/stable/usage/loading-packages.html#micropip).
  * **R** via [webR](https://docs.r-wasm.org/webr/latest/), with full
    [testwhat](https://github.com/datacamp/testwhat) SCT grading (e.g. `ex() %>% check_object() %>% check_equal()`),
    output capture, and SVG plots.
  * **Shell** via [BusyBox WebAssembly](https://busybox.net/) with an
    xterm.js terminal and [shellwhat](https://github.com/datacamp/shellwhat) SCT grading.
* 100% backward compatible with existing `<div data-datacamp-exercise>` embeds.
* Styled with [`@datacamp/waffles`](https://www.npmjs.com/package/@datacamp/waffles)
  (dark theme), with the Studio-Feixen-Sans and JetBrains Mono fonts
  self-hosted and inlined into the bundle — no external font requests.
* Speaks a single [JSON-RPC 2.0](https://www.jsonrpc.org/specification)
  contract, so a remote multiplexer backend can be swapped in behind the same
  UI.

## How to run the app

Build the library and include the generated bundle plus its stylesheet on your
page:

```html
<link rel="stylesheet" href="dist/datacamp-light.css" />
<script type="text/javascript" src="dist/dcl-react.js"></script>
```

The library auto-boots every `[data-datacamp-exercise]` element once the DOM is
ready. If your app adds exercises after the initial page load (for example, in
a React app), call the following function to initialize the new ones:

```js
initAddedDCLightExercises();
```

`initDataCampLight` is an alias for the same function. Both are also exposed on
`window.dcl` (`dcl.init`, `dcl.bootElement`, `dcl.getSettings`).

## Writing the HTML block

After including the JavaScript library, you can start writing HTML blocks in the
format below. These will be dynamically converted to exercises.

```html
<div data-datacamp-exercise data-lang="python" data-packages="" data-height="auto">
	<code data-type="pre-exercise-code">
		# This will get executed each time the exercise gets initialized
		b = 6
	</code>
	<code data-type="sample-code">
		# Create a variable a, equal to 5


		# Print out a


	</code>
	<code data-type="solution">
		# Create a variable a, equal to 5
		a = 5

		# Print out a
		print(a)
	</code>
	<code data-type="sct">
		test_object("a")
		test_function("print")
		success_msg("Great job!")
	</code>
	<div data-type="hint">Use the assignment operator (<code>=</code>) to create the variable <code>a</code>.</div>
</div>
```

### HTML Data Attributes

As we can see in the example above, the whole exercise is contained in a single
`<div>` element with multiple data attributes:

- `data-datacamp-exercise` indicates that the `<div>` is a DataCamp Light
  exercise and must be rendered as such.
- `data-lang` specifies which programming language should be used. The
  accepted values are `python` (default), `r` and `shell`.
- `data-packages` (optional, only available for Python) specifies the
  additional packages you want to import and use in the exercise, as a
  comma-separated list. Versions can be pinned with `==`, e.g.
  `data-packages="pandas==0.24.1, numpy"`. Packages are installed at runtime
  from PyPI via [`micropip`](https://pyodide.org/en/stable/usage/loading-packages.html#micropip).
- `data-height` (optional) sets the height in `px` of the editor (code
  exercises) or the terminal (shell exercises). Set it to `"auto"` (the
  default) to use the built-in default height.
- `data-show-run-button` (optional) always shows the "Run" button so visitors
  can try out the code without submitting it.
- `data-utm-source` / `data-utm-campaign` (optional) override the UTM
  parameters on the "Powered by DataCamp" footer link.
- `data-encoded` (optional) replaces the child `<code>` blocks with a single
  base64-encoded, URI-encoded JSON payload describing the exercise
  (`{ language, sample, solution, sct, pre_exercise_code, hint, packages,
  showRunButton }`).

### Pre-Exercise Code

Pre-exercise code is executed when the R/Python session is initialized. You can
use it to pre-load datasets, packages, etc. for students. The way to specify
this is by defining a `<code>` tag containing your initialization code and set
the `data-type` attribute to `pre-exercise-code` like this:

```html
<code data-type="pre-exercise-code">
	# This will get executed each time the exercise gets initialized
	b = 6
</code>
```

In our example we initialize the (rather useless) variable `b` with value `6`.

### Sample Code

To set the sample code that will be present initially in the code editor, a
`<code>` tag should be defined containing the sample code and the `data-type`
attribute should be set to `sample-code` like this:

```html
<code data-type="sample-code">
	# Create a variable a, equal to 5


	# Print out a


</code>
```

Our example simply shows a couple of comments together with some newlines. The
JavaScript library also takes care of stripping leading indentation so no need
to worry about that.

### Solution

To set the solution code, a `<code>` tag should be defined containing the
solution code and the `data-type` attribute should be set to `solution`
like this:

```html
<code data-type="solution">
	# Create a variable a, equal to 5
	a = 5

	# Print out a
	print(a)
</code>
```

### Submission Correctness Test (SCT)

A Submission Correctness Test is used to check whether the code submitted by the
user properly solves the exercise. For detailed documentation on SCT writing, see:
- [R SCTs (`testwhat`)](https://github.com/datacamp/testwhat)
- [Python SCTs (`pythonwhat`)](https://github.com/datacamp/pythonwhat) / [`protowhat`](https://github.com/datacamp/protowhat)
- [Shell SCTs (`shellwhat`)](https://github.com/datacamp/shellwhat)

The way to specify the SCT is by defining a `<code>` tag containing your SCT code and setting
the `data-type` attribute to `sct`:

```html
<code data-type="sct">
	test_object("a")
	test_function("print")
	success_msg("Great job!")
</code>
```

In our example the first line checks whether the user declared the variable `a`
and whether its value matches that of the solution code. The second line checks
whether the `print` function is called and lastly a success message is specified
that will be shown to the user when the exercise is successfully completed.

### Hint

To specify a hint, a tag should be defined containing the hint and the
`data-type` attribute should be set to `hint` like this:

```html
<div data-type="hint">
    Use the assignment operator (<code>=</code>) to create the variable <code>a</code>.
</div>
```

It is possible for the hint to contain for instance `<code>` tags as is the case in our example.

### Other Options

- Add the following CSS to the styling of your page to hide the configuration
  code of the exercises until they are loaded:
```css
[data-datacamp-exercise] {
  visibility: hidden;
}
```

## How does it work?

`div`s with the `data-datacamp-exercise` attribute are converted into a minimal
version of DataCamp's learning interface (for the real deal, you can visit
[www.datacamp.com](https://www.datacamp.com/?utm_source=datacamp_light&utm_medium=readme&utm_term=the_real_deal)).

Unlike the legacy DataCamp Light (which ran R/Python in remote Docker sessions
on DataCamp's servers), this version executes **in the browser via
WebAssembly**:

- **Python** runs in a Web Worker backed by Pyodide. The worker installs
  `pythonwhat` / `protowhat` / `pyodide_backend` from PyPI on first use and
  grades submissions with the same SCT engine DataCamp uses for its courses.
  matplotlib output is captured as an SVG data-URI and rendered as an image.
- **R** runs on the main thread via webR (loaded from
  `https://webr.r-wasm.org/latest/webr.mjs`). Output and plots are captured
  through `globalShelter.captureR`.
- **Shell** runs a pure-JS interpreter embedded into a Web Worker via
  `.toString()` (so the tested code is exactly the shipped code), with an
  xterm.js terminal. Commands execute freely; the SCT is only checked on an
  explicit "Submit Answer".

All three speak a single JSON-RPC 2.0 contract (`initialize` / `runCode` /
`submitCode` / `runCommand` requests; `session_output` / `session_status`
notifications). The contract is intended to be wire-compatible with
`@datacamp/learn-jsonrpc-mux-methods`, so a remote multiplexer backend can be
an alternative transport behind the same UI.

## Developing locally

### Prerequisites

- Node.js (see `.nvmrc`).
- `@datacamp/waffles` and `@datacamp/waffles-fonts` are published to the
  private DataCamp npm registry and require an auth token in `~/.npmrc`
  (`//registry.npmjs.org/:_authToken=npm_...`). If installs fail, export it:
  `export NPM_TOKEN=$(grep -o 'npm_[^"]*' ~/.npmrc)`.
- Waffles declares a peer dependency on `react>=17<18` but works on React 18;
  install with `--legacy-peer-deps`.

### Run the dev server

```bash
npm install --legacy-peer-deps
npm run dev -- --port 5183
```

Open http://127.0.0.1:5183/ — the page is a demo with example exercises
(Python SCT, Python + matplotlib, Shell, R, and several legacy R exercises)
defined in `src/index.html`. As you make changes, the page hot-reloads.

### Verification commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (unit + component tests)
npm run build       # tsc -b && vite build -> dist/dcl-react.js + dist/dcl-react.es.js + dist/datacamp-light.css
npm run update:shellwhat  # sync shellwhat Python source files from github.com/datacamp/shellwhat
npm run update:testwhat   # sync testwhat R source files from github.com/datacamp/testwhat
```

The build emits a UMD bundle (`dist/dcl-react.js`, ~424 KB gz), an ES module
bundle (`dist/dcl-react.es.js`), and a stylesheet (`dist/datacamp-light.css`)
with the fonts inlined as data URIs.

### End-to-end checks

The WASM runtimes (Pyodide, webR) only really run in a real browser, so the
unit tests mock the workers. For a live check, start the dev server and drive
the page with Playwright + system Chrome:

```js
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5183/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.datacamp-exercise-initialized', { timeout: 15000 });
```

Note: the widget root no longer uses the legacy `datacamp-exercise-widget`
class — selectors should target `.datacamp-exercise-initialized`.

## Architecture

```
index.html / host page
  └─ <div data-datacamp-exercise data-lang="python|r|shell" data-packages="...">
        └─ src/boot.tsx → getSettings(attrs) → render
             └─ src/components/DataCampExercise.tsx
                  ├─ CodeExercise (python|r): CodeEditor (CodeMirror 6) + OutputConsole + PlotCanvas + ActionBar
                  └─ ShellExercise (shell): TerminalConsole (xterm) + hint + SCT-on-typed-history
                  └─ DCLWidgetShell (waffles dark-theme root)
                       └─ session = createSessionForLanguage(language)
                            ├─ python → src/runtime/WasmSession.ts → pyodideWorkerSource.ts (blob Worker)
                            ├─ r      → src/runtime/RWebRSession.ts (main-thread webR)
                            └─ shell  → src/runtime/ShellSession.ts → shellWorkerSource.ts (blob Worker)
                                  └─ src/jsonrpc/session.ts (JsonRpcSessionClient, request/notify/id-matching)
                                       messages: initialize / runCode / submitCode / runCommand
                                       notifications: session_output / session_status
```

Notable design decisions:

- WASM runtimes lazy-load on first run per language, so the bundle stays small.
- A `dcl_package_manager` shim is installed in the Pyodide worker so legacy
  pre-exercise-code that calls `install_packages(...)` doesn't crash.
- Python packages install via `micropip` from PyPI
  (`files.pythonhosted.org`, CORS `*`), not from
  `campus.datacamp.com/whl/*` (that endpoint sends no CORS headers and would
  block cross-origin embeds).
- Fonts are self-hosted from `@datacamp/waffles-fonts` and inlined into the
  emitted CSS, so the widget never depends on external font CDNs.

## Known limitations and roadmap

- **Per-language worker reuse** — each exercise currently spawns its own
  Pyodide instance; a shared worker per language would avoid repeated bulky
  downloads on pages with many exercises.
- **Real WASM shell** — the shell currently uses a JS interpreter; replacing it
  with `busybox.wasm` / `bash.wasm` + a WASI runtime is planned. The swap
  boundary is isolated to `runCommand` / `runScript`.
- **CodeMirror syntax** — the editor uses the Python language mode for all
  languages; R and shell highlighting are not wired up yet.
- **`docs/example.html`** — still references the legacy CDN page; needs a
  decision on whether to rewrite it for the new widget or leave it historical.
