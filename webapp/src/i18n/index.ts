import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import {
    DEFAULT_LANGUAGE,
    NAMESPACES,
    DEFAULT_NAMESPACE,
    SUPPORTED_LANGUAGES,
} from './config';

import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';
import itCommon from './locales/it/common.json';
import frCommon from './locales/fr/common.json';
import zhCommon from './locales/zh/common.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: SUPPORTED_LANGUAGES,
        debug: true,

        ns: NAMESPACES,
        defaultNS: DEFAULT_NAMESPACE,

        interpolation: {
            escapeValue: false,
        },

        resources: {
            en: {
                common: enCommon,
            },
            es: {
                common: esCommon,
            },
            it: {
                common: itCommon,
            },
            fr: {
                common: frCommon,
            },
            zh: {
                common: zhCommon,
            },
        },
    });

export default i18n;