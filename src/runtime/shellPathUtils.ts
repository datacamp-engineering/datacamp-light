/**
 * Virtual File System (VFS) path manipulation utilities for Shell execution.
 */

/**
 * Canonicalizes a POSIX path by collapsing duplicate slashes and resolving `.` and `..`.
 */
export function normalizeVfsPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return '/' + stack.join('/');
}

/**
 * Resolves a given path relative to the current working directory, expanding `~` to `/home/repl`.
 */
export function resolveVfsPath(path: string, currentWorkingDirectory: string = '/home/repl'): string {
  if (!path) return currentWorkingDirectory;
  if (path === '~' || path.startsWith('~/')) {
    return normalizeVfsPath(path.replace(/^~/, '/home/repl'));
  }
  if (path.startsWith('/')) return normalizeVfsPath(path);
  const base = currentWorkingDirectory === '/' ? '' : currentWorkingDirectory;
  return normalizeVfsPath(base + '/' + path);
}
