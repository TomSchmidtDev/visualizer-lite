// packages/api/src/types.ts

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

export interface ParsedShot {
  clock: number
  beanBrand: string | null
  beanType: string | null
  beanWeight: number | null
  drinkWeight: number | null
  duration: number | null
  grinderModel: string | null
  grinderSetting: string | null
  barista: string | null
  profileTitle: string | null
  roastLevel: string | null
  roastDate: string | null
  shotData: ShotData
}

export interface ShotResponse {
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
  /** Downsampled curves for list sparkline (≤60 points each) */
  sparkline?: { pressure?: number[]; flow?: number[]; weightFlow?: number[] }
}

export interface ShotListResponse {
  shots: Omit<ShotResponse, 'shotData'>[]
  total: number
  page: number
  limit: number
}
