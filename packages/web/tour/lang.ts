export type TourLang = 'en' | 'de'

/** ?lang=en|de wins; otherwise the browser language (de* → de, else en). */
export function resolveLang(search: string, navigatorLang: string): TourLang {
  const p = new URLSearchParams(search).get('lang')
  if (p === 'en' || p === 'de') return p
  return navigatorLang.toLowerCase().startsWith('de') ? 'de' : 'en'
}
