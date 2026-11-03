import { describe, it, expect, vi, afterEach } from 'vitest'
import { installDemoGuards } from './guards.js'
import { resolveLang } from './lang.js'

describe('resolveLang', () => {
  it('uses ?lang=de', () => expect(resolveLang('?lang=de', 'en-US')).toBe('de'))
  it('uses ?lang=en over a German browser', () => expect(resolveLang('?lang=en', 'de-DE')).toBe('en'))
  it('falls back to the browser for unknown ?lang', () => expect(resolveLang('?lang=xx', 'de-AT')).toBe('de'))
  it('maps other browser languages to en', () => expect(resolveLang('', 'fr-FR')).toBe('en'))
})

describe('installDemoGuards', () => {
  let uninstall: () => void = () => {}
  afterEach(() => { uninstall(); document.body.innerHTML = '' })

  function setup() {
    document.body.innerHTML = `
      <button data-tour="export"><span id="inner">Export</span></button>
      <button data-tour="download">Download</button>
      <button data-tour="logout">Logout</button>
      <button data-tour="compare" id="other">Compare</button>`
    const onBlocked = vi.fn()
    const appClick = vi.fn()
    document.querySelectorAll('button').forEach((b) => b.addEventListener('click', appClick))
    uninstall = installDemoGuards(onBlocked)
    return { onBlocked, appClick }
  }

  it('blocks export clicks (also on nested elements) and reports the kind', () => {
    const { onBlocked, appClick } = setup()
    document.getElementById('inner')!.click()
    expect(onBlocked).toHaveBeenCalledWith('export')
    expect(appClick).not.toHaveBeenCalled()
  })

  it('blocks download and logout', () => {
    const { onBlocked } = setup()
    ;(document.querySelector('[data-tour="download"]') as HTMLElement).click()
    ;(document.querySelector('[data-tour="logout"]') as HTMLElement).click()
    expect(onBlocked.mock.calls.map((c) => c[0])).toEqual(['download', 'logout'])
  })

  it('does not block other buttons', () => {
    const { onBlocked, appClick } = setup()
    document.getElementById('other')!.click()
    expect(onBlocked).not.toHaveBeenCalled()
    expect(appClick).toHaveBeenCalledTimes(1)
  })

  it('uninstall removes the listener', () => {
    const { onBlocked } = setup()
    uninstall()
    ;(document.querySelector('[data-tour="export"]') as HTMLElement).click()
    expect(onBlocked).not.toHaveBeenCalled()
  })
})
