import { describe, it, expect } from 'vitest'
import { ffmpegArgs, parseRecordArgs } from './record.js'

describe('record script helpers', () => {
  it('builds H.264 720p faststart args without audio', () => {
    const a = ffmpegArgs('in.webm', 'out.mp4', 30)
    expect(a).toEqual(expect.arrayContaining(['-i', 'in.webm', '-c:v', 'libx264', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an']))
    expect(a.at(-1)).toBe('out.mp4')
    expect(a.join(' ')).toContain('scale=1280:720')
  })

  it('parses languages, output dir and crf with defaults', () => {
    expect(parseRecordArgs([])).toEqual({ langs: ['en', 'de'], out: 'tour/out', crf: 26 })
    expect(parseRecordArgs(['--lang', 'de', '--crf', '34', '--out', 'x'])).toEqual({ langs: ['de'], out: 'x', crf: 34 })
    expect(() => parseRecordArgs(['--lang', 'fr'])).toThrow()
  })
})
