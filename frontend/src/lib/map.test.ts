import { describe, expect, it } from 'vitest'
import type { Plan, RouteOption } from '../api'
import { elapsedAt, findCheckpoint, heatmapPoints, mileAt, positionAt, stopPoint } from './map'

const route = {
  id: 'A',
  geometry: [
    [0, 0],
    [1, 0],
    [3, 0],
  ],
  seconds: [0, 100, 300],
  checkpoints: [{ mile: 0 }, { mile: 25 }],
} as unknown as RouteOption

const plan = {
  departure: '2030-01-01T10:30:00Z',
  heatmap: { start: '2030-01-01T10:00:00Z', cell_deg: 0.5, points: [] },
  routes: [route],
} as unknown as Plan

describe('positionAt', () => {
  it('interpolates between vertices by drive time', () => {
    expect(positionAt(route, 50)).toEqual([0.5, 0])
    expect(positionAt(route, 200)).toEqual([2, 0])
  })

  it('stays at the origin before departure and at the destination after arrival', () => {
    expect(positionAt(route, -600)).toEqual([0, 0])
    expect(positionAt(route, 9999)).toEqual([3, 0])
  })
})

describe('elapsedAt', () => {
  it('counts forecast hours from the departure hour, not the departure minute', () => {
    expect(elapsedAt(plan, 0)).toBe(-1800)
    expect(elapsedAt(plan, 2)).toBe(5400)
  })
})

describe('findCheckpoint', () => {
  it('resolves a "route:index" key', () => {
    expect(findCheckpoint(plan, 'A:1')).toEqual({ mile: 25 })
    expect(findCheckpoint(plan, 'B:0')).toBeUndefined()
    expect(findCheckpoint(plan, null)).toBeUndefined()
  })
})

describe('heatmapPoints', () => {
  it('stores each forecast hour as its own property', () => {
    const points = heatmapPoints({
      start: '',
      cell_deg: 0.5,
      points: [{ lat: 1, lon: 2, risk: [0, 3] }],
    })
    expect(points.features[0].geometry).toEqual({ type: 'Point', coordinates: [2, 1] })
    expect(points.features[0].properties).toEqual({ h0: 0, h1: 3 })
  })
})

describe('mileAt', () => {
  const trip = {
    departure: '2030-01-01T10:00:00Z',
    routes: [],
  } as unknown as Plan
  const leg = {
    distance_mi: 50,
    checkpoints: [
      { mile: 0, eta: '2030-01-01T10:00:00Z' },
      { mile: 50, eta: '2030-01-01T11:00:00Z' },
    ],
  } as unknown as RouteOption

  it('interpolates between checkpoint arrival times', () => {
    expect(mileAt(trip, leg, 1800)).toBe(25)
  })

  it('stays at 0 before departure and at the full distance after arrival', () => {
    expect(mileAt(trip, leg, -60)).toBe(0)
    expect(mileAt(trip, leg, 7200)).toBe(50)
  })
})

describe('stopPoint', () => {
  const trip = { departure: '2030-01-01T10:00:00Z', routes: [] } as unknown as Plan
  const checkpoint = (mile: number, hour: number, risk: number) => ({
    mile,
    risk,
    eta: `2030-01-01T1${hour}:00:00Z`,
  })

  it('stops at the last checkpoint before the first no-travel one', () => {
    const leg = {
      checkpoints: [
        checkpoint(0, 0, 0),
        checkpoint(25, 1, 1),
        checkpoint(50, 2, 4),
        checkpoint(75, 3, 4),
      ],
    } as unknown as RouteOption
    expect(stopPoint(trip, leg)).toEqual({ mile: 25, elapsed: 3600, blockedMile: 50 })
  })

  it('returns null for a drivable route', () => {
    const leg = {
      checkpoints: [checkpoint(0, 0, 0), checkpoint(25, 1, 3)],
    } as unknown as RouteOption
    expect(stopPoint(trip, leg)).toBeNull()
  })
})
