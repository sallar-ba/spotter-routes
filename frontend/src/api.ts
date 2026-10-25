/** 0 Low, 1 Moderate, 2 High, 3 Severe, 4 No Travel */
export type RiskLevel = 0 | 1 | 2 | 3 | 4

export interface Place {
  label: string
  detail: string
  lat: number
  lon: number
}

export interface Checkpoint {
  mile: number
  lat: number
  lon: number
  eta: string
  risk: RiskLevel
  factor: 'wind' | 'rain' | 'snow' | null
  wind_mph: number
  rain_in_hr: number
  snow_in_hr: number
}

export interface RouteOption {
  id: string
  name: string
  rank: number
  distance_mi: number
  duration_s: number
  arrival: string
  miles_by_risk: number[]
  average_risk: number
  geometry: [number, number][]
  seconds: number[]
  checkpoints: Checkpoint[]
}

export interface Heatmap {
  start: string
  cell_deg: number
  points: { lat: number; lon: number; risk: RiskLevel[] }[]
}

export interface Plan {
  departure: string
  recommended: string
  reason: string
  routes: RouteOption[]
  heatmap: Heatmap
}

export interface PlanRequest {
  origin: Place
  destination: Place
  departure: string
  load_lb: number
  interval_mi: 10 | 25 | 50
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  return request(`/api/places?q=${encodeURIComponent(query)}`, { signal })
}

export async function planTrip(trip: PlanRequest): Promise<Plan> {
  return request('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trip),
  })
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, init).catch(() => null) // offline or aborted
  const body = await response?.json().catch(() => null)
  if (!response?.ok || body == null) throw new Error(errorMessage(body))
  return body as T
}

/** DRF errors are either `{detail: "..."}` or `{field: ["..."]}`. */
function errorMessage(body: unknown): string {
  if (!body || typeof body !== 'object') return 'The server could not be reached. Try again.'
  if ('detail' in body) return String(body.detail)
  return Object.values(body).flat().map(String).join(' ')
}
