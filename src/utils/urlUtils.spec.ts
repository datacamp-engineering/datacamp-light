import { describe, expect, it } from 'vitest';
import { buildDataLabUrl, buildSignUpUrl } from './urlUtils';

describe('buildDataLabUrl', () => {
  it('builds direct Python DataLab URL with sandbox tag and prefilled code', () => {
    const urlString = buildDataLabUrl({
      code: 'import numpy as np\nprint(1)',
      language: 'python',
      utmSource: 'datacamp_light',
      utmCampaign: 'powered_by_datalab',
    });

    const parsed = new URL(urlString);
    expect(parsed.origin).toBe('https://www.datacamp.com');
    expect(parsed.pathname).toBe('/datalab/new');
    expect(parsed.searchParams.get('_tag')).toBe('sandbox');
    expect(parsed.searchParams.get('code')).toBe('import numpy as np\nprint(1)');
    expect(parsed.searchParams.get('utm_source')).toBe('datacamp_light');
    expect(parsed.searchParams.get('utm_campaign')).toBe('powered_by_datalab');
  });

  it('builds direct R DataLab URL with r-base templateKey', () => {
    const urlString = buildDataLabUrl({
      code: 'x <- c(1, 2, 3)\nmean(x)',
      language: 'r',
      utmSource: 'datacamp_light',
      utmCampaign: 'powered_by_datalab',
    });

    const parsed = new URL(urlString);
    expect(parsed.origin).toBe('https://www.datacamp.com');
    expect(parsed.pathname).toBe('/datalab/new');
    expect(parsed.searchParams.get('templateKey')).toBe('r-base');
    expect(parsed.searchParams.get('_tag')).toBeNull();
    expect(parsed.searchParams.get('utm_source')).toBe('datacamp_light');
    expect(parsed.searchParams.get('utm_campaign')).toBe('powered_by_datalab');
  });

  it('builds clean URL without trailing question mark when parameters are omitted', () => {
    const urlString = buildDataLabUrl({});
    expect(urlString).toBe('https://www.datacamp.com/datalab/new');
  });

  it('wraps URL in affiliate link when impactTrackingLink is provided', () => {
    const urlString = buildDataLabUrl({
      code: 'x = 42',
      language: 'python',
      utmSource: 'partner_blog',
      utmCampaign: 'tutorial_series',
      impactTrackingLink: '/c/67577/1012793/13294',
    });

    const parsed = new URL(urlString);
    expect(parsed.origin).toBe('https://datacamp.pxf.io');
    expect(parsed.pathname).toBe('/c/67577/1012793/13294');
    expect(parsed.searchParams.get('utm_source')).toBe('partner_blog');
    expect(parsed.searchParams.get('utm_campaign')).toBe('tutorial_series');

    const nestedDatalabUrl = parsed.searchParams.get('u');
    expect(nestedDatalabUrl).toBe(
      'https://www.datacamp.com/datalab/new?_tag=sandbox&code=x+%3D+42&utm_source=partner_blog&utm_campaign=tutorial_series',
    );
  });

  it('omits top-level UTM parameters from affiliate link when undefined or empty', () => {
    const urlString = buildDataLabUrl({
      impactTrackingLink: '/c/67577/1012793/13294',
    });

    const parsed = new URL(urlString);
    expect(parsed.origin).toBe('https://datacamp.pxf.io');
    expect(parsed.searchParams.get('utm_source')).toBeNull();
    expect(parsed.searchParams.get('utm_campaign')).toBeNull();
    expect(parsed.searchParams.get('u')).toBe('https://www.datacamp.com/datalab/new');
  });
});

describe('buildSignUpUrl', () => {
  it('builds sign-up redirect URL with encoded currentUrl and campaign parameters', () => {
    const urlString = buildSignUpUrl({
      currentUrl: 'https://example.com/blog/intro-to-python',
      utmSource: 'datacamp_light',
      utmCampaign: 'ai_upsell',
    });

    const parsed = new URL(urlString);
    expect(parsed.pathname).toBe('/users/sign_up');
    expect(parsed.searchParams.get('redirect')).toBe(
      'https://example.com/blog/intro-to-python',
    );
    expect(parsed.searchParams.get('utm_source')).toBe('datacamp_light');
    expect(parsed.searchParams.get('utm_campaign')).toBe('ai_upsell');
  });

  it('omits UTM parameters from sign-up URL when undefined', () => {
    const urlString = buildSignUpUrl({
      currentUrl: 'https://example.com/tutorial',
    });

    const parsed = new URL(urlString);
    expect(parsed.pathname).toBe('/users/sign_up');
    expect(parsed.searchParams.get('redirect')).toBe('https://example.com/tutorial');
    expect(parsed.searchParams.get('utm_source')).toBeNull();
    expect(parsed.searchParams.get('utm_campaign')).toBeNull();
  });
});
