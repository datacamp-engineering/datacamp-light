import { snippet } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { CompletionCategory, CompletionDocumentation, CompletionSnippetTemplate, StaticCompletionCatalog } from './types';

const documentation = (synopsis: string, extra?: Omit<CompletionDocumentation, 'synopsis'>): CompletionDocumentation => ({
  synopsis,
  ...extra,
});

const template = (
  label: string,
  detail: string,
  category: CompletionCategory,
  snippetText: string,
  boost: number,
  documentation?: CompletionDocumentation,
): CompletionSnippetTemplate => ({
  label,
  detail,
  category,
  snippet: snippetText,
  boost,
  ...(documentation ? { documentation } : {}),
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
    template('any', 'Whether any iterable element is true', 'function', 'any(${1:iterable})', 73),
    template('all', 'Whether all iterable elements are true', 'function', 'all(${1:iterable})', 73),
    template('zip', 'Pair elements from multiple iterables', 'function', 'zip(${1:*iterables})', 75),
    template('array', 'Create a NumPy array', 'function', 'array(${1:object}, ${2:dtype}=None)', 60, documentation('numpy.array: create an array from array-like input.', { signature: 'np.array(object, dtype=None, copy=True)' })),
    template('zeros', 'Array of zeros', 'function', 'zeros(${1:shape}, ${2:dtype}=float)', 58, documentation('numpy.zeros: array filled with zeros.', { signature: 'np.zeros(shape, dtype=float)' })),
    template('ones', 'Array of ones', 'function', 'ones(${1:shape}, ${2:dtype}=float)', 58, documentation('numpy.ones: array filled with ones.', { signature: 'np.ones(shape, dtype=float)' })),
    template('arange', 'Array of evenly spaced values', 'function', 'arange(${1:start}, ${2:stop}, ${3:step}=1)', 58, documentation('numpy.arange: evenly spaced values in a half-open interval.', { signature: 'np.arange([start, ]stop[, step])' })),
    template('linspace', 'Array of evenly spaced samples', 'function', 'linspace(${1:start}, ${2:stop}, ${3:number}=50)', 58, documentation('numpy.linspace: evenly spaced samples over an interval.', { signature: 'np.linspace(start, stop, num=50)' })),
    template('mean', 'Mean along a dimension', 'function', 'mean(${1:array}, ${2:axis}=None)', 62, documentation('numpy.mean: arithmetic mean of an array.', { signature: 'np.mean(array, axis=None)' })),
    template('std', 'Standard deviation along a dimension', 'function', 'std(${1:array}, ${2:axis}=None)', 62, documentation('numpy.std: standard deviation of an array.', { signature: 'np.std(array, axis=None)' })),
    template('median', 'Median along a dimension', 'function', 'median(${1:array}, ${2:axis}=None)', 62, documentation('numpy.median: median of an array.', { signature: 'np.median(array, axis=None)' })),
    template('dot', 'Dot product of two arrays', 'function', 'dot(${1:left}, ${2:right})', 62, documentation('numpy.dot: dot product.', { signature: 'np.dot(left, right)' })),
    template('where', 'Conditional array selection', 'function', 'where(${1:condition}, ${2:ifTrue}=None, ${3:ifFalse}=None)', 58, documentation('numpy.where: choose values based on a condition.', { signature: 'np.where(condition, ifTrue, ifFalse)' })),
    template('randn', 'Standard normal random samples', 'function', 'randn(${1:rows}, ${2:columns}=None)', 55, documentation('numpy.random.randn: samples from the standard normal distribution.', { signature: 'np.random.randn(d0, d1, ...)' })),
    template('DataFrame', 'Two-dimensional tabular data', 'function', 'DataFrame(${1:data}, ${2:columns}=None)', 60, documentation('pandas.DataFrame: two-dimensional labeled data structure.', { signature: 'pd.DataFrame(data, index=None, columns=None)' })),
    template('Series', 'One-dimensional labeled array', 'function', 'Series(${1:data}, ${2:index}=None)', 60, documentation('pandas.Series: one-dimensional labeled array.', { signature: 'pd.Series(data, index=None)' })),
    template('read_csv', 'Read a comma-separated file', 'function', 'read_csv(${1:path})', 60, documentation('pandas.read_csv: read a CSV file into a DataFrame.', { signature: "pd.read_csv(filepath, sep=',')" })),
    template('read_parquet', 'Read a Parquet file', 'function', 'read_parquet(${1:path})', 58, documentation('pandas.read_parquet: read a Parquet file into a DataFrame.', { signature: 'pd.read_parquet(path)' })),
    template('concat', 'Concatenate objects along an axis', 'function', 'concat(${1:objects}, ${2:axis}=0)', 58, documentation('pandas.concat: concatenate pandas objects.', { signature: 'pd.concat(objects, axis=0)' })),
    template('merge', 'Merge two DataFrame objects', 'function', 'merge(${1:left}, ${2:right}, ${3:how}="inner")', 58, documentation('pandas.merge: merge DataFrame objects by keys.', { signature: "pd.merge(left, right, on=None, how='inner')" })),
    template('head', 'First rows of a data frame', 'function', 'head(${1:rows}=5)', 65, documentation('DataFrame.head: return the first rows.', { signature: 'df.head(n=5)' })),
    template('tail', 'Last rows of a data frame', 'function', 'tail(${1:rows}=5)', 65, documentation('DataFrame.tail: return the last rows.', { signature: 'df.tail(n=5)' })),
    template('describe', 'Summary statistics of a data frame', 'function', 'describe()', 65, documentation('DataFrame.describe: descriptive statistics of numeric columns.', { signature: 'df.describe()' })),
    template('info', 'Concise data frame summary', 'function', 'info()', 65, documentation('DataFrame.info: memory usage and dtypes of columns.', { signature: 'df.info()' })),
    template('groupby', 'Group rows by column values', 'function', "groupby(${1:by})", 65, documentation('DataFrame.groupby: group rows by a column or mapper.', { signature: "df.groupby(by)" })),
    template('dropna', 'Drop rows with missing values', 'function', 'dropna(${1:axis}=0)', 64, documentation('DataFrame.dropna: remove missing values.', { signature: 'df.dropna(axis=0)' })),
    template('fillna', 'Fill missing values', 'function', 'fillna(${1:value})', 64, documentation('DataFrame.fillna: fill missing values.', { signature: 'df.fillna(value)' })),
    template('value_counts', 'Counts of unique values', 'function', 'value_counts(${1:normalize}=False)', 63, documentation('Series.value_counts: count unique values.', { signature: 'series.value_counts(normalize=False)' })),
    template('apply', 'Apply a function to each row or column', 'function', 'apply(${1:function})', 63, documentation('DataFrame.apply: apply a function along an axis.', { signature: 'df.apply(function)' })),
    template('plot', 'Plot with pyplot', 'function', 'plot(${1:x}, ${2:y})', 55, documentation('matplotlib.pyplot.plot: plot lines or markers.', { signature: 'plt.plot(x, y)' })),
    template('scatter', 'Scatter plot', 'function', 'scatter(${1:x}, ${2:y})', 55, documentation('matplotlib.pyplot.scatter: scatter plot.', { signature: 'plt.scatter(x, y)' })),
    template('hist', 'Histogram', 'function', 'hist(${1:values}, ${2:bins}=10)', 55, documentation('matplotlib.pyplot.hist: histogram of values.', { signature: 'plt.hist(values, bins=10)' })),
    template('xlabel', 'X-axis label', 'function', "xlabel(${1:label})", 53, documentation('matplotlib.pyplot.xlabel: set the x-axis label.', { signature: "plt.xlabel(label)" })),
    template('ylabel', 'Y-axis label', 'function', "ylabel(${1:label})", 53, documentation('matplotlib.pyplot.ylabel: set the y-axis label.', { signature: "plt.ylabel(label)" })),
    template('title', 'Plot title', 'function', "title(${1:title})", 53, documentation('matplotlib.pyplot.title: set the plot title.', { signature: "plt.title(title)" })),
    template('legend', 'Plot legend', 'function', 'legend()', 53),
    template('show', 'Display a figure', 'function', 'show()', 53),
    template('figure', 'Create a new figure', 'function', 'figure(${1:figsize}=None)', 53, documentation('matplotlib.pyplot.figure: create a new figure.', { signature: 'plt.figure(figsize=None)' })),
    template('lineplot', 'Line plot with seaborn', 'function', "lineplot(${1:data}, ${2:x}=None, ${3:y}=None)", 55, documentation('seaborn.lineplot: line plot with confidence band.', { signature: "sns.lineplot(data=df, x='x', y='y')" })),
    template('barplot', 'Bar plot with seaborn', 'function', "barplot(${1:data}, ${2:x}=None, ${3:y}=None)", 55, documentation('seaborn.barplot: categorical bar plot.', { signature: "sns.barplot(data=df, x='x', y='y')" })),
    template('heatmap', 'Heatmap with seaborn', 'function', 'heatmap(${1:data})', 55, documentation('seaborn.heatmap: heatmap of rectangular data.', { signature: 'sns.heatmap(data=df)' })),
  ],
};

