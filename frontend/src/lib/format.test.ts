import { describe, expect, it } from 'vitest'
import { formatDuration, formatInches, formatMiles } from './format'

describe('formatDuration', () => {
  it('shows hours and zero-padded minutes', () => {
    expect(formatDuration(14 * 3600 + 5 * 60)).toBe('14 h 05 m')
    expect(formatDuration(42 * 60)).toBe('42 m')
  })
})

describe('formatMiles', () => {
  it('keeps one decimal, like the API', () => {
    expect(formatMiles(12.5)).toBe('12.5 mi')
    expect(formatMiles(964)).toBe('964 mi')
  })
})

describe('formatInches', () => {
  it('shows at least two decimals and keeps the third when the forecast has one', () => {
    expect(formatInches(0)).toBe('0.00')
    expect(formatInches(0.098)).toBe('0.098')
  })
})
