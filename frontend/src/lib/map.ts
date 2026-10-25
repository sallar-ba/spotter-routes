import type { FeatureCollection } from 'geojson'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { Heatmap, Plan, RouteOption } from '../api'
import { RISK_LEVELS } from './risk'

/** Heatmap paint for one forecast hour. Each blob covers about two grid cells, so the field stays smooth. */
export function heatmapPaint(hour: number, cellDeg: number) {
  const radiusAtZoom0 = (2.2 * cellDeg * 512) / 360 // px; the world is 512 px wide at zoom 0
  const maxRadius = 220 // px
  const fullZoom = Math.log2(maxRadius / radiusAtZoom0)
  // prettier-ignore
  return {
    // Risk 0..4 becomes weight 0.2..1, so inside the corridor each level lands on its own color.
    'heatmap-weight': ['/', ['+', ['get', `h${hour}`], 1], 5] as ExpressionSpecification,
    'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, radiusAtZoom0, fullZoom, maxRadius] as ExpressionSpecification,
    'heatmap-color': [
      'interpolate', ['linear'], ['heatmap-density'],
      0, 'rgba(47,158,95,0)',
      0.2, 'rgba(47,158,95,0.2)', // calm stretches: a faint tint so the corridor stays visible
      ...RISK_LEVELS.slice(1).flatMap(({ color }, i) => [(i + 2) / 5, color]),
    ] as ExpressionSpecification,
    'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], fullZoom, 0.7, fullZoom + 1.5, 0] as ExpressionSpecification,
  }
}

export function routeLines(plan: Plan | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (plan?.routes ?? []).map((route) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route.geometry },
      properties: { routeId: route.id },
    })),
  }
}

export function checkpointPoints(plan: Plan | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (plan?.routes ?? []).flatMap((route) =>
      route.checkpoints.map((checkpoint, index) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [checkpoint.lon, checkpoint.lat] },
        properties: { key: `${route.id}:${index}`, routeId: route.id, risk: checkpoint.risk },
      })),
    ),
  }
}

/** One point per grid cell, with its risk for every forecast hour as h0..h48. */
export function heatmapPoints(heatmap: Heatmap): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: heatmap.points.map(({ lat, lon, risk }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: Object.fromEntries(risk.map((level, hour) => [`h${hour}`, level])),
    })),
  }
}

/** Checkpoint keys look like "B:12" (route B, 13th checkpoint). */
export function findCheckpoint(plan: Plan | null, key: string | null) {
  if (!plan || !key) return undefined
  const [routeId, index] = key.split(':')
  return plan.routes.find((route) => route.id === routeId)?.checkpoints[Number(index)]
}

/** Seconds the truck has been driving at the given forecast hour. */
export function elapsedAt(plan: Plan, hour: number) {
  return (Date.parse(plan.heatmap.start) + hour * 3_600_000 - Date.parse(plan.departure)) / 1000
}

/** Where the truck is on a route after `elapsed` seconds (clamped to origin and destination). */
export function positionAt(route: RouteOption, elapsed: number): [number, number] {
  const next = route.seconds.findIndex((seconds) => seconds >= elapsed)
  if (next === 0) return route.geometry[0]
  if (next === -1) return route.geometry[route.geometry.length - 1]
  const [t0, t1] = [route.seconds[next - 1], route.seconds[next]]
  const t = (elapsed - t0) / (t1 - t0 || 1)
  const [[x0, y0], [x1, y1]] = [route.geometry[next - 1], route.geometry[next]]
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
}

/** Miles the truck has driven on a route after `elapsed` seconds, from the checkpoint ETAs. */
export function mileAt(plan: Plan, route: RouteOption, elapsed: number) {
  const departure = Date.parse(plan.departure)
  const stops = route.checkpoints.map((stop) => [
    (Date.parse(stop.eta) - departure) / 1000,
    stop.mile,
  ])
  const next = stops.findIndex(([seconds]) => seconds >= elapsed)
  if (next === 0) return 0
  if (next === -1) return route.distance_mi
  const [[t0, m0], [t1, m1]] = [stops[next - 1], stops[next]]
  return m0 + ((m1 - m0) * (elapsed - t0)) / (t1 - t0 || 1)
}