export const rCatalog: StaticCompletionCatalog = {
  language: 'r',
  templates: [
    template('function', 'Function definition', 'keyword', 'function(${1:params}) {\n\t${2:body}\n}', 99, documentation('Define a function.', { example: 'square <- function(value) {\n\tvalue ** 2\n}' })),
    template('library', 'Load a package', 'keyword', 'library(${1:package})', 98),
    template('if', 'Conditional branch', 'keyword', 'if (${1:condition}) {\n\t${2:yes}\n} else {\n\t${3:no}\n}', 97),
    template('for', 'For loop', 'keyword', 'for (${1:index} in ${2:sequence}) {\n\t${3:body}\n}', 97),
    template('while', 'While loop', 'keyword', 'while (${1:condition}) {\n\t${2:body}\n}', 97),
    template('return', 'Return a value', 'keyword', 'return(${1:value})', 96),
    template('next', 'Skip the current loop iteration', 'keyword', 'next', 92),
    template('break', 'Exit the innermost loop', 'keyword', 'break', 92),
    template('c', 'Combine values into a vector', 'function', 'c(${1:*values})', 80),
    template('data.frame', 'Create a data frame', 'function', 'data.frame(${1:*values})', 78, documentation('data.frame: create a two-dimensional R data structure.', { signature: 'data.frame(...)' })),
    template('matrix', 'Create a matrix', 'function', 'matrix(${1:data}, ${2:rows}=None, ${3:columns}=None)', 76),
    template('list', 'Create a list', 'function', 'list(${1:*values})', 74),
    template('factor', 'Encode a categorical variable', 'function', 'factor(${1:value})', 74),
    template('seq', 'Sequence of values', 'function', 'seq(${1:from}, ${2:to}, ${3:by}=1)', 76),
    template('rep', 'Replicate values', 'function', 'rep(${1:value}, ${2:times}=2)', 74),
    template('summary', 'Summary statistics of an object', 'function', 'summary(${1:object})', 78),
    template('mean', 'Arithmetic mean', 'function', 'mean(${1:value}, ${2:na.rm}=TRUE)', 78),
    template('sd', 'Standard deviation', 'function', 'sd(${1:value}, ${2:na.rm}=TRUE)', 78),
    template('median', 'Median', 'function', 'median(${1:value}, ${2:na.rm}=TRUE)', 77),
    template('var', 'Variance', 'function', 'var(${1:value}, ${2:na.rm}=TRUE)', 77),
    template('sum', 'Sum of values', 'function', 'sum(${1:*values})', 74),
    template('min', 'Smallest value', 'function', 'min(${1:*values})', 73),
    template('max', 'Largest value', 'function', 'max(${1:*values})', 73),
    template('quantile', 'Sample quantiles', 'function', 'quantile(${1:value})', 76),
    template('cor', 'Correlation coefficient', 'function', 'cor(${1:left}, ${2:right})', 76),
    template('lm', 'Fit a linear model', 'function', 'lm(${1:formula}, ${2:data}=None)', 76),
    template('t.test', 'Student t-test', 'function', 't.test(${1:value})', 74),
    template('head', 'First rows of an object', 'function', 'head(${1:value})', 75),
    template('tail', 'Last rows of an object', 'function', 'tail(${1:value})', 75),
    template('str', 'Structure of an object', 'function', 'str(${1:object})', 77),
    template('dim', 'Dimensions of an object', 'function', 'dim(${1:value})', 73),
    template('nrow', 'Number of rows', 'function', 'nrow(${1:value})', 73),
    template('ncol', 'Number of columns', 'function', 'ncol(${1:value})', 73),
    template('names', 'Names of an object', 'function', 'names(${1:value})', 73),
    template('colnames', 'Column names', 'function', 'colnames(${1:value})', 72),
    template('rownames', 'Row names', 'function', 'rownames(${1:value})', 72),
    template('class', 'Class of an object', 'function', 'class(${1:value})', 73),
    template('is.na', 'Missing value test', 'function', 'is.na(${1:value})', 70),
    template('read.csv', 'Read a comma-separated file', 'function', "read.csv('${1:file.csv}')", 75),
    template('write.csv', 'Write a comma-separated file', 'function', "write.csv(${1:value}, '${2:file.csv}')", 72),
    template('paste', 'Concatenate strings', 'function', "paste(${1:*values}, ${2:sep}=' ')", 72),
    template('paste0', 'Concatenate strings without separator', 'function', 'paste0(${1:*values})', 72),
    template('sprintf', 'Format a string', 'function', "sprintf('${1:format}', ${2:value})", 71),
    template('apply', 'Apply a function over margins', 'function', 'apply(${1:value}, ${2:margin}, ${3:function})', 72),
    template('lapply', 'Apply a function to each element', 'function', 'lapply(${1:value}, ${2:function})', 72),
    template('sapply', 'Simplify applying a function to each element', 'function', 'sapply(${1:value}, ${2:function})', 72),
    template('%>%', 'magrittr pipe operator', 'function', '%>% ', 60, documentation('Pipe the left-hand side into the right-hand expression.', { example: 'data %>% filter(value > 0)' })),
    template('|>', 'Native pipe operator', 'function', '|> ', 60),
    template('select', 'Select columns of a data frame', 'function', 'select(${1:*columns})', 65, documentation('dplyr::select: keep columns.', { signature: "select(data, ...)" })),
    template('filter', 'Subset rows of a data frame', 'function', 'filter(${1:condition})', 65, documentation('dplyr::filter: keep rows matching a condition.', { signature: 'filter(data, ...)' })),
    template('mutate', 'Create or transform columns', 'function', 'mutate(${1:column} = ${2:expression})', 65, documentation('dplyr::mutate: add columns derived from existing ones.', { signature: 'mutate(data, new_column = expression)' })),
    template('group_by', 'Group rows of a data frame', 'function', 'group_by(${1:*columns})', 65),
    template('summarize', 'Reduce a data frame to summary rows', 'function', 'summarize(${1:column} = ${2:expression})', 65),
    template('arrange', 'Order rows of a data frame', 'function', 'arrange(${1:*columns})', 63),
    template('left_join', 'Join data frames keeping left rows', 'function', "left_join(${1:other}, ${2:by}='${3:key}')", 63),
    template('inner_join', 'Join data frames keeping matching rows', 'function', "inner_join(${1:other}, ${2:by}='${3:key}')", 63),
    template('distinct', 'Unique rows of a data frame', 'function', 'distinct(${1:*columns})', 63),
    template('count', 'Count observations by group', 'function', 'count(${1:*columns})', 63),
    template('ggplot', 'Create a ggplot plot', 'function', 'ggplot(${1:data}, ${2:aes}=None)', 60, documentation('ggplot2::ggplot: initialize a plotting object.', { signature: 'ggplot(data = df, aes(x = x, y = y))' })),
    template('aes', 'Map aesthetics to data columns', 'function', 'aes(${1:...})', 60),
    template('geom_point', 'Points layer', 'function', 'geom_point()', 60),
    template('geom_line', 'Lines layer', 'function', 'geom_line()', 60),
    template('geom_bar', 'Bars layer', 'function', "geom_bar(${1:stat}='identity')", 60),
    template('geom_histogram', 'Histogram layer', 'function', 'geom_histogram(${1:bins}=30)', 60),
    template('geom_boxplot', 'Box plot layer', 'function', 'geom_boxplot()', 60),
    template('geom_smooth', 'Smoothed line layer', 'function', "geom_smooth(${1:method}='lm')", 58),
    template('labs', 'Axis and title labels', 'function', "labs(${1:title}='${2:title}')", 58),
    template('theme_minimal', 'Minimal theme', 'function', 'theme_minimal()', 58),
    template('theme_bw', 'Black-and-white theme', 'function', 'theme_bw()', 58),
    template('facet_wrap', 'Split plot into facets', 'function', 'facet_wrap(~${1:variable})', 58),
  ],
};

