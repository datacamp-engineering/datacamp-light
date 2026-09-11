import { describe, expect, it } from 'vitest';
import dclShellBridgeSource from './dcl_shell_bridge.py?raw';

describe('dcl_shell_bridge Python module', () => {
  it('contains valid Python definitions for os.system, subprocess, and dynamic stdin queue', () => {
    expect(dclShellBridgeSource).toContain('def execute_shell_command(command_string):');
    expect(dclShellBridgeSource).toContain('def custom_os_system(command_string):');
    expect(dclShellBridgeSource).toContain('class CompletedProcess:');
    expect(dclShellBridgeSource).toContain('def custom_subprocess_run(');
    expect(dclShellBridgeSource).toContain('def custom_subprocess_check_output(');
    expect(dclShellBridgeSource).toContain('def custom_subprocess_getoutput(');
    expect(dclShellBridgeSource).toContain('def set_standard_input(lines=None):');
    expect(dclShellBridgeSource).toContain('def safe_input(prompt=""):');
  });

  it('hooks standard library modules on import', () => {
    expect(dclShellBridgeSource).toContain('os.system = custom_os_system');
    expect(dclShellBridgeSource).toContain('subprocess.run = custom_subprocess_run');
    expect(dclShellBridgeSource).toContain('subprocess.check_output = custom_subprocess_check_output');
    expect(dclShellBridgeSource).toContain('subprocess.getoutput = custom_subprocess_getoutput');
    expect(dclShellBridgeSource).toContain('builtins.input = safe_input');
    expect(dclShellBridgeSource).toContain('builtins._dcl_set_stdin = set_standard_input');
  });

  it('preserves bytes vs string standard library return types for subprocess', () => {
    // Verifies text is not implicitly forced on check_output/run preventing matplotlib TypeError
    expect(dclShellBridgeSource).toContain('is_text = bool(text or universal_newlines or encoding)');
    expect(dclShellBridgeSource).not.toContain('kwargs["text"] = True');
    expect(dclShellBridgeSource).toContain('return completed_process.stdout');
  });
});
