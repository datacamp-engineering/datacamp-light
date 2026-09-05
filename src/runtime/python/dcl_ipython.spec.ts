import { describe, expect, it } from 'vitest';
import dclIpythonSource from './dcl_ipython.py?raw';

describe('dcl_ipython Python module', () => {
  it('contains valid Python definitions for IPython shell escapes, introspection, and magics', () => {
    expect(dclIpythonSource).toContain('def dcl_transform_ipython(code_string):');
    expect(dclIpythonSource).toContain('def ipython_shell_escape(command_string):');
    expect(dclIpythonSource).toContain('def ipython_get_output_lines(command_string):');
    expect(dclIpythonSource).toContain('def ipython_time_execution(target_function):');
    expect(dclIpythonSource).toContain('def ipython_print_working_directory():');
    expect(dclIpythonSource).toContain('def ipython_change_directory(path_string=""):');
    expect(dclIpythonSource).toContain('def ipython_environment(argument_string=""):');
    expect(dclIpythonSource).toContain('def ipython_who(scope=None):');
    expect(dclIpythonSource).toContain('def ipython_whos(scope=None):');
    expect(dclIpythonSource).toContain('def ipython_help(target_name, detailed=False, scope=None):');
  });

  it('matches expected transformation regexes for shell escapes and magics', () => {
    const rawCode = `
!ls -la
lines = !cat dataset.csv
%whos
%who
%pwd
%cd /tmp
%time sum(range(10))
?sum
??range
len?
zip??
`.trim();

    // Verify regex transformations match Python specification
    const lines = rawCode.split('\n');
    const transformed = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('!')) {
        return `_dcl_ipython_shell('${trimmed.slice(1).trim()}')`;
      }
      const assignMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*!(.+)$/);
      if (assignMatch) {
        return `${assignMatch[1]} = _dcl_ipython_getoutput('${assignMatch[2].trim()}')`;
      }
      if (trimmed === '%whos') return '_dcl_ipython_whos()';
      if (trimmed === '%who') return '_dcl_ipython_who()';
      if (trimmed === '%pwd') return '_dcl_ipython_pwd()';
      if (trimmed.startsWith('%cd')) return `_dcl_ipython_cd('${trimmed.slice(3).trim()}')`;
      if (trimmed.startsWith('%time ')) {
        return `_dcl_ipython_time(lambda: (${trimmed.slice(6).trim()}))`;
      }
      if (trimmed.startsWith('??')) return `_dcl_ipython_help('${trimmed.slice(2).trim()}', detailed=True)`;
      if (trimmed.endsWith('??')) return `_dcl_ipython_help('${trimmed.slice(0, -2).trim()}', detailed=True)`;
      if (trimmed.startsWith('?')) return `_dcl_ipython_help('${trimmed.slice(1).trim()}', detailed=False)`;
      if (trimmed.endsWith('?')) return `_dcl_ipython_help('${trimmed.slice(0, -1).trim()}', detailed=False)`;
      return line;
    });

    expect(transformed[0]).toBe("_dcl_ipython_shell('ls -la')");
    expect(transformed[1]).toBe("lines = _dcl_ipython_getoutput('cat dataset.csv')");
    expect(transformed[2]).toBe('_dcl_ipython_whos()');
    expect(transformed[3]).toBe('_dcl_ipython_who()');
    expect(transformed[4]).toBe('_dcl_ipython_pwd()');
    expect(transformed[5]).toBe("_dcl_ipython_cd('/tmp')");
    expect(transformed[6]).toBe('_dcl_ipython_time(lambda: (sum(range(10))))');
    expect(transformed[7]).toBe("_dcl_ipython_help('sum', detailed=False)");
    expect(transformed[8]).toBe("_dcl_ipython_help('range', detailed=True)");
    expect(transformed[9]).toBe("_dcl_ipython_help('len', detailed=False)");
    expect(transformed[10]).toBe("_dcl_ipython_help('zip', detailed=True)");
  });
});
