<h1 align="center">DataCamp Light v4 (WebAssembly Edition)</h1>
<p align="center">
  <a href="https://github.com/datacamp/datacamp-light/projects/1">Roadmap</a>
</p>

[![DataCamp Light banner](https://assets.datacamp.com/img/github/datacamp-light/banner-new.png "Banner")](https://cdn.datacamp.com/dcl/v4/index.html)

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
  * [Theme Switching](#theme-switching)
  * [AI Code Assistance & Explainers](#ai-code-assistance--explainers)
  * [SEO & Search Engine Indexing](#seo--search-engine-indexing)
  * [Other Options](#other-options)
- [How does it work?](#how-does-it-work)
- [Developing locally](#developing-locally)
  * [Prerequisites](#prerequisites)
  * [Run the dev server](#run-the-dev-server)
  * [Verification commands](#verification-commands)
  * [End-to-end checks](#end-to-end-checks)
- [Architecture](#architecture)

</details>

--------------------------------------------------------------------------------

## Features

* Convert any website, tutorial, or blog into an interactive learning platform.
* Runs **entirely in the browser via WebAssembly** — zero server backend needed:
  * **Python** via [Pyodide](https://pyodide.org), with real
    [pythonwhat](https://github.com/datacamp/pythonwhat) /
    [protowhat](https://github.com/datacamp/protowhat) SCT grading and
    matplotlib SVG plot capture. Packages install dynamically via [micropip](https://pyodide.org/en/stable/usage/loading-packages.html#micropip).
  * **R** via [webR](https://docs.r-wasm.org/webr/latest/), with full
    [testwhat](https://github.com/datacamp/testwhat) SCT grading (e.g. `ex() %>% check_object() %>% check_equal()`),
    console output capture, and canvas PNG plots.
  * **Shell** via [BusyBox WebAssembly](https://busybox.net/) with an
    xterm.js terminal, ANSI color support, and [shellwhat](https://github.com/datacamp/shellwhat) SCT grading.
* **AI Assistance Built-in**:
  * **"Explain Code" (✨)**: Live natural-language code explanations.
  * **"Fix & Explain"**: Automated error analysis with interactive visual line diffs and Accept/Reject buttons.
  * **Seamless Fallback**: On first-party `*.datacamp.com` domains, uses streaming `ai-api` when logged in or displays a free sign-up prompt when logged out. On external blogs/embeds, displays a one-click "Open in DataLab" CTA that pre-fills the learner's code directly into a cloud notebook.
* **Smart Theming**: Auto-inherits system OS dark/light preference with a one-click toggle in the footer, synchronized across all exercises on the page.
* **100% Backward Compatible**: Drop-in replacement for existing `<div data-datacamp-exercise>` embeds.
* **DataLab Deep-Linking**: "Powered by DataLab" footer link opens a new DataLab cloud notebook populated with the learner's current editor code.
* Styled with [`@datacamp/waffles`](https://www.npmjs.com/package/@datacamp/waffles)
  with self-hosted Studio-Feixen-Sans and JetBrains Mono fonts inlined into the stylesheet.

## How to run the app

Include the generated stylesheet and script bundle on your page:

```html
<link rel="stylesheet" href="https://cdn.datacamp.com/dcl/v4/datacamp-light.css" />
<script type="text/javascript" src="https://cdn.datacamp.com/dcl/v4/dcl-react.js"></script>
```

The library auto-boots every `[data-datacamp-exercise]` element once the DOM is
ready. If your app adds exercises dynamically after the initial page load (for example, in
a Single Page Application), call:

```js
initAddedDCLightExercises();
```

`initDataCampLight` is an alias for the same function. Both are also exposed on
`window.dcl` (`dcl.init`, `dcl.bootElement`, `dcl.getSettings`).

## Writing the HTML block

Place HTML blocks in the format below anywhere on your page:

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

All configuration options are passed as data attributes on the root exercise element:

| Attribute | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `data-datacamp-exercise` | Flag | — | Identifies the `<div>` as an interactive DataCamp Light exercise. |
| `data-lang` | String | `python` | Target language: `python`, `r`, or `shell`. |
| `data-theme` | String | `undefined` | Initial theme: `light` or `dark`. When omitted, automatically inherits from the user's OS system color scheme (`prefers-color-scheme`). |
| `data-shared-environment` | String / Boolean | `undefined` | Set to `true` (or a group name like `"stats-tutorial"`) to share execution memory/variables across multiple exercises on the page. |
| `data-show-ai` / `data-has-ai` | Boolean | `true` | Set to `false` to disable AI features ("Explain Code" and "Fix & Explain"). |
| `data-packages` | String | `""` | Comma-separated Python packages to install dynamically at runtime from PyPI via `micropip` (e.g. `data-packages="pandas==1.5.3, numpy"`). |
| `data-height` | Number / String | `auto` | Height in `px` of the code editor (Python/R) or terminal (Shell), or `auto`. |
| `data-show-run-button` | Boolean | `true` | Whether to display the "Run Code" button alongside "Submit Answer". |
| `data-no-lazy-load` | Flag | `false` | When present, boots the exercise immediately instead of waiting for viewport intersection. |
| `data-utm-source` | String | `datacamp_light` | Custom UTM source parameter passed to the "Powered by DataLab" deep link. |
| `data-utm-campaign` | String | `powered_by_datalab` | Custom UTM campaign parameter passed to the "Powered by DataLab" deep link. |
| `data-encoded` | Flag | `false` | When present, exercise contents are loaded from a base64-encoded, URI-encoded JSON string inside the element text. |

### Pre-Exercise Code

Pre-exercise code executes in the background when the exercise environment initializes. Use it to preload datasets or setup variables:

```html
<code data-type="pre-exercise-code">
	# Preload variables or datasets
	pi = 3.14159
</code>
```

### Sample Code

Initial starter code rendered inside the CodeMirror editor:

```html
<code data-type="sample-code">
	# Calculate circle area with radius 5
	radius = 5
	area = 
	print(area)
</code>
```

### Solution

Target solution code checked during evaluation or shown when the learner clicks "Show Solution":

```html
<code data-type="solution">
	radius = 5
	area = pi * (radius ** 2)
	print(area)
</code>
```

### Submission Correctness Test (SCT)

Evaluates the learner's submitted code against the solution:

* **Python**: [pythonwhat](https://github.com/datacamp/pythonwhat) / [protowhat](https://github.com/datacamp/protowhat) (e.g. `Ex().check_object('area').has_equal_value()`).
* **R**: [testwhat](https://github.com/datacamp/testwhat) (e.g. `ex() %>% check_object('area') %>% check_equal()`).
* **Shell**: [shellwhat](https://github.com/datacamp/shellwhat) (e.g. `test_command('ls')`).

```html
<code data-type="sct">
	Ex().check_object("area").has_equal_value()
	Ex().success_msg("Great job calculating the area!")
</code>
```

### Hint

HTML or Markdown hint text displayed when the learner clicks "Show Hint":

```html
<div data-type="hint">
	Use the exponent operator (<code>**</code>) to square the radius: <code>radius ** 2</code>.
</div>
```

### Theme Switching

DataCamp Light includes built-in dark and light themes:
- **Default Resolution**: Automatically inherits the system OS appearance via `window.matchMedia('(prefers-color-scheme: dark)')`.
- **Explicit Override**: Setting `data-theme="light"` or `data-theme="dark"` enforces an initial theme.
- **Learner Toggle**: Learners can toggle between dark and light modes at any time using the theme button in the bottom-left of the footer. Clicking the toggle instantly updates all exercise widgets on the page and persists the preference.

### AI Code Assistance & Explainers

When AI is enabled (`data-show-ai="true"`):
- **Explain Code (✨)**: Available in the top action bar to generate a live, streamed markdown explanation of the editor code.
- **Fix & Explain**: Surfaces automatically in the output console when code execution encounters an error, generating an explanation and an interactive visual code diff with **Accept Fix** and **Reject** buttons.
- **Domain & Auth Fallback**:
  - On `*.datacamp.com` domains: Streams directly from DataCamp's `ai-api` for logged-in users, or renders a free sign-up prompt for logged-out visitors.
  - On external third-party embeds (where cross-origin cookies are restricted): Displays a clean "Open in DataLab" card that opens DataLab with the learner's code prefilled.

### SEO & Search Engine Indexing

DataCamp Light is fully search engine friendly:
1. **Semantic HTML Pre-rendering**: Code snippets, instructions, hints, and comments are placed inside standard semantic `<code>` and `<div>` tags in the page HTML. Web crawlers (Googlebot, Bingbot) index this text before JavaScript execution.
2. **Backlink Equity**: The footer includes a crawlable anchor link pointing to DataCamp's DataLab notebook platform (`https://www.datacamp.com/datalab/new`), transferring authority and allowing visitors to continue practicing in the cloud.

### Other Options

To prevent unstyled layout shifts while the WebAssembly engine loads, add this CSS to your page:

```css
[data-datacamp-exercise] {
  visibility: hidden;
}
```

## How does it work?

Unlike legacy versions that required remote server sessions, DataCamp Light v4 executes entirely client-side:

- **Python**: Runs in a dedicated Web Worker via Pyodide. Packages are installed from PyPI using `micropip`. Matplotlib plots are captured directly from Python as SVGs.
- **R**: Runs via webR on the main thread using an internal compute channel. Plots are captured as PNG data URIs.
- **Shell**: Runs BusyBox WebAssembly coreutils (`ls`, `cat`, `grep`, `wc`, `sed`, `sort`, etc.) and an in-memory virtual filesystem connected to an xterm.js terminal with accessible ANSI color themes.

## Developing locally

### Prerequisites

- Node.js (see `.nvmrc`).
- `@datacamp/waffles` and `@datacamp/waffles-fonts` are published to the DataCamp npm registry. Export your token if needed: `export NPM_TOKEN=$(grep -o 'npm_[^"]*' ~/.npmrc)`.
- Install dependencies with `--legacy-peer-deps`: `npm install --legacy-peer-deps`.

### Run the dev server

```bash
npm run dev -- --port 5183
```

Open `http://localhost:5183/` to view the live development playground with real-time hot module reloading.

### Verification commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run (unit + component + integration tests)
npm run build       # tsc -b && vite build -> dist/dcl-react.js, dist/dcl-react.es.js, dist/datacamp-light.css
npm run update:shellwhat  # sync shellwhat Python sources
npm run update:testwhat   # sync testwhat R sources
```

## Architecture

```
HTML Page / Tutorial Block
  └─ <div data-datacamp-exercise data-lang="python|r|shell" data-theme="..." data-show-ai="...">
        └─ src/boot.tsx → getSettings(element) → render
             └─ src/components/DataCampExercise.tsx
                  ├─ CodeExercise (python|r): CodeEditor (CodeMirror 6) + OutputConsole + PlotCanvas + ActionBar + AiExplanationPanel
                  ├─ ShellExercise (shell): TerminalConsole (xterm.js) + HintPanel + SCT
                  ├─ DCLWidgetShell: Themed root with dark/light waffles tokens
                  └─ Session Lifecycle:
                       ├─ python → src/runtime/WasmSession.ts → pyodideWorkerSource.ts (Pyodide Web Worker)
                       ├─ r      → src/runtime/RWebRSession.ts (webR)
                       └─ shell  → src/runtime/ShellSession.ts → shellWorkerSource.ts (BusyBox WASM)
                  └─ AI Module (src/ai/):
                       ├─ aiClient.ts: Streaming prediction client for ai-api
                       ├─ lineDiff.ts: LCS-based code diff generator
                       └─ auth.ts & aiConfig.ts: First-party domain & signed-in validation
                  └─ Theme Module (src/theme/):
                       └─ themeManager.ts: System OS detection, cross-instance sync & localStorage persistence
```
