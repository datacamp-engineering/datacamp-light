import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGlobalThemeOverride,
  getSystemTheme,
  resolveTheme,
  setGlobalThemeOverride,
  subscribeToThemeChanges,
  toggleGlobalTheme,
} from './themeManager';

describe('themeManager', () => {
  beforeEach(() => {
    clearGlobalThemeOverride();
  });

  it('resolves explicit prop theme when no global override is set', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves system theme when no prop and no global override is set', () => {
    const systemTheme = getSystemTheme();
    expect(resolveTheme(undefined)).toBe(systemTheme);
  });

  it('user override supersedes explicit prop theme and system theme', () => {
    setGlobalThemeOverride('light');
    expect(resolveTheme('dark')).toBe('light');
    expect(resolveTheme(undefined)).toBe('light');

    setGlobalThemeOverride('dark');
    expect(resolveTheme('light')).toBe('dark');
    expect(resolveTheme(undefined)).toBe('dark');
  });

  it('toggleGlobalTheme flips the resolved theme and notifies subscribers', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeToThemeChanges(subscriber);

    setGlobalThemeOverride('dark');
    subscriber.mockClear();

    toggleGlobalTheme('dark');
    expect(resolveTheme()).toBe('light');
    expect(subscriber).toHaveBeenCalled();

    toggleGlobalTheme('light');
    expect(resolveTheme()).toBe('dark');

    unsubscribe();
  });

  it('notifies subscribers on theme changes and stops after unsubscribe', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeToThemeChanges(subscriber);

    setGlobalThemeOverride('light');
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
    setGlobalThemeOverride('dark');
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});
