import { describe, expect, it } from 'vitest'
import { formatDuration, formatInches, formatMiles } from './format'

describe('formatDuration', () => {
  it('shows hours and zero-padded minutes', () => {
    expect(formatDuration(14 * 3600 + 5 * 60)).toBe('14\u00a0h 05\u00a0m')
    expect(formatDuration(42 * 60)).toBe('42\u00a0m')
  })
})

describe('formatMiles', () => {
  it('keeps one decimal, like the API', () => {
    expect(formatMiles(12.5)).toBe('12.5\u00a0mi')
    expect(formatMiles(964)).toBe('964\u00a0mi')
  })
})

describe('formatInches', () => {
  it('shows at least two decimals and keeps the third when the forecast has one', () => {
    expect(formatInches(0)).toBe('0.00')
    expect(formatInches(0.098)).toBe('0.098')
  })
})