export const shellCatalog: StaticCompletionCatalog = {
  language: 'shell',
  templates: [
    template('if', 'Conditional command block', 'keyword', 'if [ ${1:condition} ]; then\n\t${2:body}\nfi', 97),
    template('for', 'Iterate over command arguments', 'keyword', 'for ${1:variable}in ${2:items}; do\n\t${3:body}\ndone', 97),
    template('while', 'Loop while a condition holds', 'keyword', 'while [ ${1:condition} ]; do\n\t${2:body}\ndone', 97),
    template('export', 'Export a shell variable', 'keyword', 'export ${1:VARIABLE}="${2:value}"', 92),
    template('source', 'Run a script in the current shell', 'function', 'source ${1:script}', 90),
    template('alias', 'Define a command alias', 'function', "alias ${1:name}='${2:command}'", 90),
    template('echo', 'Print a line of text', 'function', 'echo "${1:value}"', 88),
    template('cd', 'Change the current directory', 'function', 'cd ${1:directory}', 95),
    template('pwd', 'Print the working directory', 'function', 'pwd', 90),
    template('ls', 'List directory contents', 'function', 'ls -la ${1:path}', 92),
    template('cat', 'Concatenate and print files', 'function', 'cat ${1:file}', 90),
    template('grep', 'Search text with a regular expression', 'function', "grep -rn '${1:pattern}' ${2:path}", 88),
    template('mkdir', 'Create a directory structure', 'function', 'mkdir -p ${1:directory}', 88),
    template('touch', 'Create a file or update its timestamp', 'function', 'touch ${1:filename}', 86),
    template('rm', 'Remove files or directories', 'function', 'rm -rf ${1:target}', 86),
    template('cp', 'Copy files and directories', 'function', 'cp -r ${1:source} ${2:destination}', 86),
    template('mv', 'Move or rename files', 'function', 'mv ${1:source} ${2:destination}', 86),
    template('head', 'Output the beginning of a file', 'function', 'head -n ${1:10} ${2:file}', 84),
    template('tail', 'Output the end of a file', 'function', 'tail -n ${1:10} ${2:file}', 84),
    template('wc', 'Count words, lines, and bytes', 'function', 'wc -l ${1:file}', 82),
    template('sort', 'Sort lines of a text file', 'function', 'sort -n -r ${1:file}', 82),
    template('uniq', 'Report or omit repeated lines', 'function', 'uniq -c ${1:file}', 82),
    template('sed', 'Stream editor for text transformation', 'function', "sed 's/${1:find}/${2:replace}/g' ${3:file}", 80),
    template('awk', 'Pattern scanning and processing', 'function', "awk '{print $${1:1}' ${2:file}", 80),
    template('find', 'Search for files in a directory', 'function', "find ${1:.} -name '${2:*.py}'", 78),
    template('tar', 'Archive utility', 'function', 'tar -czvf ${1:archive.tar.gz} ${2:path}', 78),
    template('curl', 'Network transfer tool', 'function', 'curl -sSL ${1:url} -o ${2:output}', 78),
    template('wget', 'Network download tool', 'function', 'wget ${1:url} -O ${2:output}', 78),
    template('chmod', 'Change file permissions', 'function', 'chmod ${1:mode} ${2:file}', 76),
    template('chown', 'Change file ownership', 'function', 'chown ${1:owner} ${2:file}', 76),
    template('ln', 'Link files', 'function', 'ln -s ${1:target} ${2:link}', 76),
    template('ps', 'Report running processes', 'function', 'ps aux', 76),
    template('kill', 'Terminate a process', 'function', 'kill ${1:process}', 76),
    template('env', 'Print or set environment variables', 'function', 'env', 74),
    template('which', 'Locate a command', 'function', 'which ${1:command}', 74),
    template('tee', 'Read standard input and copy to files', 'function', 'tee ${1:file}', 72),
    template('xargs', 'Build and run command lines', 'function', 'xargs ${1:command}', 72),
    template('clear', 'Clear the terminal screen', 'function', 'clear', 70),
    template('history', 'Show command history', 'function', 'history', 70),
    template('exit', 'Exit the shell', 'function', 'exit', 70),
  ],
};

