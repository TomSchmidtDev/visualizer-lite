// packages/web/src/types.ts

export interface ShotData {
  timeframe: number[]
  espresso_pressure?: number[]
  espresso_pressure_goal?: number[]
  espresso_flow?: number[]
  espresso_flow_goal?: number[]
  espresso_flow_weight?: number[]
  espresso_weight?: number[]
  espresso_temperature_mix?: number[]
  espresso_temperature_basket?: number[]
  espresso_water_dispensed?: number[]
  espresso_state_change?: number[]
  [key: string]: number[] | undefined
}

export interface Shot {
  id: string
  startTime: string
  duration: number | null
  beanWeight: number | null
  drinkWeight: number | null
  drinkTds: number | null
  drinkEy: number | null
  profileTitle: string | null
  grinderModel: string | null
  grinderSetting: string | null
  barista: string | null
  beanBrand: string | null
  beanType: string | null
  roastDate: string | null
  roastLevel: string | null
  espressoEnjoyment: number | null
  fragrance: number | null
  aroma: number | null
  flavor: number | null
  aftertaste: number | null
  acidity: number | null
  bitterness: number | null
  sweetness: number | null
  mouthfeel: number | null
  beanNotes: string | null
  espressoNotes: string | null
  privateNotes: string | null
  tags: string[]
  shotData?: ShotData
  sparkline?: { pressure?: number[]; flow?: number[]; weightFlow?: number[] }
}

export interface ShotListResponse {
  shots: Omit<Shot, 'shotData'>[]
  total: number
  page: number
  limit: number
}

export interface Suggestions {
  beanBrands: string[]
  beanTypes: string[]
  profileTitles: string[]
  grinderModels: string[]
  grinderSettings: string[]
}

export interface AppSettings {
  language: string
  theme: string
  username: string
}

export interface Stats {
  total: number
  avgEnjoyment: number | null
  avgRatio: number | null
}

export interface SearchParams {
  page?: number
  limit?: number
  q?: string
  beanBrand?: string
  beanType?: string
  profileTitle?: string
  grinderModel?: string
  dateFrom?: string
  dateTo?: string
}
