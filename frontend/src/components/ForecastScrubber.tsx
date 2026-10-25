import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Plan, RouteOption } from '../api'
import { formatTime } from '../lib/format'
import { elapsedAt, mileAt } from '../lib/map'
import { RISK_LEVELS } from '../lib/risk'

const FORECAST_HOURS = 48
const HOURS_PER_SECOND = 3 // playback speed
const TICKS = [0, 12, 24, 36, 48]

interface ForecastScrubberProps {
  plan: Plan
  route: RouteOption
  hour: number
  onHourChange: Dispatch<SetStateAction<number>>
  showHeatmap: boolean
  onShowHeatmapChange: (show: boolean) => void
}

/** Time slider for the weather heatmap and the truck marker, 0–48 h from the departure hour. */
export function ForecastScrubber({
  plan,
  route,
  hour,
  onHourChange,
  showHeatmap,
  onShowHeatmapChange,
}: ForecastScrubberProps) {
  const [playing, setPlaying] = useState(false)
  const playFrom = useRef(0)

  // Advance continuously so the truck drives instead of jumping an hour at a time.
  useEffect(() => {
    if (!playing) return
    const startedAt = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const next = playFrom.current + ((now - startedAt) / 1000) * HOURS_PER_SECOND
      if (next >= FORECAST_HOURS) {
        onHourChange(FORECAST_HOURS)
        setPlaying(false)
        return
      }
      onHourChange(next)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, onHourChange])

  function togglePlay() {
    playFrom.current = hour >= FORECAST_HOURS ? 0 : hour
    setPlaying(!playing)
  }

  const time = new Date(Date.parse(plan.heatmap.start) + hour * 3_600_000)
  const departHour = -elapsedAt(plan, 0) / 3600
  const arriveHour = Math.min(departHour + route.duration_s / 3600, FORECAST_HOURS)

  return (
    <div className="rounded-xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur sm:p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause forecast' : 'Play forecast'}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-surface transition-colors hover:bg-shield hover:text-white"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
            {playing ? (
              <path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" />
            ) : (
              <path d="M6 3.5v13l10.5-6.5z" />
            )}
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-bold">{formatTime(time)}</p>
            <p className="truncate text-sm text-muted">{truckStatus(plan, route, hour)}</p>
          </div>
          <div className="relative">
            {/* Track, with the selected route's drive highlighted from departure to arrival. */}
            <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
            <span
              className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-shield/45"
              style={{ left: trackAt(departHour), width: trackSpan(arriveHour - departHour) }}
            />
            <input
              type="range"
              min={0}
              max={FORECAST_HOURS}
              step="any"
              value={hour}
              onChange={(event) => {
                setPlaying(false)
                onHourChange(event.target.valueAsNumber)
              }}
              aria-label="Forecast time"
              aria-valuetext={formatTime(time)}
              className="forecast-range"
            />
          </div>
          <div className="flex justify-between text-xs text-muted" aria-hidden="true">
            {TICKS.map((tick) => (
              <span key={tick}>{tick ? `+${tick} h` : 'Departure'}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
        <ul
          className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold"
          aria-label="Risk levels"
        >
          {RISK_LEVELS.map(({ label, color }) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: color }} />
              {label}
            </li>
          ))}
        </ul>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(event) => onShowHeatmapChange(event.target.checked)}
            className="size-4 accent-shield"
          />
          Weather layer
        </label>
      </div>
    </div>
  )
}

// Positions on the track, matching where the 20 px thumb's center sits.
const trackAt = (hour: number) => `calc(10px + (100% - 20px) * ${hour / FORECAST_HOURS})`
const trackSpan = (hours: number) => `calc((100% - 20px) * ${hours / FORECAST_HOURS})`

function truckStatus(plan: Plan, route: RouteOption, hour: number) {
  const elapsed = elapsedAt(plan, hour)
  if (elapsed <= 0) return `Route ${route.id} hasn't left yet`
  if (elapsed >= route.duration_s) return `Route ${route.id} has arrived`
  return `Mile ${Math.round(mileAt(plan, route, elapsed))} of ${Math.round(route.distance_mi)} on route ${route.id}`
}
