import {
    SUPPORTED_LANGUAGES,
    DEFAULT_LANGUAGE,
    NAMESPACES,
    DEFAULT_NAMESPACE,
} from '../i18n/config.ts';

describe('i18n constants', () => {
    it('SUPPORTED_LANGUAGES contiene los idiomas esperados', () => {
        expect(SUPPORTED_LANGUAGES).toEqual(['en', 'es', 'it', 'fr', 'zh']);
    });

    it('DEFAULT_LANGUAGE es en', () => {
        expect(DEFAULT_LANGUAGE).toBe('en');
    });

    it('NAMESPACES contiene common', () => {
        expect(NAMESPACES).toEqual(['common']);
    });

    it('DEFAULT_NAMESPACE es common', () => {
        expect(DEFAULT_NAMESPACE).toBe('common');
    });
});