import { describe, it, expect } from 'vitest'
import { mapArch, mapOs, parsePatterns } from './util'

describe('mapArch', () => {
  it('maps x64/x86_64/amd64 → amd64', () => {
    expect(mapArch('x64')).toBe('amd64')
    expect(mapArch('x86_64')).toBe('amd64')
    expect(mapArch('amd64')).toBe('amd64')
  })
  it('maps arm64/aarch64 → arm64', () => {
    expect(mapArch('arm64')).toBe('arm64')
    expect(mapArch('aarch64')).toBe('arm64')
  })
  it('throws on unknown arch', () => {
    expect(() => mapArch('mips')).toThrow(/unsupported architecture/)
  })
})

describe('mapOs', () => {
  it('maps platforms', () => {
    expect(mapOs('linux')).toBe('linux')
    expect(mapOs('darwin')).toBe('darwin')
    expect(mapOs('win32')).toBe('windows')
  })
  it('throws on unknown platform', () => {
    expect(() => mapOs('sunos')).toThrow(/unsupported OS/)
  })
})

describe('parsePatterns', () => {
  it('trims, drops blanks, keeps order', () => {
    expect(parsePatterns('a\n  b \n\n c\n')).toEqual(['a', 'b', 'c'])
  })
  it('returns empty for whitespace-only input', () => {
    expect(parsePatterns('  \n\n')).toEqual([])
  })
})