export const sqlCatalog: StaticCompletionCatalog = {
  language: 'sql',
  templates: [
    template('SELECT', 'Query columns from tables', 'keyword', 'SELECT ${1:columns} FROM ${2:table}', 98),
    template('FROM', 'Source table of a query', 'keyword', 'FROM ${1:table}', 96),
    template('WHERE', 'Filter rows of a query', 'keyword', 'WHERE ${1:condition}', 94),
    template('GROUP BY', 'Aggregate rows into groups', 'keyword', 'GROUP BY ${1:columns}', 90),
    template('HAVING', 'Filter grouped rows', 'keyword', 'HAVING ${1:condition}', 88),
    template('ORDER BY', 'Sort query results', 'keyword', 'ORDER BY ${1:column} ${2:direction}', 90),
    template('LIMIT', 'Cap the number of result rows', 'keyword', 'LIMIT ${1:number}', 88),
    template('OFFSET', 'Skip result rows', 'keyword', 'OFFSET ${1:number}', 84),
    template('DISTINCT', 'Deduplicate selected rows', 'keyword', 'DISTINCT ${1:columns}', 86),
    template('AS', 'Alias a column, table, or expression', 'keyword', 'AS ${1:alias}', 84),
    template('WITH', 'Common table expression', 'keyword', 'WITH ${1:name} AS (\n\t${2:query}\n)', 84),
    template('JOIN', 'Join tables', 'keyword', 'JOIN ${1:table} ON ${2:condition}', 90),
    template('INNER JOIN', 'Join tables keeping matching rows', 'keyword', 'INNER JOIN ${1:table} ON ${2:condition}', 90),
    template('LEFT JOIN', 'Join tables keeping all left rows', 'keyword', 'LEFT JOIN ${1:table} ON ${2:condition}', 90),
    template('RIGHT JOIN', 'Join tables keeping all right rows', 'keyword', 'RIGHT JOIN ${1:table} ON ${2:condition}', 88),
    template('FULL OUTER JOIN', 'Join tables keeping all rows', 'keyword', 'FULL OUTER JOIN ${1:table} ON ${2:condition}', 86),
    template('CROSS JOIN', 'Cartesian product of tables', 'keyword', 'CROSS JOIN ${1:table}', 86),
    template('ON', 'Join condition', 'keyword', 'ON ${1:condition}', 84),
    template('UNION', 'Combine query results', 'keyword', 'UNION ${1:query}', 86),
    template('UNION ALL', 'Combine query results keeping duplicates', 'keyword', 'UNION ALL ${1:query}', 86),
    template('INTERSECT', 'Rows present in both queries', 'keyword', 'INTERSECT ${1:query}', 84),
    template('EXCEPT', 'Rows in the first query only', 'keyword', 'EXCEPT ${1:query}', 84),
    template('CASE', 'Conditional expression', 'keyword', 'CASE WHEN ${1:condition} THEN ${2:result} ELSE ${3:alternative} END', 86),
    template('AND', 'Logical conjunction', 'keyword', 'AND ${1:condition}', 82),
    template('OR', 'Logical disjunction', 'keyword', 'OR ${1:condition}', 82),
    template('NOT', 'Logical negation', 'keyword', 'NOT ${1:condition}', 80),
    template('IN', 'Membership test', 'keyword', 'IN (${1:values})', 80),
    template('BETWEEN', 'Range check', 'keyword', 'BETWEEN ${1:lower} AND ${2:upper}', 80),
    template('LIKE', 'Pattern match', 'keyword', "LIKE '${1:%pattern%}'", 80),
    template('ILIKE', 'Case-insensitive pattern match', 'keyword', "ILIKE '${1:%pattern%}'", 78),
    template('IS NULL', 'Null check', 'keyword', 'IS NULL', 78),
    template('IS NOT NULL', 'Non-null check', 'keyword', 'IS NOT NULL', 78),
    template('EXISTS', 'Subquery existence check', 'keyword', 'EXISTS (${1:query})', 78),
    template('INSERT INTO', 'Insert rows into a table', 'keyword', 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})', 82),
    template('UPDATE', 'Update rows of a table', 'keyword', 'UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition}', 82),
    template('DELETE FROM', 'Delete rows from a table', 'keyword', 'DELETE FROM ${1:table} WHERE ${2:condition}', 82),
    template('CREATE TABLE', 'Create a table', 'keyword', 'CREATE TABLE ${1:name} (${2:columns})', 82),
    template('DROP TABLE', 'Drop a table', 'keyword', 'DROP TABLE IF EXISTS ${1:name}', 80),
    template('ALTER TABLE', 'Alter a table', 'keyword', 'ALTER TABLE ${1:name} ${2:command}', 80),
    template('COUNT', 'Row count', 'function', 'COUNT(${1:column}) ', 88),
    template('SUM', 'Sum of a column', 'function', 'SUM(${1:column}) ', 84),
    template('AVG', 'Average of a column', 'function', 'AVG(${1:column}) ',84),
    template('MIN', 'Minimum of a column', 'function', 'MIN(${1:column}) ', 84),
    template('MAX', 'Maximum of a column', 'function', 'MAX(${1:column}) ', 84),
    template('COUNT(DISTINCT', 'Distinct row count', 'function', 'COUNT(DISTINCT ${1:column}) ', 84),
    template('STRING_AGG', 'Concatenate column values', 'function', "STRING_AGG(${1:column}, '${2:,}')", 82),
    template('ROW_NUMBER', 'Row number window function', 'function', 'ROW_NUMBER() OVER (PARTITION BY ${1:column} ORDER BY ${2:column})', 78),
    template('RANK', 'Ranked window function', 'function', 'RANK() OVER (PARTITION BY ${1:column} ORDER BY ${2:column})', 78),
    template('DENSE_RANK', 'Dense rank window function', 'function', 'DENSE_RANK() OVER (PARTITION BY ${1:column} ORDER BY ${2:column})', 78),
    template('LAG', 'Previous row window function', 'function', 'LAG(${1:column}, 1) OVER (PARTITION BY ${2:column} ORDER BY ${3:column})', 76),
    template('LEAD', 'Next row window function', 'function', 'LEAD(${1:column}, 1) OVER (PARTITION BY ${2:column} ORDER BY ${3:column})', 76),
    template('COALESCE', 'First non-null value', 'function', 'COALESCE(${1:first}, ${2:second}) ', 76),
    template('NULLIF', 'Return null when values match', 'function', 'NULLIF(${1:left}, ${2:right}) ', 74),
    template('CAST', 'Convert a value type', 'function', 'CAST(${1:expression} AS ${2:TYPE}) ', 76),
    template('strftime', 'Format a timestamp', 'function', "strftime(${1:timestamp}, '${2:%Y-%m-%d}')", 70),
    template('epoch', 'Unix epoch of a timestamp', 'function', 'epoch(${1:timestamp}) ', 68),
    template('epoch_ms', 'Unix epoch milliseconds', 'function', 'epoch_ms(${1:timestamp}) ', 68),
    template('date_trunc', 'Truncate a timestamp to an interval', 'function', "date_trunc('${1:month}', ${2:date}) ", 68),
    template('date_part', 'Extract a date part', 'function', "date_part('${1:year}', ${2:date}) ", 68),
    template('current_date', 'Current date literal', 'function', 'current_date', 66),
    template('current_timestamp', 'Current timestamp literal', 'function', 'current_timestamp', 66),
    template('unnest', 'Expand a list column into rows', 'function', 'unnest(${1:list}) ', 68),
    template('struct_pack', 'Pack values into a struct', 'function', 'struct_pack(${1:key} := ${2:value}) ', 66),
    template('list_transform', 'Transform a list element-wise', 'function', 'list_transform(${1:list}, value -> ${2:expression}) ', 66),
    template('list_filter', 'Filter a list element-wise', 'function', 'list_filter(${1:list}, value -> ${2:condition}) ', 66),
    template('read_csv_auto', 'Read a CSV file', 'function', "read_csv_auto('${1:file.csv})')", 66),
    template('read_parquet', 'Read a Parquet file', 'function', "read_parquet('${1:file.parquet}')", 66),
    template('read_json_auto', 'Read a JSON file', 'function', "read_json_auto('${1:file.json}')", 66),
    template('generate_series', 'Generate a sequence of numbers', 'function', 'generate_series(${1:first}, ${2:last}) ', 64),
  ],
};

