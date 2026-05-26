// packages/web/src/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'

const savedLang = localStorage.getItem('vl-language')
const browserLang = navigator.language.startsWith('de') ? 'de' : 'en'

i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: savedLang === 'auto' || !savedLang ? browserLang : savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n

export function setLanguage(lang: string) {
  const resolved = lang === 'auto' ? browserLang : lang
  localStorage.setItem('vl-language', lang)
  i18n.changeLanguage(resolved)
}
