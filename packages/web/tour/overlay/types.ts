import type { Caption } from '../i18n/types.js'

export type Control = 'pause' | 'play' | 'prev' | 'next' | 'exit' | 'restart' | 'explore'

export interface Rect { x: number; y: number; width: number; height: number }

export interface OverlayState {
  phase: 'intro' | 'step' | 'outro' | 'free'
  stepIndex: number
  stepCount: number
  /** Ring + bubble anchor in viewport coordinates; null → bubble centred. */
  targetRect: Rect | null
  caption: Caption | null
  /** 0..1 progress of the current step. */
  progress: number
  paused: boolean
  cursor: { x: number; y: number; clicking: boolean; visible: boolean }
  toast: string | null
}

export const INITIAL_OVERLAY: OverlayState = {
  phase: 'intro', stepIndex: 0, stepCount: 0, targetRect: null, caption: null,
  progress: 0, paused: false, cursor: { x: -40, y: -40, clicking: false, visible: false }, toast: null,
}
