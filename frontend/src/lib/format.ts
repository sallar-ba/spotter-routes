const time = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Sat 3:40 PM" in the viewer's time zone. */
export const formatTime = (iso: string | Date) => time.format(new Date(iso))

/** "14 h 05 m" */
export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} h ${String(minutes % 60).padStart(2, '0')} m` : `${minutes} m`
}

/** "1,017 mi", "12.5 mi" */
export const formatMiles = (miles: number) =>
  `${miles.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`

/** "0.00", "0.098": precipitation at the forecast's own precision. */
export const formatInches = (inches: number) =>
  inches.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })

/** Value for <input type="datetime-local">, in local time. */
export function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
