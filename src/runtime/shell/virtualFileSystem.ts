import { resolveVfsPath } from '../shellPathUtils.ts';

export interface IShellVfsStat {
  size: number;
  mtime: Date;
  isDir: boolean;
}

/**
 * Unified in-memory Virtual File System (VFS) interface.
 * Implemented by both pure-JS dictionary and Emscripten MEMFS.
 */
export interface IShellVfs {
  cwd(): string;
  chdir(path: string): void;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  mkdir(path: string): void;
  rmdir(path: string): void;
  unlink(path: string): void;
  exists(path: string): boolean;
  isDir(path: string): boolean;
  readdir(path: string): string[];
  stat?(path: string): IShellVfsStat;
}

/**
 * Default pure-JS in-memory VFS implementation.
 */
export function createMemoryVfs(): IShellVfs {
  let currentWorkingDirectory = '/home/repl';
  const files: Record<string, { type: 'file' | 'dir'; content?: string }> = {
    '/home': { type: 'dir' },
    '/home/repl': { type: 'dir' },
    '/tmp': { type: 'dir' },
  };

  const resolve = (path: string) => resolveVfsPath(path, currentWorkingDirectory);

  return {
    cwd: () => currentWorkingDirectory,
    chdir: (path: string) => {
      const target = resolve(path);
      if (files[target] && files[target].type === 'dir') {
        currentWorkingDirectory = target;
        return;
      }
      throw new Error('no such file or directory: ' + path);
    },
    readFile: (path: string) => {
      const target = resolve(path);
      const entry = files[target];
      if (!entry || entry.type !== 'file') {
        throw new Error(path + ': No such file or directory');
      }
      return entry.content || '';
    },
    writeFile: (path: string, content: string) => {
      const target = resolve(path);
      files[target] = { type: 'file', content: content || '' };
    },
    mkdir: (path: string) => {
      const target = resolve(path);
      files[target] = { type: 'dir' };
    },
    rmdir: (path: string) => {
      const target = resolve(path);
      if (!files[target] || files[target].type !== 'dir') {
        throw new Error(path + ': No such file or directory');
      }
      delete files[target];
    },
    unlink: (path: string) => {
      const target = resolve(path);
      if (!files[target]) {
        throw new Error(path + ': No such file or directory');
      }
      delete files[target];
    },
    exists: (path: string) => Boolean(files[resolve(path)]),
    isDir: (path: string) => files[resolve(path)]?.type === 'dir',
    stat: (path: string) => {
      const target = resolve(path);
      const entry = files[target];
      if (!entry) throw new Error('no such file or directory: ' + path);
      return {
        size: entry.type === 'dir' ? 4096 : (entry.content?.length || 0),
        mtime: new Date(),
        isDir: entry.type === 'dir',
      };
    },
    readdir: (path: string) => {
      const target = resolve(path);
      const prefix = target === '/' ? '/' : target + '/';
      const entries = new Set<string>();
      for (const key of Object.keys(files)) {
        if (key === target) continue;
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const name = rest.split('/')[0];
          if (name) entries.add(name);
        }
      }
      return Array.from(entries).sort();
    },
  };
}

/**
 * Emscripten MEMFS VFS adapter implementing IShellVfs.
 */
export function createEmscriptenVfs(emscriptenModule: any): IShellVfs {
  const resolve = (path: string) => resolveVfsPath(path, emscriptenModule.FS.cwd());

  return {
    cwd: () => emscriptenModule.FS.cwd(),
    chdir: (path: string) => {
      const target = resolve(path);
      emscriptenModule.FS.chdir(target);
    },
    readFile: (path: string) => {
      const target = resolve(path);
      return emscriptenModule.FS.readFile(target, { encoding: 'utf8' });
    },
    writeFile: (path: string, content: string) => {
      const target = resolve(path);
      emscriptenModule.FS.writeFile(target, content || '');
    },
    mkdir: (path: string) => {
      const target = resolve(path);
      emscriptenModule.FS.mkdir(target);
    },
    rmdir: (path: string) => {
      const target = resolve(path);
      emscriptenModule.FS.rmdir(target);
    },
    unlink: (path: string) => {
      const target = resolve(path);
      emscriptenModule.FS.unlink(target);
    },
    exists: (path: string) => {
      try {
        const target = resolve(path);
        return emscriptenModule.FS.analyzePath(target).exists;
      } catch {
        return false;
      }
    },
    isDir: (path: string) => {
      try {
        const target = resolve(path);
        const statResult = emscriptenModule.FS.stat(target);
        return emscriptenModule.FS.isDir(statResult.mode);
      } catch {
        return false;
      }
    },
    stat: (path: string) => {
      const target = resolve(path);
      const statResult = emscriptenModule.FS.stat(target);
      return {
        size: statResult.size || (emscriptenModule.FS.isDir(statResult.mode) ? 4096 : 0),
        mtime: statResult.mtime ? new Date(statResult.mtime) : new Date(),
        isDir: emscriptenModule.FS.isDir(statResult.mode),
      };
    },
    readdir: (path: string) => {
      const target = resolve(path);
      const entries = emscriptenModule.FS.readdir(target);
      return entries.filter((name: string) => name !== '.' && name !== '..').sort();
    },
  };
}
