import type { Plan, RiskLevel, RouteOption } from '../api'
import { formatDuration, formatMiles, formatTime } from '../lib/format'
import { RISK_LEVELS, riskLabel } from '../lib/risk'
import { Shield } from './Shield'

interface RouteListProps {
  plan: Plan
  selectedId: string
  onSelect: (id: string) => void
}

export function RouteList({ plan, selectedId, onSelect }: RouteListProps) {
  const routes = [...plan.routes].sort((a, b) => a.rank - b.rank)
  const noSafeRoute = routes[0].miles_by_risk[4] > 0

  return (
    <section aria-labelledby="routes-heading" className="space-y-3">
      <h2 id="routes-heading" className="text-lg font-bold">
        {routes.length === 1 ? '1 route option' : `${routes.length} route options`}
      </h2>
      {noSafeRoute && (
        <p
          role="alert"
          className="rounded-md bg-no-travel-soft px-3 py-2.5 text-sm font-semibold text-no-travel"
        >
          Every route crosses no-travel weather at this departure time. Try leaving later.
        </p>
      )}
      <ul className="space-y-2.5">
        {routes.map((route) => (
          <li key={route.id}>
            <RouteCard
              route={route}
              reason={route.id === plan.recommended ? plan.reason : null}
              selected={route.id === selectedId}
              onSelect={() => onSelect(route.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface RouteCardProps {
  route: RouteOption
  reason: string | null
  selected: boolean
  onSelect: () => void
}

function RouteCard({ route, reason, selected, onSelect }: RouteCardProps) {
  const blocked = route.checkpoints.find((checkpoint) => checkpoint.risk === 4)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full rounded-lg border border-line bg-surface p-4 text-left transition-[border-color,box-shadow] hover:border-muted/40 aria-pressed:border-shield aria-pressed:shadow-[0_0_0_1px_var(--color-shield)]"
    >
      {/* Only phrasing elements (span) are valid inside a button. */}
      {reason && (
        <span className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-shield">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.2 5.3-3.8 4a.75.75 0 0 1-1.1 0l-1.6-1.7a.75.75 0 1 1 1.1-1l1 1.1 3.3-3.4a.75.75 0 1 1 1.1 1Z" />
          </svg>
          Recommended: {reason.toLowerCase()}
        </span>
      )}
      {blocked && (
        <span className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-no-travel">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM4.5 7.25h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1 0-1.5Z" />
          </svg>
          Not safe to drive: no-travel weather at mile {Math.round(blocked.mile)}
        </span>
      )}
      <span className="flex items-center gap-3">
        <Shield label={route.id} muted={!selected} className="size-9 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            <span className="sr-only">Route {route.id}, </span>
            {route.name}
          </span>
          <span className="block text-sm text-muted">
            {formatMiles(route.distance_mi)},{' '}
            <span className="whitespace-nowrap">arrives {formatTime(route.arrival)}</span>
          </span>
        </span>
        <span className="shrink-0 text-lg font-bold tracking-tight">
          {formatDuration(route.duration_s)}
        </span>
      </span>

      <RiskBar milesByRisk={route.miles_by_risk} />
      <span className="mt-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{riskSummary(route.miles_by_risk)}</span>
        <span className="shrink-0 text-muted" title="Distance-weighted: 0 is low, 4 is no travel">
          Avg risk <span className="font-semibold text-ink">{route.average_risk.toFixed(2)}</span>
        </span>
      </span>
    </button>
  )
}

/** Share of the route's miles at each risk level. */
function RiskBar({ milesByRisk }: { milesByRisk: number[] }) {
  const total = milesByRisk.reduce((sum, miles) => sum + miles, 0)
  return (
    <span className="mt-3.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      {milesByRisk.map(
        (miles, level) =>
          miles > 0 && (
            <span
              key={level}
              style={{ width: `${(miles / total) * 100}%`, background: RISK_LEVELS[level].color }}
            />
          ),
      )}
    </span>
  )
}

function riskSummary(milesByRisk: number[]) {
  const risky = milesByRisk
    .map((miles, level) => ({ miles, level: level as RiskLevel }))
    .filter(({ miles, level }) => level > 0 && miles > 0)
    .reverse()
  if (!risky.length) return 'Low risk the whole way'
  return risky
    .map(({ miles, level }) => `${formatMiles(miles)} ${riskLabel(level).toLowerCase()}`)
    .join(', ')
}
