import type { TourLang } from '../lang.js'
import type { TourStrings } from './types.js'
import { en } from './en.js'
import { de } from './de.js'

export const tourText = (lang: TourLang): TourStrings => (lang === 'de' ? de : en)
export type { TourStrings, Caption } from './types.js'
