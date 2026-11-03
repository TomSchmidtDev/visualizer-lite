import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import { readingTimeMs, setSelectValue, setInputValue, waitFor, delay } from './dom.js'

describe('readingTimeMs', () => {
  it('clamps to [3500, 12000]', () => {
    expect(readingTimeMs('')).toBe(3500)
    expect(readingTimeMs('x'.repeat(1000))).toBe(12000)
    expect(readingTimeMs('x'.repeat(100))).toBe(1500 + 45 * 100)
  })
})

function Controlled({ onChange }: { onChange: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <>
      <select data-testid="sel" value={v} onChange={(e) => { setV(e.target.value); onChange(e.target.value) }}>
        <option value="">all</option><option value="A">A</option>
      </select>
      <input data-testid="inp" value={v} onChange={(e) => { setV(e.target.value); onChange(e.target.value) }} />
    </>
  )
}

describe('setSelectValue / setInputValue', () => {
  it('trigger React onChange on controlled elements', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    setSelectValue(screen.getByTestId('sel') as HTMLSelectElement, 'A')
    expect(onChange).toHaveBeenLastCalledWith('A')
    setInputValue(screen.getByTestId('inp') as HTMLInputElement, 'xyz')
    expect(onChange).toHaveBeenLastCalledWith('xyz')
  })
})

describe('waitFor', () => {
  it('resolves when the element appears, null after timeout', async () => {
    setTimeout(() => { const d = document.createElement('div'); d.id = 'late'; document.body.appendChild(d) }, 150)
    expect(await waitFor('#late', 1000)).not.toBeNull()
    expect(await waitFor('#never', 200)).toBeNull()
  })
})

describe('delay', () => {
  it('rejects with AbortError when aborted', async () => {
    const c = new AbortController()
    const p = delay(10_000, c.signal)
    c.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})
