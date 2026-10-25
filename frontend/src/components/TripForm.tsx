import { useState, type FormEvent } from 'react'
import type { Place, PlanRequest } from '../api'
import { toLocalInput } from '../lib/format'
import { PlaceField } from './PlaceField'

const INTERVALS = [10, 25, 50] as const
const DAY_MS = 86_400_000

// Default trip.
const DALLAS: Place = {
  label: 'Dallas',
  detail: 'Texas, United States',
  lat: 32.7763,
  lon: -96.7969,
}
const CHICAGO: Place = {
  label: 'Chicago',
  detail: 'Illinois, United States',
  lat: 41.8756,
  lon: -87.6244,
}

function nextHour() {
  const date = new Date()
  date.setHours(date.getHours() + 1, 0, 0, 0)
  return date
}

/** The API accepts departures from an hour ago up to 7 days out. */
function departureBounds() {
  const now = Date.now()
  return {
    min: toLocalInput(new Date(now - 3_600_000)),
    max: toLocalInput(new Date(now + 7 * DAY_MS)),
  }
}

function loadNote(load: number) {
  if (load > 40_000) return 'Over 40,000 lb: wind from 35 mph is severe, from 45 mph no travel.'
  if (load > 30_000) return 'Over 30,000 lb: wind from 45 mph is no travel.'
  return 'Standard wind limits apply at this weight.'
}

interface TripFormProps {
  pending: boolean
  onSubmit: (trip: PlanRequest) => void
  onCancel?: () => void
}

export function TripForm({ pending, onSubmit, onCancel }: TripFormProps) {
  const [origin, setOrigin] = useState<Place | null>(DALLAS)
  const [destination, setDestination] = useState<Place | null>(CHICAGO)
  const [departure, setDeparture] = useState(() => toLocalInput(nextHour()))
  const [bounds] = useState(departureBounds)
  const [load, setLoad] = useState('42000')
  const [every, setEvery] = useState<PlanRequest['interval_mi']>(25)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!origin || !destination) return
    onSubmit({
      origin,
      destination,
      departure: new Date(departure).toISOString(),
      load_lb: Number(load),
      interval_mi: every,
    })
  }

  const label = 'mb-1 block text-sm font-semibold text-muted'
  const field =
    'h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] hover:border-muted/40'

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="relative space-y-3">
        <PlaceField label="From" marker="origin" value={origin} onChange={setOrigin} />
        <PlaceField label="To" marker="destination" value={destination} onChange={setDestination} />
        <button
          type="button"
          onClick={() => {
            setOrigin(destination)
            setDestination(origin)
          }}
          aria-label="Swap origin and destination"
          className="absolute top-[70px] right-3 z-10 grid size-8 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-ink"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              d="M6 3v14m0 0-3-3m3 3 3-3M14 17V3m0 0-3 3m3-3 3 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <label htmlFor="departure" className={label}>
            Departure
          </label>
          <input
            id="departure"
            type="datetime-local"
            required
            value={departure}
            min={bounds.min}
            max={bounds.max}
            onChange={(event) => setDeparture(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="load" className={label}>
            Load weight
          </label>
          <div className="relative">
            <input
              id="load"
              type="number"
              required
              min={0}
              max={80_000}
              step={1}
              value={load}
              onChange={(event) => setLoad(event.target.value)}
              aria-describedby="load-note"
              className={`${field} pr-9`}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
              lb
            </span>
          </div>
        </div>
      </div>
      <p id="load-note" className="-mt-2 text-sm text-muted">
        {loadNote(Number(load))}
      </p>

      <fieldset>
        <legend className={label}>Check the weather every</legend>
        <div className="grid grid-cols-3 rounded-md border border-line bg-paper p-1">
          {INTERVALS.map((miles) => (
            <label
              key={miles}
              className="cursor-pointer rounded py-1.5 text-center text-[15px] font-semibold text-muted has-checked:bg-surface has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-shield"
            >
              <input
                type="radio"
                name="interval"
                value={miles}
                checked={every === miles}
                onChange={() => setEvery(miles)}
                className="sr-only"
              />
              {miles} mi
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !origin || !destination}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-shield text-base font-bold text-white shadow-sm transition-colors hover:bg-shield-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {pending ? 'Checking the forecast…' : 'Compare routes'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-md border border-line px-4 font-semibold transition-colors hover:bg-paper"
          >
            Cancel
          </button>
        )}
      </div>
      {(!origin || !destination) && (
        <p className="-mt-2 text-sm text-muted">Pick both places from the suggestions.</p>
      )}
    </form>
  )
}
