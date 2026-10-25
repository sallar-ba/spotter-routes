import type { PlanRequest } from '../api'
import { formatTime } from '../lib/format'
import { EndpointDot } from './EndpointDot'

interface TripSummaryProps {
  trip: PlanRequest
  onEdit: () => void
}

/** The planned trip in two lines, shown in place of the form once routes are on screen. */
export function TripSummary({ trip, onEdit }: TripSummaryProps) {
  return (
    <section aria-label="Planned trip" className="flex items-start gap-3">
      <span className="flex flex-col items-center pt-1.5">
        <EndpointDot kind="origin" />
        <span className="h-5 w-0.5 bg-line" />
        <EndpointDot kind="destination" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          <span className="sr-only">From </span>
          {trip.origin.label}
          <span className="font-normal text-muted">, {trip.origin.detail}</span>
        </p>
        <p className="mt-2.5 truncate font-semibold">
          <span className="sr-only">To </span>
          {trip.destination.label}
          <span className="font-normal text-muted">, {trip.destination.detail}</span>
        </p>
        <p className="mt-3 text-sm text-muted">
          Leaves {formatTime(trip.departure)} with {trip.load_lb.toLocaleString()}&nbsp;lb, checking
          every {trip.interval_mi}&nbsp;mi
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-paper"
      >
        Edit trip
      </button>
    </section>
  )
}
