import config from '../config';

export const EXPLAIN_CODE_MODEL_TAG = 'learn-by-example-explain-code';
export const FIX_AND_EXPLAIN_MODEL_TAG = 'learn-by-example-fix-and-explain';
export const FIX_AND_EXPLAIN_DELIMITER = '@@@@@@@@@@';

export const isDevelopmentEnvironment = config.env === 'development';

export type MockAiMode = 'stream' | 'signed-out' | 'third-party' | 'disabled';

declare global {
  interface Window {
    DCL_MOCK_AI?: boolean | MockAiMode;
  }
}

export function getMockAiMode(mockAiProp?: boolean | string): MockAiMode | null {
  if (!isDevelopmentEnvironment) {
    return null;
  }

  if (typeof mockAiProp === 'string') {
    const normalized = mockAiProp.toLowerCase();
    if (
      normalized === 'signed-out' ||
      normalized === 'third-party' ||
      normalized === 'stream'
    ) {
      return normalized;
    }
    if (normalized === 'true') {
      return 'stream';
    }
    if (normalized === 'false') {
      return 'disabled';
    }
  } else if (mockAiProp === true) {
    return 'stream';
  } else if (mockAiProp === false) {
    return 'disabled';
  }

  if (typeof window !== 'undefined' && window.DCL_MOCK_AI !== undefined) {
    const globalMode = window.DCL_MOCK_AI;
    if (globalMode === true) return 'stream';
    if (globalMode === false) return 'disabled';
    if (typeof globalMode === 'string') {
      const normalized = globalMode.toLowerCase();
      if (
        normalized === 'signed-out' ||
        normalized === 'third-party' ||
        normalized === 'stream'
      ) {
        return normalized;
      }
    }
  }

  return null;
}

export function isMockAiEnabled(mockAiProp?: boolean | string): boolean {
  const mode = getMockAiMode(mockAiProp);
  return mode === 'stream';
}

export function isFirstPartyDomain(mockAiProp?: boolean | string): boolean {
  const mode = getMockAiMode(mockAiProp);
  if (mode === 'third-party') {
    return false;
  }
  if (mode === 'stream' || mode === 'signed-out') {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.datacamp.com') ||
    hostname.endsWith('.datacamp-staging.com') ||
    hostname === 'datacamp.com' ||
    hostname === 'datacamp-staging.com'
  );
}

export function isStagingEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.location.hostname.includes('staging');
}

export function getAiApiBaseUrl(): string {
  return isStagingEnvironment()
    ? 'https://ai-api.datacamp-staging.com'
    : 'https://ai-api.datacamp.com';
}

export function getMainAppBaseUrl(): string {
  return isStagingEnvironment()
    ? 'https://www.datacamp-staging.com'
    : 'https://www.datacamp.com';
}
