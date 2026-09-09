import type { Completion } from '@codemirror/autocomplete';
import { snippet } from '@codemirror/autocomplete';
import type {
  CompletionCategory,
  CompletionSnippetTemplate,
  StaticCompletionCatalog,
} from './types';

const template = (
  label: string,
  detail: string,
  category: CompletionCategory,
  snippetText: string,
  boost = 50,
  documentation?: CompletionSnippetTemplate['documentation'],
): CompletionSnippetTemplate => ({
  label,
  detail,
  category,
  snippet: snippetText,
  boost,
  ...(documentation ? { documentation } : {}),
});

const documentation = (
  synopsis: string,
  extra: Partial<NonNullable<CompletionSnippetTemplate['documentation']>> = {},
): CompletionSnippetTemplate['documentation'] => ({
  synopsis,
  ...extra,
});

export const pythonCatalog: StaticCompletionCatalog = {
  language: 'python',
  templates: [
    template('def', 'Function definition', 'keyword', 'def ${1:name}(${2:params}):\n\t${3:pass}', 99, documentation('Define a function.', { example: 'def greet(name):\n\treturn f"Hello {name}"' })),
    template('class', 'Class definition', 'keyword', 'class ${1:ClassName}:\n\tdef __init__(self, ${2:args}):\n\t\t${3:pass}', 99, documentation('Define a class.', { example: 'class Point:\n\tdef __init__(self, x, y):\n\t\tself.x = x\n\t\tself.y = y' })),
    template('from ... import', 'Selective import', 'keyword', 'from ${1:module} import ${2:symbol}', 98, documentation('Import a specific symbol from a module.', { example: 'from collections import Counter' })),
    template('import', 'Module import', 'keyword', 'import ${1:module}', 98, documentation('Import a module.', { example: 'import numpy as np' })),
    template('return', 'Return statement', 'keyword', 'return ${1:value}', 98),
    template('if', 'Conditional statement', 'keyword', 'if ${1:condition}:\n\t${2:pass}', 97, documentation('Execute a block only when a condition is true.', { example: 'if x > 0:\n\tprint("positive")' })),
    template('elif', 'Else-if branch', 'keyword', 'elif ${1:condition}:\n\t${2:pass}', 96),
    template('else', 'Else branch', 'keyword', 'else:\n\t${1:pass}', 96),
    template('for ...in', 'For loop', 'keyword', 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', 97, documentation('Iterate over a sequence.', { example: 'for value in values:\n\tprint(value)' })),
    template('while', 'While loop', 'keyword', 'while ${1:condition}:\n\t${2:pass}', 97),
    template('with', 'Context manager', 'keyword', 'with ${1:expression} as ${2:variable}:\n\t${3:pass}', 96, documentation('Manage a resource within a block.', { example: 'with open("file.txt") as handle:\n\tdata = handle.read()' })),
    template('try ... except', 'Exception handler', 'keyword', 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:error}:\n\t${4:pass}', 96, documentation('Handle an exception.', { example: 'try:\n\tresult = value / divider\nexcept ZeroDivisionError:\n\tresult = None' })),
    template('lambda', 'Anonymous function', 'keyword', 'lambda ${1:argument}: ${2:expression}', 95),
    template('yield', 'Generator yield', 'keyword', 'yield ${1:value}', 95),
    template('async def', 'Async coroutine', 'keyword', 'async def ${1:name}(${2:params}):\n\t${3:pass}', 95),
    template('await', 'Await a coroutine', 'keyword', 'await ${1:coroutine}', 94),
    template('global', 'Declare a global name', 'keyword', 'global ${1:name}', 93),
    template('nonlocal', 'Declare a nonlocal name', 'keyword', 'nonlocal ${1:name}', 93),
    template('break', 'Exit the innermost loop', 'keyword', 'break', 93),
    template('continue', 'Skip to the next loop iteration', 'keyword', 'continue', 93),
    template('pass', 'No-operation statement', 'keyword', 'pass', 93),
    template('print', 'Write values to standard output', 'function', 'print(${1:value})', 85, documentation('Print values to standard output.', { signature: 'print(*values, sep=" ", end="\\n")', example: 'print("hello", "world", sep=", ")' })),
    template('len', 'Length of a sequence or collection', 'function', 'len(${1:object})', 80),
    template('range', 'Generate a numeric range', 'function', 'range(${1:start}, ${2:stop}, ${3:step})', 80, documentation('Generate a sequence of integers.', { signature: 'range(stop) / range(start, stop[, step])' })),
    template('enumerate', 'Indexed iteration over a sequence', 'function', 'enumerate(${1:iterable}, ${2:start}=0)', 78),
    template('zip', 'Pair elements from multiple iterables', 'function', 'zip(${1:*iterables})', 75),
    template('map', 'Apply a function to every iterable element', 'function', 'map(${1:function}, ${2:*iterables})', 72),
    template('filter', 'Keep elements passing a predicate', 'function', 'filter(${1:function}, ${2:iterable})', 72),
    template('sum', 'Sum of an iterable', 'function', 'sum(${1:iterable}, ${2:start}=0)', 75),
    template('min', 'Smallest value in an iterable', 'function', 'min(${1:iterable})', 74),
    template('max', 'Largest value in an iterable', 'function', 'max(${1:iterable})', 74),
    template('abs', 'Absolute value of a number', 'function', 'abs(${1:number})', 73),
    template('round', 'Round a number', 'function', 'round(${1:number}, ${2:digits}=None)', 73),
    template('sorted', 'Sort an iterable into a new list', 'function', 'sorted(${1:iterable}, ${2:key}=None, ${3:reverse}=False)', 72),
    template('reversed', 'Reverse an iterable into an iterator', 'function', 'reversed(${1:sequence})', 72),
    template('isinstance', 'Type check a value', 'function', 'isinstance(${1:object}, ${2:classOrTuple})', 74),
    template('issubclass', 'Check whether a class inherits another', 'function', 'issubclass(${1:class}, ${2:classOrTuple})', 72),
    template('type', 'Type of a value', 'function', 'type(${1:object})', 74),
    template('getattr', 'Read an attribute by name', 'function', 'getattr(${1:object}, ${2:name}, ${3:default}=None)', 72),
    template('setattr', 'Write an attribute by name', 'function', 'setattr(${1:object}, ${2:name}, ${3:value})', 71),
    template('hasattr', 'Check whether an attribute exists', 'function', 'hasattr(${1:object}, ${2:name})', 71),
    template('repr', 'Printable representation of a value', 'function', 'repr(${1:object})', 71),
    template('id', 'Identity of an object', 'function', 'id(${1:object})', 70),
    template('int', 'Convert to an integer', 'function', 'int(${1:value}, ${2:base}=10)', 78),
    template('float', 'Convert to a float', 'function', 'float(${1:value})', 78),
    template('str', 'Convert to a string', 'function', 'str(${1:value})', 78),
    template('bool', 'Convert to a boolean', 'function', 'bool(${1:value})', 77),
    template('list', 'Create a list', 'function', 'list(${1:iterable}=None)', 77),
    template('dict', 'Create a dictionary', 'function', 'dict(${1:mapping}=None)', 77),
    template('set', 'Create a set', 'function', 'set(${1:iterable}=None)', 76),
    template('tuple', 'Create a tuple', 'function', 'tuple(${1:iterable}=None)', 76),
  ],
};

export const pythonMemberCatalog: Record<string, CompletionSnippetTemplate[]> = {
  pd: [
    template('read_csv', 'Read CSV into DataFrame', 'function', 'read_csv("${1:filename.csv}")', 90, documentation('Read a comma-separated values (csv) file into DataFrame.', { signature: 'pd.read_csv(filepath_or_buffer, ...)' })),
    template('DataFrame', 'Construct DataFrame', 'class', 'DataFrame(${1:data})', 90),
    template('Series', 'Construct 1D Series', 'class', 'Series(${1:data})', 85),
    template('concat', 'Concatenate pandas objects', 'function', 'concat([${1:df1}, ${2:df2}])', 80),
    template('merge', 'Merge DataFrames', 'function', 'merge(${1:left}, ${2:right}, on="${3:key}")', 80),
    template('isna', 'Detect missing values', 'function', 'isna(${1:obj})', 70),
  ],
  df: [
    template('head', 'Return top rows', 'function', 'head(${1:5})', 90, documentation('Return the first n rows.', { signature: 'df.head(n=5)' })),
    template('tail', 'Return bottom rows', 'function', 'tail(${1:5})', 85),
    template('describe', 'Summary statistics', 'function', 'describe()', 85),
    template('shape', 'Tuple of dimensions', 'property', 'shape', 80),
    template('columns', 'Column labels', 'property', 'columns', 80),
    template('dtypes', 'Data types of columns', 'property', 'dtypes', 75),
    template('info', 'Concise data frame summary', 'function', 'info()', 65, documentation('DataFrame.info: memory usage and dtypes of columns.', { signature: 'df.info()' })),
    template('groupby', 'Group DataFrame', 'function', 'groupby("${1:column}")', 85),
    template('sort_values', 'Sort by values', 'function', 'sort_values(by="${1:column}")', 80),
    template('drop', 'Drop specified labels', 'function', 'drop(columns=["${1:column}"])', 75),
    template('fillna', 'Fill NA/NaN values', 'function', 'fillna(${1:value})', 75),
    template('dropna', 'Remove missing values', 'function', 'dropna()', 75),
    template('to_csv', 'Write to CSV file', 'function', 'to_csv("${1:out.csv}", index=False)', 70),
  ],
  np: [
    template('array', 'Create NumPy array', 'function', 'array(${1:list})', 90),
    template('zeros', 'Array of zeros', 'function', 'zeros(${1:shape})', 85),
    template('ones', 'Array of ones', 'function', 'ones(${1:shape})', 85),
    template('arange', 'Evenly spaced values within interval', 'function', 'arange(${1:start}, ${2:stop}, ${3:step})', 85),
    template('linspace', 'Evenly spaced numbers over interval', 'function', 'linspace(${1:start}, ${2:stop}, ${3:num})', 80),
    template('mean', 'Compute arithmetic mean', 'function', 'mean(${1:a})', 80),
    template('median', 'Compute median', 'function', 'median(${1:a})', 75),
    template('std', 'Compute standard deviation', 'function', 'std(${1:a})', 75),
    template('sum', 'Sum of array elements', 'function', 'sum(${1:a})', 75),
    template('random', 'Random sampling module', 'module', 'random', 70),
  ],
  plt: [
    template('plot', 'Plot lines and markers', 'function', 'plot(${1:x}, ${2:y})', 90),
    template('scatter', 'Scatter plot', 'function', 'scatter(${1:x}, ${2:y})', 85),
    template('bar', 'Bar plot', 'function', 'bar(${1:x}, ${2:height})', 85),
    template('hist', 'Histogram', 'function', 'hist(${1:x}, bins=${2:10})', 80),
    template('title', 'Set axes title', 'function', 'title("${1:Title}")', 80),
    template('xlabel', 'Set x-axis label', 'function', 'xlabel("${1:Label}")', 75),
    template('ylabel', 'Set y-axis label', 'function', 'ylabel("${1:Label}")', 75),
    template('show', 'Display current figure', 'function', 'show()', 85),
    template('grid', 'Configure grid lines', 'function', 'grid(True)', 70),
  ],
  sns: [
    template('scatterplot', 'Seaborn scatter plot', 'function', 'scatterplot(data=${1:df}, x="${2:x}", y="${3:y}")', 90),
    template('lineplot', 'Seaborn line plot', 'function', 'lineplot(data=${1:df}, x="${2:x}", y="${3:y}")', 85),
    template('barplot', 'Seaborn bar plot', 'function', 'barplot(data=${1:df}, x="${2:x}", y="${3:y}")', 85),
    template('histplot', 'Seaborn histogram', 'function', 'histplot(data=${1:df}, x="${2:x}")', 85),
    template('heatmap', 'Plot rectangular data as color-encoded matrix', 'function', 'heatmap(${1:data})', 80),
    template('set_theme', 'Set aesthetic theme parameters', 'function', 'set_theme()', 75),
  ],
};

export const rCatalog: StaticCompletionCatalog = {
  language: 'r',
  templates: [
    template('function', 'Function definition', 'keyword', 'function(${1:params}) {\n\t${2}\n}', 99),
    template('if', 'Conditional branch', 'keyword', 'if (${1:cond}) {\n\t${2}\n}', 98),
    template('else', 'Else branch', 'keyword', 'else {\n\t${1}\n}', 97),
    template('for', 'For loop', 'keyword', 'for (${1:i} in ${2:seq}) {\n\t${3}\n}', 96),
    template('while', 'While loop', 'keyword', 'while (${1:cond}) {\n\t${2}\n}', 95),
    template('library', 'Load package', 'function', 'library(${1:package})', 90),
    template('c', 'Combine values into vector', 'function', 'c(${1:values})', 90),
    template('data.frame', 'Construct data frame', 'function', 'data.frame(${1:col1} = ${2:val1})', 85),
    template('matrix', 'Construct matrix', 'function', 'matrix(${1:data}, nrow = ${2:rows}, ncol = ${3:cols})', 80),
    template('list', 'Construct list', 'function', 'list(${1:elem1})', 80),
    template('seq', 'Generate regular sequence', 'function', 'seq(${1:from}, ${2:to}, by = ${3:step})', 75),
    template('rep', 'Replicate elements', 'function', 'rep(${1:x}, times = ${2:n})', 75),
    template('mean', 'Arithmetic mean', 'function', 'mean(${1:x}, na.rm = TRUE)', 80),
    template('median', 'Sample median', 'function', 'median(${1:x}, na.rm = TRUE)', 75),
    template('sd', 'Standard deviation', 'function', 'sd(${1:x}, na.rm = TRUE)', 75),
    template('sum', 'Sum of values', 'function', 'sum(${1:x}, na.rm = TRUE)', 75),
    template('summary', 'Object summary', 'function', 'summary(${1:object})', 75),
    template('plot', 'Generic X-Y plotting', 'function', 'plot(${1:x}, ${2:y})', 85),
    template('head', 'First parts of an object', 'function', 'head(${1:x}, n = 6)', 80),
    template('tail', 'Last parts of an object', 'function', 'tail(${1:x}, n = 6)', 75),
    template('dim', 'Dimensions of object', 'function', 'dim(${1:x})', 70),
    template('nrow', 'Number of rows', 'function', 'nrow(${1:x})', 70),
    template('ncol', 'Number of columns', 'function', 'ncol(${1:x})', 70),
    template('%>%', 'Magrittr pipe operator', 'keyword', '%>% ${1}', 90),
    template('|>', 'Base R pipe operator', 'keyword', '|> ${1}', 90),
  ],
};

export const rMemberCatalog: Record<string, CompletionSnippetTemplate[]> = {
  df: [
    template('head', 'First rows', 'function', 'head(${1:5})', 80),
    template('tail', 'Last rows', 'function', 'tail(${1:5})', 75),
  ],
};

export const shellCatalog: StaticCompletionCatalog = {
  language: 'shell',
  templates: [
    template('echo', 'Write arguments to standard output', 'function', 'echo "${1:message}"', 95),
    template('ls', 'List directory contents', 'function', 'ls -la ${1:path}', 90),
    template('cd', 'Change working directory', 'function', 'cd ${1:path}', 90),
    template('pwd', 'Print name of current directory', 'function', 'pwd', 85),
    template('mkdir', 'Create directories', 'function', 'mkdir -p ${1:dir}', 85),
    template('rm', 'Remove files or directories', 'function', 'rm -rf ${1:path}', 80),
    template('cp', 'Copy files and directories', 'function', 'cp -r ${1:source} ${2:dest}', 80),
    template('mv', 'Move or rename files', 'function', 'mv ${1:source} ${2:dest}', 80),
    template('cat', 'Concatenate and print files', 'function', 'cat ${1:file}', 80),
    template('grep', 'Search text matching a pattern', 'function', 'grep -E "${1:pattern}" ${2:file}', 80),
    template('head', 'Output the first part of files', 'function', 'head -n ${1:10} ${2:file}', 75),
    template('tail', 'Output the last part of files', 'function', 'tail -n ${1:10} ${2:file}', 75),
    template('wc', 'Print newline, word, and byte counts', 'function', 'wc -l ${1:file}', 75),
    template('sort', 'Sort lines of text files', 'function', 'sort -u ${1:file}', 70),
    template('uniq', 'Report or omit repeated lines', 'function', 'uniq ${1:file}', 70),
    template('cut', 'Remove sections from each line', 'function', 'cut -d "${1:,}" -f ${2:1} ${3:file}', 70),
    template('awk', 'Pattern scanning and processing language', 'function', "awk '{print $${1:1}}' ${2:file}", 70),
    template('sed', 'Stream editor for filtering and transforming text', 'function', "sed 's/${1:old}/${2:new}/g' ${3:file}", 70),
    template('find', 'Search for files in a directory hierarchy', 'function', 'find ${1:.} -name "${2:pattern}"', 65),
    template('tar', 'Manipulate tape archives', 'function', 'tar -czvf ${1:archive.tar.gz} ${2:dir}', 65),
    template('export', 'Set environment variable', 'keyword', 'export ${1:VAR}="${2:value}"', 85),
    template('if', 'Conditional execution', 'keyword', 'if [ ${1:condition} ]; then\n\t${2}\nfi', 80),
    template('for', 'For loop', 'keyword', 'for ${1:item} in ${2:list}; do\n\t${3}\ndone', 80),
    template('while', 'While loop', 'keyword', 'while ${1:condition}; do\n\t${2}\ndone', 75),
  ],
};

export const sqlCatalog: StaticCompletionCatalog = {
  language: 'sql',
  templates: [
    template('SELECT', 'Select columns from table', 'keyword', 'SELECT ${1:*} FROM ${2:table}', 99),
    template('SELECT DISTINCT', 'Select unique rows', 'keyword', 'SELECT DISTINCT ${1:*} FROM ${2:table}', 95),
    template('FROM', 'Specify source table', 'keyword', 'FROM ${1:table}', 95),
    template('WHERE', 'Filter rows with condition', 'keyword', 'WHERE ${1:condition}', 95),
    template('GROUP BY', 'Group rows by column(s)', 'keyword', 'GROUP BY ${1:column}', 90),
    template('HAVING', 'Filter grouped rows', 'keyword', 'HAVING ${1:condition}', 85),
    template('ORDER BY', 'Sort query results', 'keyword', 'ORDER BY ${1:column} ${2:ASC}', 90),
    template('LIMIT', 'Limit result row count', 'keyword', 'LIMIT ${1:10}', 85),
    template('JOIN', 'Inner join tables', 'keyword', 'JOIN ${1:table2} ON ${2:table1.id} = ${3:table2.id}', 90),
    template('LEFT JOIN', 'Left outer join tables', 'keyword', 'LEFT JOIN ${1:table2} ON ${2:table1.id} = ${3:table2.id}', 90),
    template('RIGHT JOIN', 'Right outer join tables', 'keyword', 'RIGHT JOIN ${1:table2} ON ${2:table1.id} = ${3:table2.id}', 85),
    template('FULL JOIN', 'Full outer join tables', 'keyword', 'FULL JOIN ${1:table2} ON ${2:table1.id} = ${3:table2.id}', 80),
    template('UNION', 'Combine distinct results', 'keyword', 'UNION\nSELECT ${1:*} FROM ${2:table2}', 80),
    template('UNION ALL', 'Combine all results including duplicates', 'keyword', 'UNION ALL\nSELECT ${1:*} FROM ${2:table2}', 80),
    template('INSERT INTO', 'Insert rows into table', 'keyword', 'INSERT INTO ${1:table} (${2:cols}) VALUES (${3:values})', 75),
    template('UPDATE', 'Update rows in table', 'keyword', 'UPDATE ${1:table} SET ${2:col} = ${3:val} WHERE ${4:cond}', 75),
    template('DELETE FROM', 'Delete rows from table', 'keyword', 'DELETE FROM ${1:table} WHERE ${2:cond}', 70),
    template('COUNT', 'Count number of rows', 'function', 'COUNT(${1:*})', 85),
    template('SUM', 'Sum values in column', 'function', 'SUM(${1:column})', 80),
    template('AVG', 'Calculate average of column', 'function', 'AVG(${1:column})', 80),
    template('MIN', 'Minimum value in column', 'function', 'MIN(${1:column})', 75),
    template('MAX', 'Maximum value in column', 'function', 'MAX(${1:column})', 75),
    template('COALESCE', 'First non-null expression', 'function', 'COALESCE(${1:col}, ${2:fallback})', 70),
  ],
};

export function getStaticCompletionCatalog(language: string): StaticCompletionCatalog {
  const normalized = (language || 'python').toLowerCase();
  if (normalized === 'r') return rCatalog;
  if (normalized === 'shell' || normalized === 'bash' || normalized === 'sh' || normalized === 'zsh') return shellCatalog;
  if (normalized === 'sql') return sqlCatalog;
  return pythonCatalog;
}

export function hasMeaningfulDocumentation(entry: CompletionSnippetTemplate): boolean {
  if (!entry.documentation) return false;
  const { synopsis, signature, parameters, returns, example } = entry.documentation;

  // If there are rich doc fields (example, parameters, returns, or explicit signature distinct from detail)
  if (example || (parameters && parameters.length > 0) || returns) {
    return true;
  }
  if (signature && signature !== entry.detail && signature !== entry.label) {
    return true;
  }
  // If synopsis has substantive text that isn't just identical to detail/label
  if (synopsis && synopsis.trim().toLowerCase() !== entry.detail.trim().toLowerCase() && synopsis.trim().toLowerCase() !== entry.label.trim().toLowerCase()) {
    return true;
  }

  return false;
}

export function templateToCompletion(entry: CompletionSnippetTemplate): Completion {
  const showInfoPanel = hasMeaningfulDocumentation(entry);

  return {
    label: entry.label,
    type: entry.category,
    detail: entry.detail,
    ...(showInfoPanel ? { info: () => renderCompletionInfo(entry) } : {}),
    apply: snippet(entry.snippet),
    boost: entry.boost,
  };
}

export function staticCatalogToCompletions(catalog: StaticCompletionCatalog): Completion[] {
  return catalog.templates.map(templateToCompletion);
}

function renderCompletionInfo(entry: CompletionSnippetTemplate): HTMLElement {
  const container = document.createElement('div');
  container.className = 'dcl-completion-info';

  // 1. Signature top banner
  const explicitSignature = entry.documentation?.signature;
  const isCallable = entry.category === 'function' || entry.category === 'class';
  const rawSignature = explicitSignature || (isCallable ? entry.detail : '');

  if (rawSignature && rawSignature !== 'function' && rawSignature !== 'class') {
    const banner = document.createElement('div');
    banner.className = 'dcl-completion-info-signature-banner';
    const prefix = entry.label;
    if (rawSignature.startsWith('(')) {
      banner.textContent = `${prefix}${rawSignature}`;
    } else if (rawSignature.includes(prefix)) {
      banner.textContent = rawSignature;
    } else {
      banner.textContent = `${prefix} ${rawSignature}`;
    }
    container.appendChild(banner);
  }

  // 2. Docstring / synopsis body
  if (entry.documentation?.synopsis) {
    const synopsis = document.createElement('div');
    synopsis.className = 'dcl-completion-info-body';
    synopsis.textContent = entry.documentation.synopsis;
    container.appendChild(synopsis);
  }

  // 3. Parameters list if explicitly defined in structured template
  if (entry.documentation?.parameters?.length) {
    const parameterList = document.createElement('ul');
    parameterList.className = 'dcl-completion-info-parameters';
    for (const parameter of entry.documentation.parameters) {
      const parameterItem = document.createElement('li');
      parameterItem.textContent = parameter;
      parameterList.appendChild(parameterItem);
    }
    container.appendChild(parameterList);
  }

  // 4. Returns section
  if (entry.documentation?.returns) {
    const returnsElement = document.createElement('div');
    returnsElement.className = 'dcl-completion-info-returns';
    returnsElement.textContent = `Returns: ${entry.documentation.returns}`;
    container.appendChild(returnsElement);
  }

  // 5. Code examples
  if (entry.documentation?.example) {
    const exampleElement = document.createElement('pre');
    exampleElement.className = 'dcl-completion-info-example';
    exampleElement.textContent = entry.documentation.example;
    container.appendChild(exampleElement);
  }

  return container;
}

export function extractDocumentSymbols(code: string, language: string): CompletionSnippetTemplate[] {
  if (!code || !code.trim()) return [];
  const normalizedLanguage = (language || 'python').toLowerCase();
  const templates: CompletionSnippetTemplate[] = [];
  const seen = new Set<string>();

  const add = (label: string, category: CompletionCategory, detail: string, boost: number) => {
    if (!label || label.startsWith('_') || seen.has(label)) return;
    seen.add(label);
    templates.push({
      label,
      category,
      detail,
      snippet: label,
      boost,
    });
  };

  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    if (normalizedLanguage === 'python') {
      const funcMatch = trimmed.match(/^def\s+([a-zA-Z_]\w*)\s*\((.*?)\):/);
      if (funcMatch) {
        add(funcMatch[1], 'function', funcMatch[2] ? `(${funcMatch[2].trim()})` : '()', 70);
        continue;
      }
      const classMatch = trimmed.match(/^class\s+([a-zA-Z_]\w*)/);
      if (classMatch) {
        add(classMatch[1], 'class', 'class', 65);
        continue;
      }
      const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*=/);
      if (assignMatch && !trimmed.startsWith('self.')) {
        add(assignMatch[1], 'variable', 'variable', 60);
        continue;
      }
      const importAsMatch = trimmed.match(/^import\s+[\w.]+\s+as\s+([a-zA-Z_]\w*)/);
      if (importAsMatch) {
        add(importAsMatch[1], 'module', 'module', 65);
        continue;
      }
      const fromImportMatch = trimmed.match(/^from\s+[\w.]+\s+import\s+(.+)$/);
      if (fromImportMatch) {
        fromImportMatch[1].split(',').forEach((sym) => {
          const s = sym.trim();
          const asM = s.match(/(\w+)\s+as\s+(\w+)/);
          if (asM) add(asM[2], 'variable', 'imported', 60);
          else if (s) add(s, 'variable', 'imported', 60);
        });
      }
    } else if (normalizedLanguage === 'r') {
      const funcMatch = trimmed.match(/^([a-zA-Z._][\w._]*)\s*<-\s*function/);
      if (funcMatch) {
        add(funcMatch[1], 'function', 'function', 70);
        continue;
      }
      const assignMatch = trimmed.match(/^([a-zA-Z._][\w._]*)\s*(?:<-|=)\s*/);
      if (assignMatch) {
        add(assignMatch[1], 'variable', 'variable', 60);
      }
    } else if (normalizedLanguage === 'shell') {
      const funcMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*\(\s*\)\s*\{/);
      if (funcMatch) {
        add(funcMatch[1], 'function', 'shell function', 70);
        continue;
      }
      const varMatch = trimmed.match(/^([a-zA-Z_]\w*)=/);
      if (varMatch) {
        add(varMatch[1], 'variable', 'env var', 60);
      }
    } else if (normalizedLanguage === 'sql') {
      const tableMatch = trimmed.match(/(?:FROM|JOIN|TABLE)\s+([a-zA-Z_]\w*)/i);
      if (tableMatch) {
        add(tableMatch[1], 'table', 'table', 70);
      }
      const cteMatch = trimmed.match(/WITH\s+([a-zA-Z_]\w*)\s+AS/i);
      if (cteMatch) {
        add(cteMatch[1], 'table', 'CTE', 75);
      }
    }
  }

  return templates;
}

export function getStaticMemberCompletions(
  language: string,
  objectName: string,
): CompletionSnippetTemplate[] {
  const normalizedLang = (language || 'python').toLowerCase();
  const normalizedObj = objectName.toLowerCase();

  if (normalizedLang === 'python') {
    if (pythonMemberCatalog[normalizedObj]) {
      return pythonMemberCatalog[normalizedObj];
    }
    return pythonMemberCatalog.df || [];
  }

  if (normalizedLang === 'r') {
    if (rMemberCatalog[normalizedObj]) {
      return rMemberCatalog[normalizedObj];
    }
    return rMemberCatalog.df || [];
  }

  return [];
}
