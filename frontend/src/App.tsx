import { useRef, useState } from 'react'
import { planTrip, type Plan, type PlanRequest } from './api'
import { CheckpointTable } from './components/CheckpointTable'
import { ForecastScrubber } from './components/ForecastScrubber'
import { RouteList } from './components/RouteList'
import { Shield } from './components/Shield'
import { TripForm } from './components/TripForm'
import { TripMap } from './components/TripMap'
import { TripSummary } from './components/TripSummary'
import { useTheme } from './lib/theme'

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [trip, setTrip] = useState<PlanRequest | null>(null)
  const [editing, setEditing] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  // A new object per click, so picking the same checkpoint again re-centers the map.
  const [focus, setFocus] = useState<{ key: string } | null>(null)
  const mapPanel = useRef<HTMLDivElement>(null)
  const [hour, setHour] = useState(0)
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [theme, toggleTheme] = useTheme()

  async function handlePlan(trip: PlanRequest) {
    setPending(true)
    setError(null)
    try {
      const result = await planTrip(trip)
      setPlan(result)
      setTrip(trip)
      setEditing(false)
      setSelectedId(result.recommended)
      setFocus(null)
      setHour(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setPending(false)
    }
  }

  function focusCheckpoint(key: string) {
    setFocus({ key })
    mapPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) // on phones the map is above
  }

  function selectRoute(id: string) {
    setSelectedId(id)
    setFocus(null)
  }

  const selected = plan?.routes.find((route) => route.id === selectedId)

  // Mobile: header, map, then the panel, in one scrolling page.
  // Desktop: the panel scrolls on the left, the map fills the right.
  return (
    <div className="grid min-h-full grid-cols-1 lg:h-full lg:grid-cols-[440px_1fr] lg:grid-rows-[auto_1fr]">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-4 lg:border-r">
        <Shield label="S" className="size-9" />
        <div className="flex-1">
          <h1 className="text-xl leading-tight font-extrabold">Spotter Routes</h1>
          <p className="text-sm text-muted">Truck routes checked against the forecast</p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="size-[18px]" fill="currentColor" aria-hidden="true">
            {theme === 'dark' ? (
              <path d="M10 14.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10 1a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1Zm0 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm9-6a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM4 10a1 1 0 0 1-1 1H2a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm11.66-5.66a1 1 0 0 1 0 1.41l-.7.71a1 1 0 0 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0ZM6.46 13.54a1 1 0 0 1 0 1.42l-.7.7a1 1 0 0 1-1.42-1.41l.71-.71a1 1 0 0 1 1.41 0Zm9.2 2.12a1 1 0 0 1-1.41 0l-.71-.7a1 1 0 0 1 1.42-1.42l.7.71a1 1 0 0 1 0 1.41ZM6.46 6.46a1 1 0 0 1-1.42 0l-.7-.7a1 1 0 0 1 1.41-1.42l.71.71a1 1 0 0 1 0 1.41Z" />
            ) : (
              <path d="M17.3 12.6A7.5 7.5 0 0 1 7.4 2.7a7.5 7.5 0 1 0 9.9 9.9Z" />
            )}
          </svg>
        </button>
      </header>

      <main className="relative flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div ref={mapPanel} className="relative h-[46vh] lg:h-full">
          <TripMap
            plan={plan}
            selectedId={selectedId}
            hour={hour}
            theme={theme}
            showHeatmap={showHeatmap}
            focus={focus}
            onSelectRoute={selectRoute}
          />
          {pending && (
            <p className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold whitespace-nowrap text-surface shadow-lg">
              <span className="size-3.5 animate-spin rounded-full border-2 border-surface/40 border-t-surface" />
              Checking the forecast along each route
            </p>
          )}
        </div>
        {plan && selected && (
          <div className="border-b border-line bg-paper p-3 lg:absolute lg:inset-x-6 lg:bottom-6 lg:mx-auto lg:max-w-2xl lg:border-0 lg:bg-transparent lg:p-0">
            <ForecastScrubber
              plan={plan}
              route={selected}
              hour={hour}
              onHourChange={setHour}
              showHeatmap={showHeatmap}
              onShowHeatmapChange={setShowHeatmap}
            />
          </div>
        )}
      </main>

      <aside className="space-y-7 border-line bg-surface px-5 py-5 lg:min-h-0 lg:overflow-y-auto lg:border-r">
        {/* Hidden rather than unmounted, so the form keeps what was typed. */}
        <div hidden={!editing}>
          <TripForm
            pending={pending}
            onSubmit={handlePlan}
            onCancel={trip ? () => setEditing(false) : undefined}
          />
        </div>
        {!editing && trip && <TripSummary trip={trip} onEdit={() => setEditing(true)} />}

        {error && (
          <p
            role="alert"
            className="rounded-md bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger"
          >
            {error}
          </p>
        )}

        {plan && selected ? (
          <div className={`space-y-7 transition-opacity ${pending ? 'opacity-50' : ''}`}>
            <RouteList plan={plan} selectedId={selectedId} onSelect={selectRoute} />
            <CheckpointTable
              route={selected}
              focusedKey={focus?.key ?? null}
              onFocus={focusCheckpoint}
            />
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed text-muted">
            Compares three truck routes against the forecast for the hour you reach each stretch.
          </p>
        )}
      </aside>
    </div>
  )
}