export function getStaticCompletionCatalog(language: string): StaticCompletionCatalog {
  const normalized = (language || 'python').toLowerCase();
  if (normalized === 'r') return rCatalog;
  if (normalized === 'shell' || normalized === 'bash' || normalized === 'sh' || normalized === 'zsh') return shellCatalog;
  if (normalized === 'sql') return sqlCatalog;
  return pythonCatalog;
}

export function templateToCompletion(entry: CompletionSnippetTemplate): Completion {
  return {
    label: entry.label,
    type: entry.category,
    detail: entry.detail,
    info: () => renderCompletionInfo(entry),
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
  if (entry.documentation?.synopsis) {
    const synopsis = document.createElement('div');
    synopsis.className = 'dcl-completion-info-synopsis';
    synopsis.textContent = entry.documentation.synopsis;
    container.appendChild(synopsis);
  }
  const signature = entry.documentation?.signature || entry.detail;
  if (signature) {
    const signatureElement = document.createElement('code');
    signatureElement.className = 'dcl-completion-info-signature';
    signatureElement.textContent = signature;
    container.appendChild(signatureElement);
  }
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
  if (entry.documentation?.returns) {
    const returnsElement = document.createElement('div');
    returnsElement.className = 'dcl-completion-info-returns';
    returnsElement.textContent = `Returns: ${entry.documentation.returns}`;
    container.appendChild(returnsElement);
  }
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

  if (normalizedLanguage === 'python') {
    for (const line of lines) {
      const funcMatch = line.match(/^\s*(?:def|async\s+def)\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/);
      if (funcMatch) {
        add(funcMatch[1], 'function', `(${funcMatch[2].trim()})`, 89);
        continue;
      }
      const classMatch = line.match(/^\s*class\s+([a-zA-Z_]\w*)/);
      if (classMatch) {
        add(classMatch[1], 'class', 'class', 89);
        continue;
      }
      const importAsMatch = line.match(/^\s*import\s+[\w.]+\s+as\s+([a-zA-Z_]\w*)/);
      if (importAsMatch) {
        add(importAsMatch[1], 'module', 'module', 86);
        continue;
      }
      const fromImportMatch = line.match(/^\s*from\s+[\w.]+\s+import\s+([^#\n]+)/);
      if (fromImportMatch) {
        const imports = fromImportMatch[1].split(',');
        for (const item of imports) {
          const parts = item.trim().split(/\s+as\s+/);
          const alias = parts[parts.length - 1].trim();
          if (alias) add(alias, 'variable', 'imported', 86);
        }
        continue;
      }
      const assignMatch = line.match(/^\s*([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)\s*(?::\s*[^=]+)?\s*=(?!=)/);
      if (assignMatch) {
        const names = assignMatch[1].split(',');
        for (const n of names) {
          const trimmed = n.trim();
          if (trimmed) add(trimmed, 'variable', 'variable', 87);
        }
        continue;
      }
    }
  } else if (normalizedLanguage === 'r') {
    for (const line of lines) {
      const funcMatch = line.match(/^\s*([a-zA-Z.][a-zA-Z0-9._]*)\s*(?:<-|=)\s*function\s*\(([^)]*)\)/);
      if (funcMatch) {
        add(funcMatch[1], 'function', `(${funcMatch[2].trim()})`, 89);
        continue;
      }
      const assignMatch = line.match(/^\s*([a-zA-Z.][a-zA-Z0-9._]*)\s*(?:<-|=)(?!=)/);
      if (assignMatch) {
        add(assignMatch[1], 'variable', 'variable', 87);
        continue;
      }
    }
  } else if (normalizedLanguage === 'shell') {
    for (const line of lines) {
      const varMatch = line.match(/^\s*([a-zA-Z_]\w*)=/);
      if (varMatch) {
        add(varMatch[1], 'variable', 'environment variable', 87);
        continue;
      }
      const funcMatch = line.match(/^\s*(?:function\s+)?([a-zA-Z_]\w*)\s*\(\)\s*\{/);
      if (funcMatch) {
        add(funcMatch[1], 'function', 'function', 89);
        continue;
      }
    }
  } else if (normalizedLanguage === 'sql') {
    for (const line of lines) {
      const tableMatch = line.match(/(?:CREATE\s+TABLE|CREATE\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_]\w*)/i);
      if (tableMatch) {
        add(tableMatch[1], 'property', 'table', 88);
        continue;
      }
      const cteMatch = line.match(/WITH\s+([a-zA-Z_]\w*)\s+AS/i);
      if (cteMatch) {
        add(cteMatch[1], 'property', 'CTE', 88);
        continue;
      }
    }
  }

  return templates;
}

const pythonStaticMembers: Record<string, CompletionSnippetTemplate[]> = {
  plt: [
    template('plot', 'Plot lines or markers', 'function', 'plot(${1:x}, ${2:y})', 95, documentation('matplotlib.pyplot.plot: plot lines and/or markers.', { signature: 'plt.plot(x, y, [fmt], **kwargs)' })),
    template('scatter', 'Scatter plot', 'function', 'scatter(${1:x}, ${2:y})', 95, documentation('matplotlib.pyplot.scatter: scatter plot.', { signature: 'plt.scatter(x, y, s=None, c=None, marker=None)' })),
    template('hist', 'Histogram of values', 'function', 'hist(${1:x}, bins=${2:10})', 95, documentation('matplotlib.pyplot.hist: compute and draw histogram.', { signature: 'plt.hist(x, bins=None, range=None, density=False)' })),
    template('bar', 'Vertical bar plot', 'function', 'bar(${1:x}, ${2:height})', 94, documentation('matplotlib.pyplot.bar: make a bar plot.', { signature: 'plt.bar(x, height, width=0.8, bottom=None)' })),
    template('barh', 'Horizontal bar plot', 'function', 'barh(${1:y}, ${2:width})', 94),
    template('boxplot', 'Box and whisker plot', 'function', 'boxplot(${1:x})', 94),
    template('title', 'Set plot title', 'function', 'title(${1:label})', 95, documentation('matplotlib.pyplot.title: set a title for the axes.', { signature: 'plt.title(label, fontdict=None, loc=None)' })),
    template('xlabel', 'Set x-axis label', 'function', 'xlabel(${1:xlabel})', 95, documentation('matplotlib.pyplot.xlabel: set the label for the x-axis.', { signature: 'plt.xlabel(xlabel, fontdict=None, labelpad=None)' })),
    template('ylabel', 'Set y-axis label', 'function', 'ylabel(${1:ylabel})', 95, documentation('matplotlib.pyplot.ylabel: set the label for the y-axis.', { signature: 'plt.ylabel(ylabel, fontdict=None, labelpad=None)' })),
    template('legend', 'Place a legend on the axes', 'function', 'legend()', 95, documentation('matplotlib.pyplot.legend: place a legend on the axes.', { signature: 'plt.legend(*args, **kwargs)' })),
    template('show', 'Display all open figures', 'function', 'show()', 96, documentation('matplotlib.pyplot.show: display all open figures.', { signature: 'plt.show()' })),
    template('figure', 'Create a new figure', 'function', 'figure(figsize=(${1:8}, ${2:6}))', 95, documentation('matplotlib.pyplot.figure: create a new figure.', { signature: 'plt.figure(num=None, figsize=None, dpi=None)' })),
    template('subplot', 'Add a subplot to the figure', 'function', 'subplot(${1:nrows}, ${2:ncols}, ${3:index})', 94),
    template('subplots', 'Create a figure and grid of subplots', 'function', 'subplots(${1:nrows}=1, ${2:ncols}=1)', 95),
    template('grid', 'Configure grid lines', 'function', 'grid(${1:visible}=True)', 93),
    template('xlim', 'Get or set x-limits of current axes', 'function', 'xlim(${1:left}, ${2:right})', 92),
    template('ylim', 'Get or set y-limits of current axes', 'function', 'ylim(${1:bottom}, ${2:top})', 92),
    template('savefig', 'Save the current figure', 'function', 'savefig(${1:filename})', 93),
    template('clf', 'Clear current figure', 'function', 'clf()', 91),
    template('close', 'Close figure window', 'function', 'close()', 91),
    template('tight_layout', 'Adjust padding between subplots', 'function', 'tight_layout()', 93),
    template('xticks', 'Get or set current tick locations on x-axis', 'function', 'xticks(${1:ticks}=None, ${2:labels}=None)', 92),
    template('yticks', 'Get or set current tick locations on y-axis', 'function', 'yticks(${1:ticks}=None, ${2:labels}=None)', 92),
    template('axhline', 'Add a horizontal line across the axis', 'function', 'axhline(y=${1:0}, color=${2:"r"})', 91),
    template('axvline', 'Add a vertical line across the axis', 'function', 'axvline(x=${1:0}, color=${2:"r"})', 91),
  ],
  np: [
    template('array', 'Create a NumPy array', 'function', 'array(${1:object})', 96, documentation('numpy.array: create an array.', { signature: 'np.array(object, dtype=None, copy=True)' })),
    template('zeros', 'Return a new array filled with zeros', 'function', 'zeros(${1:shape})', 95, documentation('numpy.zeros: return a new array of given shape and type, filled with zeros.', { signature: 'np.zeros(shape, dtype=float)' })),
    template('ones', 'Return a new array filled with ones', 'function', 'ones(${1:shape})', 95, documentation('numpy.ones: return a new array of given shape and type, filled with ones.', { signature: 'np.ones(shape, dtype=float)' })),
    template('empty', 'Return a new array without initializing entries', 'function', 'empty(${1:shape})', 93),
    template('arange', 'Return evenly spaced values within a given interval', 'function', 'arange(${1:start}, ${2:stop}, ${3:step})', 95, documentation('numpy.arange: return evenly spaced values within a given interval.', { signature: 'np.arange([start, ]stop[, step, ])' })),
    template('linspace', 'Return evenly spaced numbers over a specified interval', 'function', 'linspace(${1:start}, ${2:stop}, ${3:num}=50)', 95, documentation('numpy.linspace: return evenly spaced numbers over a specified interval.', { signature: 'np.linspace(start, stop, num=50)' })),
    template('mean', 'Compute the arithmetic mean along the specified axis', 'function', 'mean(${1:a})', 95),
    template('std', 'Compute the standard deviation along the specified axis', 'function', 'std(${1:a})', 95),
    template('var', 'Compute the variance along the specified axis', 'function', 'var(${1:a})', 94),
    template('median', 'Compute the median along the specified axis', 'function', 'median(${1:a})', 94),
    template('sum', 'Sum of array elements over a given axis', 'function', 'sum(${1:a})', 95),
    template('min', 'Return the minimum of an array or minimum along an axis', 'function', 'min(${1:a})', 95),
    template('max', 'Return the maximum of an array or maximum along an axis', 'function', 'max(${1:a})', 95),
    template('dot', 'Dot product of two arrays', 'function', 'dot(${1:a}, ${2:b})', 95),
    template('matmul', 'Matrix product of two arrays', 'function', 'matmul(${1:x1}, ${2:x2})', 94),
    template('where', 'Return elements chosen from x or y depending on condition', 'function', 'where(${1:condition}, ${2:x}, ${3:y})', 95),
    template('concatenate', 'Join a sequence of arrays along an existing axis', 'function', 'concatenate((${1:arrays}), axis=${2:0})', 94),
    template('vstack', 'Stack arrays in sequence vertically (row wise)', 'function', 'vstack((${1:tup}))', 93),
    template('hstack', 'Stack arrays in sequence horizontally (column wise)', 'function', 'hstack((${1:tup}))', 93),
    template('reshape', 'Gives a new shape to an array without changing its data', 'function', 'reshape(${1:a}, ${2:newshape})', 94),
    template('transpose', 'Reverse or permute the axes of an array', 'function', 'transpose(${1:a})', 93),
    template('random', 'Random sampling sub-module', 'module', 'random', 94),
    template('linalg', 'Linear algebra sub-module', 'module', 'linalg', 93),
    template('unique', 'Find the unique elements of an array', 'function', 'unique(${1:ar})', 93),
    template('isnan', 'Test element-wise for NaN and return result as a boolean array', 'function', 'isnan(${1:x})', 93),
  ],
  pd: [
    template('DataFrame', 'Two-dimensional tabular data structure', 'class', 'DataFrame(${1:data})', 96, documentation('pandas.DataFrame: two-dimensional, size-mutable, potentially heterogeneous tabular data.', { signature: 'pd.DataFrame(data=None, index=None, columns=None)' })),
    template('Series', 'One-dimensional labeled array', 'class', 'Series(${1:data})', 95, documentation('pandas.Series: one-dimensional ndarray with axis labels.', { signature: 'pd.Series(data=None, index=None, dtype=None)' })),
    template('read_csv', 'Read a comma-separated values (csv) file into DataFrame', 'function', 'read_csv(${1:filepath_or_buffer})', 96, documentation('pandas.read_csv: read a CSV file into DataFrame.', { signature: "pd.read_csv(filepath_or_buffer, sep=',')" })),
    template('read_parquet', 'Load a parquet object from the file path, returning a DataFrame', 'function', 'read_parquet(${1:path})', 95),
    template('read_excel', 'Read an Excel file into a pandas DataFrame', 'function', 'read_excel(${1:io})', 94),
    template('read_json', 'Convert a JSON string to pandas object', 'function', 'read_json(${1:path_or_buf})', 94),
    template('concat', 'Concatenate pandas objects along a particular axis', 'function', 'concat([${1:objs}], axis=${2:0})', 95),
    template('merge', 'Merge DataFrame or named Series objects with a database-style join', 'function', 'merge(${1:left}, ${2:right}, on=${3:None}, how=${4:"inner"})', 95),
    template('to_datetime', 'Convert argument to datetime', 'function', 'to_datetime(${1:arg})', 95),
    template('isna', 'Detect missing values for an array-like object', 'function', 'isna(${1:obj})', 94),
    template('notna', 'Detect non-missing values for an array-like object', 'function', 'notna(${1:obj})', 94),
    template('get_dummies', 'Convert categorical variable into dummy/indicator variables', 'function', 'get_dummies(${1:data})', 94),
    template('date_range', 'Return a fixed frequency DatetimeIndex', 'function', 'date_range(start=${1:start}, end=${2:end}, freq=${3:"D"})', 93),
  ],
  df: [
    template('head', 'Return the first n rows', 'function', 'head(${1:n}=5)', 96, documentation('DataFrame.head: return the first n rows.', { signature: 'df.head(n=5)' })),
    template('tail', 'Return the last n rows', 'function', 'tail(${1:n}=5)', 96, documentation('DataFrame.tail: return the last n rows.', { signature: 'df.tail(n=5)' })),
    template('describe', 'Generate descriptive statistics', 'function', 'describe()', 95),
    template('info', 'Print a concise summary of a DataFrame', 'function', 'info()', 95),
    template('shape', 'Return a tuple representing the dimensionality of the DataFrame', 'property', 'shape', 95),
    template('columns', 'The column labels of the DataFrame', 'property', 'columns', 95),
    template('index', 'The index (row labels) of the DataFrame', 'property', 'index', 94),
    template('dtypes', 'Return the dtypes in the DataFrame', 'property', 'dtypes', 94),
    template('values', 'Return a Numpy representation of the DataFrame', 'property', 'values', 93),
    template('groupby', 'Group DataFrame using a mapper or by a Series of columns', 'function', 'groupby(${1:by})', 95),
    template('dropna', 'Remove missing values', 'function', 'dropna(axis=${1:0})', 95),
    template('fillna', 'Fill NA/NaN values using the specified method', 'function', 'fillna(${1:value})', 95),
    template('drop', 'Drop specified labels from rows or columns', 'function', 'drop(columns=[${1:cols}])', 94),
    template('rename', 'Alter axes labels', 'function', 'rename(columns={${1:mapping}})', 94),
    template('reset_index', 'Reset the index of the DataFrame', 'function', 'reset_index(drop=${1:False})', 94),
    template('set_index', 'Set the DataFrame index using existing columns', 'function', 'set_index(${1:keys})', 94),
    template('sort_values', 'Sort by the values along either axis', 'function', 'sort_values(by=${1:by}, ascending=${2:True})', 95),
    template('apply', 'Apply a function along an axis of the DataFrame', 'function', 'apply(${1:func})', 94),
    template('value_counts', 'Return a Series containing counts of unique rows in the DataFrame', 'function', 'value_counts()', 94),
    template('copy', 'Make a copy of this object indices and data', 'function', 'copy()', 93),
    template('to_csv', 'Write object to a comma-separated values (csv) file', 'function', 'to_csv(${1:path_or_buf})', 94),
    template('plot', 'Make plots of Series or DataFrame', 'function', 'plot(kind=${1:"line"})', 94),
    template('corr', 'Compute pairwise correlation of columns', 'function', 'corr()', 93),
  ],
  sns: [
    template('lineplot', 'Draw a line plot with possibility of several semantic groupings', 'function', 'lineplot(data=${1:data}, x=${2:x}, y=${3:y})', 95),
    template('barplot', 'Show point estimates and errors as rectangular bars', 'function', 'barplot(data=${1:data}, x=${2:x}, y=${3:y})', 95),
    template('scatterplot', 'Draw a scatter plot with possibility of several semantic groupings', 'function', 'scatterplot(data=${1:data}, x=${2:x}, y=${3:y})', 95),
    template('histplot', 'Plot univariate or bivariate histograms', 'function', 'histplot(data=${1:data}, x=${2:x})', 95),
    template('boxplot', 'Draw a box plot to show distributions with respect to categories', 'function', 'boxplot(data=${1:data}, x=${2:x}, y=${3:y})', 95),
    template('heatmap', 'Plot rectangular data as a color-encoded matrix', 'function', 'heatmap(${1:data}, annot=${2:True})', 95),
    template('pairplot', 'Plot pairwise relationships in a dataset', 'function', 'pairplot(${1:data})', 94),
    template('set_theme', 'Set the visual theme for matplotlib and seaborn plots', 'function', 'set_theme()', 94),
    template('despine', 'Remove the top and right spines from plot(s)', 'function', 'despine()', 93),
  ],
};

pythonStaticMembers.pyplot = pythonStaticMembers.plt;
pythonStaticMembers.numpy = pythonStaticMembers.np;
pythonStaticMembers.pandas = pythonStaticMembers.pd;
pythonStaticMembers.data = pythonStaticMembers.df;

export function getStaticMemberCompletions(
  targetObject: string,
  language: string,
): CompletionSnippetTemplate[] {
  if (!targetObject) return [];
  const normalizedLanguage = (language || 'python').toLowerCase();
  const normalizedTarget = targetObject.toLowerCase();

  if (normalizedLanguage === 'python') {
    return pythonStaticMembers[normalizedTarget] || [];
  }
  return [];
}

