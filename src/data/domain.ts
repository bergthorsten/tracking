export type ProjectKey = string

export type Ticket = {
  key: string
  title: string
  project: ProjectKey
  /** Minutes already logged today against this ticket. */
  todayMinutes: number
  /** Total minutes logged by the current user against this ticket, when known. */
  trackedMinutes?: number
  /** ISO timestamp of the last worklog against this ticket. */
  lastWorked: string
}

export type WorkLog = {
  id: string
  ticketKey: string
  ticketTitle: string
  minutes: number
  /** ISO datetime the work was logged for. */
  startedAt: string
  description?: string
}

/** Tailwind chart tokens keyed by known project examples. */
export const PROJECT_META: Record<string, { name: string; tint: string }> = {
  PLAT: { name: "Platform", tint: "var(--chart-1)" },
  WEB: { name: "Website", tint: "var(--chart-2)" },
  APP: { name: "Mobile App", tint: "var(--chart-3)" },
  OPS: { name: "Operations", tint: "var(--chart-4)" },
  DESIGN: { name: "Design System", tint: "var(--chart-5)" },
}

export const DAILY_TARGET_MINUTES = 8 * 60
export const MONTHLY_TARGET_MINUTES = 160 * 60

export function projectMetaFor(project: string) {
  return PROJECT_META[project] ?? fallbackProjectMeta(project)
}

function fallbackProjectMeta(project: string) {
  const index =
    [...project].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5

  return {
    name: project,
    tint: `var(--chart-${index + 1})`,
  }
}
