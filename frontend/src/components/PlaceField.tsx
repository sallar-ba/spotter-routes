import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { searchPlaces, type Place } from '../api'
import { EndpointDot } from './EndpointDot'

interface PlaceFieldProps {
  label: string
  marker: 'origin' | 'destination'
  value: Place | null
  onChange: (place: Place | null) => void
}

const describe = (place: Place) => [place.label, place.detail].filter(Boolean).join(', ')

/** Text input with place suggestions (ARIA combobox pattern). */
export function PlaceField({ label, marker, value, onChange }: PlaceFieldProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  // Results remember their query, so a slow or failed search never shows another query's places.
  const [results, setResults] = useState<{ query: string; places: Place[] }>({
    query: '',
    places: [],
  })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const term = query.trim()
  const searching = !value && term.length >= 2
  const suggestions = searching && results.query === term ? results.places : []
  const expanded = open && suggestions.length > 0

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchPlaces(term, controller.signal)
        .then((places) => {
          setResults({ query: term, places })
          setActive(0)
        })
        .catch(() => {}) // aborted or offline: the list just stays empty
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term, searching])

  function choose(place: Place) {
    onChange(place)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent) {
    const count = suggestions.length
    if (!count) return
    if (event.key === 'ArrowDown') {
      setActive(expanded ? (active + 1) % count : 0)
      setOpen(true)
    } else if (!expanded) return
    else if (event.key === 'ArrowUp') setActive((active - 1 + count) % count)
    else if (event.key === 'Enter') choose(suggestions[active])
    else if (event.key === 'Escape') setOpen(false)
    else return
    event.preventDefault()
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-muted">
        {label}
      </label>
      <EndpointDot
        kind={marker}
        className="pointer-events-none absolute bottom-[15px] left-3.5 size-3.5"
      />
      <input
        id={id}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-list` : undefined}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        autoComplete="off"
        placeholder="City, address or place"
        value={value ? describe(value) : query}
        onChange={(event) => {
          onChange(null)
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={(event) => {
          event.target.select()
          setOpen(true)
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className="h-11 w-full truncate rounded-md border border-line bg-surface pr-3 pl-10 text-[15px] placeholder:text-muted/70 hover:border-muted/40"
      />
      {expanded && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {suggestions.map((place, index) => (
            <li
              key={`${place.lat},${place.lon}`}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault() // keep focus so the input doesn't blur first
                choose(place)
              }}
              onMouseEnter={() => setActive(index)}
              className="cursor-pointer px-3 py-2 aria-selected:bg-paper"
            >
              <span className="block font-semibold">{place.label}</span>
              <span className="block text-sm text-muted">{place.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
