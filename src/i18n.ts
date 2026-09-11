import i18n from 'i18next';
import { initReactI18next, setI18n } from 'react-i18next';
import wafflesTranslations from '@datacamp/waffles/esm/i18n/translations/en-US/waffles.json';

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'translation',
  resources: {
    en: {
      translation: {},
      waffles: wafflesTranslations,
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

setI18n(i18n);

export default i18n;