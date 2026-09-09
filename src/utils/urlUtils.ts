import { getMainAppBaseUrl } from '../ai/aiConfig';

export interface BuildDataLabUrlOptions {
  code?: string;
  language?: string;
  utmSource?: string;
  utmCampaign?: string;
  impactTrackingLink?: string;
}

/**
 * Builds a language-aware DataLab new workspace URL with optional code prefilling
 * and affiliate tracking wrapper.
 *
 * - Python with code: attaches `_tag=sandbox` and `code=...` so DataLab populates the code cell.
 * - R: attaches `templateKey=r-base` to launch a dedicated R Jupyter kernel.
 * - Affiliate tracking: wraps the destination inside single-encoded `u` on `datacamp.pxf.io`
 *   and sets top-level `utm_source`/`utm_campaign` for tracking parity.
 */
export function buildDataLabUrl(options: BuildDataLabUrlOptions): string {
  const { code, language, utmSource, utmCampaign, impactTrackingLink } = options;

  const queryParameters = new URLSearchParams();
  const normalizedLanguage = (language || 'python').toLowerCase();

  if (normalizedLanguage === 'python' && code && code.trim()) {
    queryParameters.set('_tag', 'sandbox');
    queryParameters.set('code', code);
  } else if (normalizedLanguage === 'r') {
    queryParameters.set('templateKey', 'r-base');
  }

  if (utmSource) {
    queryParameters.set('utm_source', utmSource);
  }
  if (utmCampaign) {
    queryParameters.set('utm_campaign', utmCampaign);
  }

  const queryString = queryParameters.toString();
  const directDatalabUrl = queryString
    ? `https://www.datacamp.com/datalab/new?${queryString}`
    : 'https://www.datacamp.com/datalab/new';

  if (!impactTrackingLink) {
    return directDatalabUrl;
  }

  const baseAffiliateUrl =
    impactTrackingLink.startsWith('http://') || impactTrackingLink.startsWith('https://')
      ? impactTrackingLink
      : `https://datacamp.pxf.io${impactTrackingLink.startsWith('/') ? '' : '/'}${impactTrackingLink}`;

  try {
    const affiliateUrl = new URL(baseAffiliateUrl);
    affiliateUrl.searchParams.set('u', directDatalabUrl);
    if (utmSource) {
      affiliateUrl.searchParams.set('utm_source', utmSource);
    }
    if (utmCampaign) {
      affiliateUrl.searchParams.set('utm_campaign', utmCampaign);
    }
    return affiliateUrl.toString();
  } catch {
    return baseAffiliateUrl;
  }
}

export interface BuildSignUpUrlOptions {
  currentUrl?: string;
  utmSource?: string;
  utmCampaign?: string;
}

/**
 * Builds a sign-up redirect URL with current page return target and campaign parameters.
 */
export function buildSignUpUrl(options: BuildSignUpUrlOptions): string {
  const {
    currentUrl = typeof window !== 'undefined'
      ? window.location.href
      : 'https://www.datacamp.com',
    utmSource,
    utmCampaign,
  } = options;

  const queryParameters = new URLSearchParams();
  queryParameters.set('redirect', currentUrl);
  if (utmSource) {
    queryParameters.set('utm_source', utmSource);
  }
  if (utmCampaign) {
    queryParameters.set('utm_campaign', utmCampaign);
  }

  return `${getMainAppBaseUrl()}/users/sign_up?${queryParameters.toString()}`;
}
