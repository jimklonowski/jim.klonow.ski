import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'

export default defineI18nConfig(() => ({
  fallbackLocale: 'en',
  legacy: false,
  locale: 'en',
  messages: {
    en,
    es,
    fr
  }
}))
