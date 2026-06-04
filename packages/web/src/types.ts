// packages/web/src/types.ts

export interface ProfileStep {
  name: string
  temperature: string
  sensor: string
  pump: string
  transition: string
  pressure: string
  flow: string
  seconds: string
  volume: string
  weight: string
  exit?: { type: string; condition: string; value: string }
  limiter?: { value: string; range: string }
}

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
  profileSteps?: ProfileStep[]
  [key: string]: number[] | ProfileStep[] | undefined
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
  beverageType: string | null
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
  avgRatio: number | null
}

export interface Suggestions {
  beanBrands: string[]
  beanTypes: string[]
  profileTitles: string[]
  grinderModels: string[]
  grinderSettings: string[]
  beverageTypes: string[]
}

export interface AppSettings {
  language: string
  theme: string
  username: string
  de1Url: string
  tooltipOpacity: number
  showAvgRatio: boolean
  de1LastImportDate?: string | null
  statsTopN: number
  statsShowPrevValue: boolean
  de1DefaultBeverage: 'espresso' | 'filter' | ''
  apiKeyClaudeKey?: string
  apiKeyOpenaiKey?: string
  aiModel?: string
  aiCustomContext?: string
}

export interface Analysis {
  barista: string[]
  roaster: string[]
  analyst: string[]
  aiModel?: string
  tokenInputCount?: number
  tokenOutputCount?: number
  costInputUsd?: number | null
  costOutputUsd?: number | null
  createdAt?: string
}

export interface AnalysisResponse {
  id: string
  shotId: string
  analysisType: 'detail' | 'stats'
  aiModel: string
  barista: string[]
  roaster: string[]
  analyst: string[]
  tokenInputCount: number
  tokenOutputCount: number
  costInputUsd: number | null
  costOutputUsd: number | null
  createdAt: string
  cachedAt?: string
}

export interface StatsWindow {
  shotCount: number
  beanWeightG: number
  drinkWeightG: number
  avgRatio: number | null
  avgEnjoyment: number | null
  avgDurationS: number | null
  shotsPerDay: number | null
  topGrinderSetting: string | null
  topRoasters: { name: string; count: number }[]
  topRoasts:   { name: string; count: number }[]
  topProfiles: { name: string; count: number }[]
}

export interface Stats {
  period: '24h' | '7d' | '14d' | '30d' | '180d' | '365d' | '730d' | '1095d' | 'all'
  beverage: 'espresso' | 'filter' | 'all'
  current: StatsWindow
  previous: StatsWindow
}

export interface BeanRow {
  bean: string
  shotCount: number
  avgEnjoyment: number | null
  avgRatio: number | null
  avgDurationS: number | null
  totalBeanWeightG: number
}

export interface RoasterRow {
  roaster: string
  shotCount: number
  avgEnjoyment: number | null
  avgRatio: number | null
  avgDurationS: number | null
  totalBeanWeightG: number
  beans: BeanRow[]
}

export interface ProfileRow {
  profile: string
  shotCount: number
  avgEnjoyment: number | null
  avgDurationS: number | null
  avgRatio: number | null
  avgBeanWeightG: number | null
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
  beverageType?: string
}
