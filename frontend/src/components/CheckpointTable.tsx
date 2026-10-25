import type { Checkpoint, RouteOption } from '../api'
import { formatTime } from '../lib/format'
import { riskColor, riskLabel } from '../lib/risk'

interface CheckpointTableProps {
  route: RouteOption
  focusedKey: string | null
  onFocus: (key: string) => void
}

export function CheckpointTable({ route, focusedKey, onFocus }: CheckpointTableProps) {
  return (
    <section aria-labelledby="checkpoints-heading">
      <h2 id="checkpoints-heading" className="text-lg font-bold">
        Checkpoints on route {route.id}
      </h2>
      <p className="mb-2.5 text-sm text-muted">Weather when the truck gets there</p>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs text-muted">
            <tr>
              <th className="py-2 pl-3 font-semibold">Mile</th>
              <th className="px-2 py-2 font-semibold">Arrives</th>
              <th className="px-2 py-2 font-semibold">Weather</th>
              <th className="py-2 pr-3 font-semibold">Risk</th>
            </tr>
          </thead>
          <tbody>
            {route.checkpoints.map((checkpoint, index) => {
              const key = `${route.id}:${index}`
              const calm = checkpoint.risk === 0
              return (
                <tr
                  key={key}
                  onClick={() => onFocus(key)}
                  aria-current={key === focusedKey || undefined}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-paper aria-current:bg-highlight aria-current:shadow-[inset_3px_0_0_var(--color-shield)]"
                >
                  <td className="py-2 pl-3 font-semibold">
                    {/* The row handles the click; the button makes it reachable by keyboard. */}
                    <button
                      type="button"
                      aria-label={`Show mile ${Math.round(checkpoint.mile)} on the map`}
                      className="rounded-sm"
                    >
                      {Math.round(checkpoint.mile)}
                    </button>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatTime(checkpoint.eta)}</td>
                  <td className={`px-2 py-2 whitespace-nowrap ${calm ? 'text-muted' : ''}`}>
                    {describeWeather(checkpoint)}
                  </td>
                  <td className="py-2 pr-3">
                    <RiskTag checkpoint={checkpoint} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RiskTag({ checkpoint }: { checkpoint: Checkpoint }) {
  const color = riskColor(checkpoint.risk)
  if (checkpoint.risk === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
        <span className="size-2 rounded-full" style={{ background: color }} />
        Low
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap"
      style={{ background: `${color}26` }}
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
      {riskLabel(checkpoint.risk)}
    </span>
  )
}

function describeWeather({ wind_mph, rain_in_hr, snow_in_hr }: Checkpoint) {
  const parts = [`${wind_mph} mph`]
  if (rain_in_hr > 0) parts.push(`${rain_in_hr}″ rain`)
  if (snow_in_hr > 0) parts.push(`${snow_in_hr}″ snow`)
  return parts.join(', ')
}
