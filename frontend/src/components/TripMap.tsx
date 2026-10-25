import { setWorkerUrl, type ExpressionSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  AttributionControl,
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type { Plan } from '../api'
import type { Theme } from '../lib/theme'
import { formatInches, formatTime } from '../lib/format'
import {
  checkpointPoints,
  elapsedAt,
  findCheckpoint,
  heatmapPaint,
  heatmapPoints,
  positionAt,
  routeLines,
} from '../lib/map'
import { riskColor, riskColorExpression, riskLabel } from '../lib/risk'
import { EndpointDot } from './EndpointDot'
import { Shield } from './Shield'

// MapLibre looks for its worker next to its own file, which the bundler moves. Point to it directly.
setWorkerUrl(workerUrl)

const BASEMAPS = {
  light: {
    style: 'https://tiles.openfreemap.org/styles/positron',
    line: '#1d4f91',
    outline: '#ffffff',
  },
  dark: { style: 'https://tiles.openfreemap.org/styles/dark', line: '#5b8fd8', outline: '#0c0c0c' },
}
const US_VIEW = { longitude: -96, latitude: 38.5, zoom: 3.6 }
const IDLE_LINE = '#8d99a5'

interface TripMapProps {
  plan: Plan | null
  selectedId: string
  hour: number
  theme: Theme
  showHeatmap: boolean
  focus: { key: string } | null
  onSelectRoute: (id: string) => void
}

export function TripMap({
  plan,
  selectedId,
  hour,
  theme,
  showHeatmap,
  focus,
  onSelectRoute,
}: TripMapProps) {
  const mapRef = useRef<MapRef>(null)
  const [labelLayerId, setLabelLayerId] = useState<string>()
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [pointer, setPointer] = useState(false)

  const routes = useMemo(() => routeLines(plan), [plan])
  const checkpoints = useMemo(() => checkpointPoints(plan), [plan])
  const weather = useMemo(() => plan && heatmapPoints(plan.heatmap), [plan])
  const selected = plan?.routes.find((route) => route.id === selectedId)
  const isSelected: ExpressionSpecification = ['==', ['get', 'routeId'], selectedId]
  const basemap = BASEMAPS[theme]

  // Frame all routes whenever a new plan arrives.
  useEffect(() => {
    if (!plan) return
    const coords = plan.routes.flatMap((route) => route.geometry)
    const lons = coords.map(([lon]) => lon)
    const lats = coords.map(([, lat]) => lat)
    mapRef.current?.fitBounds(
      [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      {
        padding: { top: 60, right: 60, bottom: isDesktop() ? 230 : 40, left: 60 },
        duration: animation(900),
      },
    )
  }, [plan])

  // Fly to a checkpoint picked from the table.
  useEffect(() => {
    const checkpoint = findCheckpoint(plan, focus?.key ?? null)
    const map = mapRef.current
    if (!checkpoint || !map) return
    map.flyTo({
      center: [checkpoint.lon, checkpoint.lat],
      zoom: Math.max(map.getZoom(), 7),
      duration: animation(700),
    })
  }, [plan, focus])

  const popupKey = hoveredKey ?? focus?.key ?? null
  const popup = findCheckpoint(plan, popupKey)
  const truck = plan && selected && positionAt(selected, elapsedAt(plan, hour))

  function handleMouseMove(event: MapLayerMouseEvent) {
    const feature = event.features?.[0]
    setPointer(Boolean(feature))
    setHoveredKey(feature?.layer.id === 'checkpoints' ? (feature.properties.key as string) : null)
  }

  function handleClick(event: MapLayerMouseEvent) {
    const routeId = event.features?.[0]?.properties.routeId
    if (routeId) onSelectRoute(routeId as string)
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={US_VIEW}
      mapStyle={basemap.style}
      interactiveLayerIds={plan ? ['checkpoints', 'route-hit-area'] : []}
      cursor={pointer ? 'pointer' : undefined}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredKey(null)}
      onClick={handleClick}
      onStyleData={(event) => {
        const map = event.target
        // Draw the weather layer under the map's labels (re-found when the basemap changes).
        setLabelLayerId(map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id)
        // The dark basemap names a few icons its sprite lacks; a blank image keeps the console clean.
        map.setMissingStyleImageResolver((id) => {
          if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) })
        })
      }}
      attributionControl={false}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <AttributionControl position="top-left" compact />

      {weather && plan && (
        <Source id="weather" type="geojson" data={weather}>
          <Layer
            id="weather-heat"
            type="heatmap"
            beforeId={labelLayerId}
            layout={{ visibility: showHeatmap ? 'visible' : 'none' }}
            paint={heatmapPaint(Math.floor(hour), plan.heatmap.cell_deg)}
          />
        </Source>
      )}

      <Source id="routes" type="geojson" data={routes}>
        <Layer
          id="route-casing"
          type="line"
          layout={{
            'line-join': 'round',
            'line-cap': 'round',
            'line-sort-key': ['case', isSelected, 1, 0],
          }}
          paint={{ 'line-color': basemap.outline, 'line-width': ['case', isSelected, 9, 6] }}
        />
        <Layer
          id="route-lines"
          type="line"
          layout={{
            'line-join': 'round',
            'line-cap': 'round',
            'line-sort-key': ['case', isSelected, 1, 0],
          }}
          paint={{
            'line-color': ['case', isSelected, basemap.line, IDLE_LINE],
            'line-width': ['case', isSelected, 5, 3.5],
          }}
        />
        {/* Wide invisible line so routes are easy to click. */}
        <Layer
          id="route-hit-area"
          type="line"
          paint={{ 'line-color': '#000', 'line-opacity': 0, 'line-width': 16 }}
        />
      </Source>

      <Source id="checkpoints" type="geojson" data={checkpoints}>
        <Layer
          id="checkpoints"
          type="circle"
          layout={{ 'circle-sort-key': ['case', isSelected, 1, 0] }}
          paint={{
            'circle-color': riskColorExpression(['get', 'risk']),
            'circle-radius': ['case', isSelected, 6, 3.5],
            'circle-stroke-color': basemap.outline,
            'circle-stroke-width': ['case', isSelected, 2, 1],
            'circle-opacity': ['case', isSelected, 1, 0.75],
          }}
        />
      </Source>

      {plan?.routes.map((route, index) => {
        // Spread the shields along their routes so overlapping routes don't stack them.
        const [lon, lat] = route.geometry[Math.floor(route.geometry.length * (0.35 + index * 0.15))]
        return (
          <Marker
            key={route.id}
            longitude={lon}
            latitude={lat}
            onClick={(event) => {
              event.originalEvent.stopPropagation() // the map's own click would pick the line underneath
              onSelectRoute(route.id)
            }}
          >
            <button
              type="button"
              aria-label={`Select route ${route.id}`}
              className="block drop-shadow-md"
            >
              <Shield label={route.id} muted={route.id !== selectedId} className="size-8" />
            </button>
          </Marker>
        )
      })}

      {selected && (
        <>
          <Endpoint coordinate={selected.geometry[0]} kind="origin" />
          <Endpoint
            coordinate={selected.geometry[selected.geometry.length - 1]}
            kind="destination"
          />
        </>
      )}

      {truck && (
        <Marker longitude={truck[0]} latitude={truck[1]}>
          <span
            role="img"
            aria-label="Truck position at the selected forecast hour"
            className="grid size-8 place-items-center rounded-full border-2 border-surface bg-ink text-surface shadow-lg"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
              <path d="M2 6h11v9H2zM14 9h4l3 3.5V15h-7zM6 18.5a2 2 0 1 0 0-.01zM17 18.5a2 2 0 1 0 0-.01z" />
            </svg>
          </span>
        </Marker>
      )}

      {popup && (
        <Popup
          longitude={popup.lon}
          latitude={popup.lat}
          closeButton={false}
          closeOnClick={false}
          offset={12}
          maxWidth="280px"
        >
          <div className="w-64 px-3 py-2.5 text-sm text-ink">
            <p className="font-bold">
              Mile {Math.round(popup.mile)} on route {popupKey?.split(':')[0]}
            </p>
            <p className="text-muted">Arrives {formatTime(popup.eta)}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 border-y border-line py-2">
              {[
                ['Wind', `${popup.wind_mph} mph`],
                ['Rain', `${formatInches(popup.rain_in_hr)} in/h`],
                ['Snow', `${formatInches(popup.snow_in_hr)} in/h`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="font-semibold whitespace-nowrap">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 flex items-center gap-1.5 font-semibold">
              <span
                className="size-2.5 rounded-full"
                style={{ background: riskColor(popup.risk) }}
              />
              {riskLabel(popup.risk)} risk{popup.factor && ` from ${popup.factor}`}
            </p>
          </div>
        </Popup>
      )}
    </Map>
  )
}

// On desktop the forecast card floats over the bottom of the map.
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches

const animation = (ms: number) =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms

function Endpoint({
  coordinate,
  kind,
}: {
  coordinate: [number, number]
  kind: 'origin' | 'destination'
}) {
  return (
    <Marker longitude={coordinate[0]} latitude={coordinate[1]}>
      <span
        role="img"
        aria-label={kind === 'origin' ? 'Origin' : 'Destination'}
        className="block drop-shadow"
      >
        <EndpointDot kind={kind} className="size-4" />
      </span>
    </Marker>
  )
}
