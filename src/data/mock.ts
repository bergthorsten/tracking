/**
 * Mock domain data for the UI mockups.
 * Replace with real Jira API data when wiring up the Deno backend.
 */

export type ProjectKey = "PLAT" | "WEB" | "APP" | "OPS" | "DESIGN"

export type Ticket = {
  key: string
  title: string
  project: ProjectKey
  /** Minutes already logged today against this ticket. */
  todayMinutes: number
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

/** Tailwind chart tokens keyed by project, used for the ticket key chips. */
export const PROJECT_META: Record<ProjectKey, { name: string; tint: string }> = {
  PLAT: { name: "Platform", tint: "var(--chart-1)" },
  WEB: { name: "Website", tint: "var(--chart-2)" },
  APP: { name: "Mobile App", tint: "var(--chart-3)" },
  OPS: { name: "Operations", tint: "var(--chart-4)" },
  DESIGN: { name: "Design System", tint: "var(--chart-5)" },
}

const iso = (dayOffset: number, h: number, m = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - dayOffset)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export const RECENT_TICKETS: Ticket[] = [
  {
    key: "PLAT-1428",
    title: "Rework auth token refresh flow",
    project: "PLAT",
    todayMinutes: 90,
    lastWorked: iso(0, 11, 20),
  },
  {
    key: "WEB-742",
    title: "Marketing landing page hero",
    project: "WEB",
    todayMinutes: 45,
    lastWorked: iso(0, 9, 40),
  },
  {
    key: "APP-311",
    title: "Push notification permission prompt",
    project: "APP",
    todayMinutes: 0,
    lastWorked: iso(1, 16, 15),
  },
  {
    key: "DESIGN-98",
    title: "Audit spacing tokens across cards",
    project: "DESIGN",
    todayMinutes: 0,
    lastWorked: iso(1, 14, 0),
  },
  {
    key: "OPS-205",
    title: "Migrate CI runners to arm64",
    project: "OPS",
    todayMinutes: 0,
    lastWorked: iso(2, 10, 30),
  },
  {
    key: "PLAT-1390",
    title: "Rate limit the public search API",
    project: "PLAT",
    todayMinutes: 0,
    lastWorked: iso(3, 15, 45),
  },
]

/** Extra tickets that only surface through search, not in "recent". */
export const SEARCHABLE_TICKETS: Ticket[] = [
  ...RECENT_TICKETS,
  {
    key: "WEB-756",
    title: "Cookie consent banner redesign",
    project: "WEB",
    todayMinutes: 0,
    lastWorked: iso(9, 11, 0),
  },
  {
    key: "APP-284",
    title: "Offline cache invalidation bug",
    project: "APP",
    todayMinutes: 0,
    lastWorked: iso(12, 13, 30),
  },
  {
    key: "PLAT-1455",
    title: "Add tracing to the billing worker",
    project: "PLAT",
    todayMinutes: 0,
    lastWorked: iso(6, 9, 0),
  },
]

export const WORK_LOGS: WorkLog[] = [
  {
    id: "w1",
    ticketKey: "PLAT-1428",
    ticketTitle: "Rework auth token refresh flow",
    minutes: 60,
    startedAt: iso(0, 11, 20),
    description: "Paired with Sara on the refresh race condition.",
  },
  {
    id: "w2",
    ticketKey: "PLAT-1428",
    ticketTitle: "Rework auth token refresh flow",
    minutes: 30,
    startedAt: iso(0, 10, 30),
  },
  {
    id: "w3",
    ticketKey: "WEB-742",
    ticketTitle: "Marketing landing page hero",
    minutes: 45,
    startedAt: iso(0, 9, 40),
    description: "Hero copy + responsive breakpoints.",
  },
  {
    id: "w4",
    ticketKey: "APP-311",
    ticketTitle: "Push notification permission prompt",
    minutes: 120,
    startedAt: iso(1, 16, 15),
    description: "Implemented the pre-permission modal.",
  },
  {
    id: "w5",
    ticketKey: "DESIGN-98",
    ticketTitle: "Audit spacing tokens across cards",
    minutes: 75,
    startedAt: iso(1, 14, 0),
  },
  {
    id: "w6",
    ticketKey: "OPS-205",
    ticketTitle: "Migrate CI runners to arm64",
    minutes: 150,
    startedAt: iso(2, 10, 30),
    description: "Runner image builds + smoke tests green.",
  },
  {
    id: "w7",
    ticketKey: "PLAT-1390",
    ticketTitle: "Rate limit the public search API",
    minutes: 90,
    startedAt: iso(3, 15, 45),
  },
]

/** Preselected month totals for the summary footer (minutes). */
export const MONTH_TOTALS: Record<string, number> = {
  "2026-6": 1935, // July 2026 — 32h 15m
  "2026-5": 9660, // June
  "2026-4": 10230, // May
}

export const DAILY_TARGET_MINUTES = 8 * 60
export const MONTHLY_TARGET_MINUTES = 160 * 60

export const MOCK_USER = {
  name: "Alex Rún",
  email: "alex@stjornborg.is",
  initials: "AR",
  host: "stjornborg.atlassian.net",
}
