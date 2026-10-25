import type { ExpressionSpecification } from 'maplibre-gl'
import type { RiskLevel } from '../api'

export const RISK_LEVELS = [
  { label: 'Low', color: '#2f9e5f' },
  { label: 'Moderate', color: '#e2b007' },
  { label: 'High', color: '#ee7a1c' },
  { label: 'Severe', color: '#d42a3c' },
  { label: 'No travel', color: '#6b2196' },
] as const

export const riskLabel = (level: RiskLevel) => RISK_LEVELS[level].label
export const riskColor = (level: RiskLevel) => RISK_LEVELS[level].color

/** MapLibre expression mapping a 0–4 risk number to its color. */
export const riskColorExpression = (input: ExpressionSpecification) =>
  [
    'match',
    input,
    ...RISK_LEVELS.flatMap(({ color }, level) => [level, color]),
    RISK_LEVELS[0].color,
  ] as ExpressionSpecification
