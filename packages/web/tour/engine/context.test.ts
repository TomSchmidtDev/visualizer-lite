import { describe, it, expect, vi, afterEach } from 'vitest'
import { createDomContext } from './context.js'

afterEach(() => { document.body.innerHTML = '' })

function setup() {
  document.body.innerHTML = `<button id="b">Go</button><select id="s"><option value="">-</option><option value="A">A</option></select><input id="i">`
  const btn = document.getElementById('b')!
  btn.getBoundingClientRect = () => ({ left: 100, top: 50, width: 40, height: 20, right: 140, bottom: 70, x: 100, y: 50, toJSON: () => ({}) })
  Element.prototype.scrollIntoView = vi.fn()
  const cursor: { x: number; y: number; clicking: boolean; visible: boolean }[] = []
  const navigate = vi.fn()
  const ctx = createDomContext(new AbortController().signal, { navigate, setCursor: (c) => cursor.push(c), speed: 0 })
  return { ctx, btn, cursor, navigate }
}

describe('createDomContext', () => {
  it('click moves the cursor to the element centre, then clicks it', async () => {
    const { ctx, btn, cursor } = setup()
    const onClick = vi.fn()
    btn.addEventListener('click', onClick)
    await ctx.click('#b')
    expect(cursor.some((c) => c.x === 120 && c.y === 60 && c.visible)).toBe(true)
    expect(cursor.some((c) => c.clicking)).toBe(true)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('select changes the value and fires change', async () => {
    const { ctx } = setup()
    const onChange = vi.fn()
    document.getElementById('s')!.addEventListener('change', onChange)
    await ctx.select('#s', 'A')
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('A')
    expect(onChange).toHaveBeenCalled()
  })

  it('type enters text into an input', async () => {
    const { ctx } = setup()
    await ctx.type('#i', 'guji')
    expect((document.getElementById('i') as HTMLInputElement).value).toBe('guji')
  })

  it('navigate delegates to the router', async () => {
    const { ctx, navigate } = setup()
    await ctx.navigate('/stats')
    expect(navigate).toHaveBeenCalledWith('/stats')
  })

  it('click on a missing element does nothing and does not throw', async () => {
    const { ctx } = setup()
    await expect(ctx.click('#nope')).resolves.toBeUndefined()
  }, 8000)
})
