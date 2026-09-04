import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'datacamp-light-theme-override';

let userOverrideTheme: ThemeMode | null = null;
const subscribers = new Set<() => void>();

function initializeThemeFromStorage(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedTheme = window.localStorage.getItem(STORAGE_KEY);
      if (storedTheme === 'light' || storedTheme === 'dark') {
        userOverrideTheme = storedTheme;
      }
    }
  } catch {
    // Ignore localStorage access failures (e.g. sandboxed iframes)
  }
}

initializeThemeFromStorage();

export function getSystemTheme(): ThemeMode {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function getUserOverrideTheme(): ThemeMode | null {
  return userOverrideTheme;
}

export function resolveTheme(propTheme?: ThemeMode): ThemeMode {
  if (userOverrideTheme !== null) {
    return userOverrideTheme;
  }
  if (propTheme === 'light' || propTheme === 'dark') {
    return propTheme;
  }
  return getSystemTheme();
}

function notifySubscribers(): void {
  for (const subscriber of subscribers) {
    try {
      subscriber();
    } catch (subscriberError) {
      console.warn('Theme subscriber notification error:', subscriberError);
    }
  }
}

export function setGlobalThemeOverride(newTheme: ThemeMode): void {
  userOverrideTheme = newTheme;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, newTheme);
    }
  } catch {
    // Ignore storage errors
  }
  notifySubscribers();
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('datacamp-light:theme-change', { detail: newTheme }),
    );
  }
}

export function clearGlobalThemeOverride(): void {
  userOverrideTheme = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  notifySubscribers();
}

export function toggleGlobalTheme(currentPropTheme?: ThemeMode): void {
  const currentTheme = resolveTheme(currentPropTheme);
  const nextTheme: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark';
  setGlobalThemeOverride(nextTheme);
}

export function subscribeToThemeChanges(callback: () => void): () => void {
  subscribers.add(callback);

  let mediaQueryList: MediaQueryList | null = null;
  const handleMediaChange = () => {
    if (userOverrideTheme === null) {
      callback();
    }
  };

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleMediaChange);
    } else if (typeof (mediaQueryList as any).addListener === 'function') {
      (mediaQueryList as any).addListener(handleMediaChange);
    }
  }

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      if (event.newValue === 'light' || event.newValue === 'dark') {
        userOverrideTheme = event.newValue;
      } else if (event.newValue === null) {
        userOverrideTheme = null;
      }
      callback();
    }
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', handleStorageEvent);
  }

  return () => {
    subscribers.delete(callback);
    if (mediaQueryList) {
      if (typeof mediaQueryList.removeEventListener === 'function') {
        mediaQueryList.removeEventListener('change', handleMediaChange);
      } else if (typeof (mediaQueryList as any).removeListener === 'function') {
        (mediaQueryList as any).removeListener(handleMediaChange);
      }
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

export function useResolvedTheme(propTheme?: ThemeMode): {
  theme: ThemeMode;
  toggleTheme: () => void;
} {
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>(() =>
    resolveTheme(propTheme),
  );

  useEffect(() => {
    const updateTheme = () => {
      setResolvedTheme(resolveTheme(propTheme));
    };

    updateTheme();
    const unsubscribe = subscribeToThemeChanges(updateTheme);
    return unsubscribe;
  }, [propTheme]);

  const toggleTheme = useCallback(() => {
    toggleGlobalTheme(propTheme);
  }, [propTheme]);

  return { theme: resolvedTheme, toggleTheme };
}
