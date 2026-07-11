import { describe, expect, it } from 'vitest'
import { formatGbFigure } from '../../src/lib/format'

describe('formatGbFigure', () => {
  it('keeps one decimal for fractional values', () => {
    expect(formatGbFigure(8.2)).toBe('8.2')
    expect(formatGbFigure(15.3)).toBe('15.3')
  })
  it('drops the decimal for whole values', () => {
    expect(formatGbFigure(12)).toBe('12')
    expect(formatGbFigure(31.98)).toBe('32')
  })
})
