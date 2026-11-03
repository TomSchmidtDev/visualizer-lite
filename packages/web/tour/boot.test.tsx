import { describe, it, expect, afterEach } from 'vitest'
import { screen, act } from '@testing-library/react'
import { bootTour } from './boot.js'
import { makeDataset } from './mock/fixtures.test-helpers.js'

describe('bootTour', () => {
  let stop: () => void = () => {}
  afterEach(() => { stop(); document.body.innerHTML = '' })

  it('renders the demo shot list under the /visualizer-lite basename, in the requested language', async () => {
    window.history.pushState({}, '', '/visualizer-lite/?lang=de')
    const root = document.createElement('div')
    document.body.appendChild(root)
    await act(async () => {
      stop = await bootTour({
        root,
        dataset: makeDataset(12, 3, new Date(Date.now() - 3_600_000).toISOString()),
        base: '/visualizer-lite/',
        search: window.location.search,
        navigatorLang: 'en-US',
        startTour: false,
      })
    })
    expect((await screen.findAllByText(/Ethiopia Guji/)).length).toBeGreaterThan(0)
    expect(localStorage.getItem('vl-language')).toBe('de')
    expect(document.documentElement.lang).toBe('de')
  })
})
