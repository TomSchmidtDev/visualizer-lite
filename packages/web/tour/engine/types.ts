export interface Step {
  /** Caption key (tour/i18n captions). */
  id: string
  /** Navigate here first if the current location (path + search, without basename) differs. */
  route?: string
  /** CSS selector for ring + bubble anchor. */
  target?: string
  action?: (ctx: TourContext) => Promise<void>
  /** Extra time after the action, default 0. */
  holdMs?: number
}

export interface TourContext {
  navigate(path: string): Promise<void>
  click(selector: string): Promise<void>
  select(selector: string, value: string): Promise<void>
  type(selector: string, text: string): Promise<void>
  hover(selector: string, xFrac: number, yFrac?: number): Promise<void>
  scrollTo(selector: string): Promise<void>
  waitFor(selector: string, timeoutMs?: number): Promise<Element | null>
  wait(ms: number): Promise<void>
  signal: AbortSignal
}

export interface RunnerState {
  phase: 'intro' | 'step' | 'outro' | 'free'
  stepIndex: number
  stepCount: number
  stepId: string | null
  /** Selector of the current step's target (null if none or not found). */
  target: string | null
  progress: number
  paused: boolean
}
