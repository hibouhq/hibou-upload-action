import { describe, it, expect } from 'vitest'
import { checksumFor, mapArch, mapOs, parsePatterns } from './util'

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

describe('checksumFor', () => {
  const sum = 'A'.repeat(64)
  it('returns the platform checksum, lowercased', () => {
    expect(checksumFor({ 'linux/amd64': sum }, 'linux', 'amd64')).toBe('a'.repeat(64))
  })
  it('returns empty when the server sends none or a malformed value', () => {
    expect(checksumFor(undefined, 'linux', 'amd64')).toBe('')
    expect(checksumFor({ 'darwin/arm64': sum }, 'linux', 'amd64')).toBe('')
    expect(checksumFor({ 'linux/amd64': 'abc' }, 'linux', 'amd64')).toBe('')
  })
})
