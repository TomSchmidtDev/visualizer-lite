import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TourOverlay } from './TourOverlay.js'
import { INITIAL_OVERLAY, type OverlayState } from './types.js'
import { en } from '../i18n/en.js'

const base: OverlayState = {
  ...INITIAL_OVERLAY,
  phase: 'step', stepIndex: 2, stepCount: 12,
  targetRect: { x: 100, y: 200, width: 150, height: 30 },
  caption: { title: 'Filter by roaster', body: 'Combine roaster, bean and profile.' },
  progress: 0.4,
}

function renderOverlay(state: Partial<OverlayState> = {}, recordMode = false) {
  const onControl = vi.fn()
  const r = render(<TourOverlay state={{ ...base, ...state }} strings={en} recordMode={recordMode} onControl={onControl} />)
  return { ...r, onControl }
}

describe('TourOverlay', () => {
  it('renders the ring around targetRect with padding', () => {
    const { container } = renderOverlay()
    const ring = container.querySelector('.tour-ring') as HTMLElement
    expect(ring.style.left).toBe('94px')
    expect(ring.style.top).toBe('194px')
    expect(ring.style.width).toBe('162px')
  })

  it('places the bubble above the target when placement is above and there is room', () => {
    const { container } = renderOverlay({ targetRect: { x: 100, y: 400, width: 150, height: 30 }, placement: 'above' })
    const bubble = container.querySelector('.tour-bubble') as HTMLElement
    expect(bubble.classList.contains('above')).toBe(true)
    expect(parseFloat(bubble.style.top)).toBeLessThan(400)
  })

  it('falls back to below when there is no room above', () => {
    const { container } = renderOverlay({ targetRect: { x: 100, y: 60, width: 150, height: 30 }, placement: 'above' })
    expect(container.querySelector('.tour-bubble')!.classList.contains('below')).toBe(true)
  })

  it('keeps the bubble inside the viewport when the target is below the fold', () => {
    const { container } = renderOverlay({ targetRect: { x: 100, y: window.innerHeight + 400, width: 150, height: 30 } })
    const top = parseFloat((container.querySelector('.tour-bubble') as HTMLElement).style.top)
    expect(top).toBeLessThanOrEqual(window.innerHeight - 150 - 16)
  })

  it('centres the bubble when there is no target', () => {
    const { container } = renderOverlay({ targetRect: null })
    expect(container.querySelector('.tour-ring')).toBeNull()
    expect(container.querySelector('.tour-bubble')!.classList.contains('centered')).toBe(true)
  })

  it('shows caption and the step counter', () => {
    renderOverlay()
    expect(screen.getByText('Filter by roaster')).toBeInTheDocument()
    expect(screen.getByText('Step 3 of 12')).toBeInTheDocument()
  })

  it('progress bar width reflects progress', () => {
    const { container } = renderOverlay()
    expect((container.querySelector('.tour-progress > i') as HTMLElement).style.width).toBe('40%')
  })

  it('control bar sends controls, and is hidden in record mode', () => {
    const { onControl, unmount } = renderOverlay()
    fireEvent.click(screen.getByLabelText('Pause'))
    expect(onControl).toHaveBeenCalledWith('pause')
    unmount()
    renderOverlay({}, true)
    expect(screen.queryByLabelText('Pause')).toBeNull()
  })

  it('intro card shows the core message', () => {
    renderOverlay({ phase: 'intro' })
    expect(screen.getByText('Your shots. Your server.')).toBeInTheDocument()
  })

  it('outro shows the repo link, explore and restart', () => {
    const { onControl } = renderOverlay({ phase: 'outro' })
    expect(screen.getByText('View on GitHub').closest('a')!.getAttribute('href')).toBe('https://github.com/TomSchmidtDev/visualizer-lite')
    fireEvent.click(screen.getByText('Explore the demo'))
    fireEvent.click(screen.getByText('Restart tour'))
    expect(onControl.mock.calls.map((c) => c[0])).toEqual(['explore', 'restart'])
  })

  it('free phase renders only the toast and a restart button', () => {
    const { container } = renderOverlay({ phase: 'free', toast: 'Disabled in the demo' })
    expect(container.querySelector('.tour-bubble')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Disabled in the demo')
    expect(screen.getByText(/Restart tour/)).toBeInTheDocument()
  })
})
