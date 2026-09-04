export const EXPLAIN_CODE_MODEL_TAG = 'learn-by-example-explain-code';
export const FIX_AND_EXPLAIN_MODEL_TAG = 'learn-by-example-fix-and-explain';
export const FIX_AND_EXPLAIN_DELIMITER = '@@@@@@@@@@';

declare global {
  interface Window {
    DCL_MOCK_AI?: boolean;
  }
}

export function isMockAiEnabled(mockAiProp?: boolean): boolean {
  if (mockAiProp === true) {
    return true;
  }
  if (typeof window !== 'undefined' && window.DCL_MOCK_AI === true) {
    return true;
  }
  return false;
}

export function isFirstPartyDomain(mockAiProp?: boolean): boolean {
  if (isMockAiEnabled(mockAiProp)) {
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
