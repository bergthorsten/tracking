/**
 * Time helpers for the Jira time-tracking app.
 * Tracking granularity is 15 minutes ("quarter") everywhere.
 */

export const STEP_MINUTES = 15

/** Round any minute value to the nearest 15-minute quarter. */
export function roundToStep(minutes: number): number {
  return Math.max(0, Math.round(minutes / STEP_MINUTES) * STEP_MINUTES)
}

/** "1h 30m" · "45m" · "2h" · "0m" */
export function formatDuration(minutes: number): string {
  if (!minutes) return "0m"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/** Compact "1:30" style used in tight steppers. */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, "0")}`
}

/** "09:45" time-of-day from an ISO string. */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Human day label relative to today: "Today", "Yesterday", or "Mon, 6 Jul". */
export function relativeDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return d.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

/** "just now", "12m ago", "3h ago", "2d ago" */
export function relativeTime(iso: string, now = new Date()): string {
  const diffMin = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString([], {
    month: "long",
    year: "numeric",
  })
}
