import * as React from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionLabel } from "@/components/tray/section-label"
import { projectMetaFor, type WorkLog } from "@/data/domain"
import { getDesktopBindings } from "@/desktop-bindings"
import { formatDuration, formatTimeOfDay, relativeDayLabel } from "@/lib/time"

const projectOf = (key: string) => key.split("-")[0] || "JIRA"

function groupByDay(logs: WorkLog[]) {
  const map = new Map<string, WorkLog[]>()
  for (const log of logs) {
    const label = relativeDayLabel(log.startedAt)
    const arr = map.get(label) ?? []
    arr.push(log)
    map.set(label, arr)
  }
  return [...map.entries()]
}

/**
 * Second view: a reverse-chronological worklog grouped by day. Uniform
 * two-line rows keep it calm — title + duration up top, "key · time · note"
 * underneath, with edit/delete revealed on hover.
 */
export function WorklogView({ refreshKey = 0 }: { refreshKey?: number }) {
  const desktopBindings = React.useMemo(() => getDesktopBindings(), [])
  const [logs, setLogs] = React.useState<WorkLog[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const groups = React.useMemo(() => groupByDay(logs), [logs])

  React.useEffect(() => {
    if (!desktopBindings) {
      return
    }

    let cancelled = false

    void desktopBindings
      .loadJiraWorklogs()
      .then((result) => {
        if (!cancelled) {
          setLogs(result.logs)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load Jira worklogs."
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [desktopBindings, refreshKey])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-3">
          {error ? (
            <StatusState title="Could not load worklogs" detail={error} />
          ) : null}
          {!error && loading ? <WorklogSkeleton /> : null}
          {!error && !loading && groups.length === 0 ? (
            <StatusState
              title="No tracking times found"
              detail="Jira has no worklogs by you for this month."
            />
          ) : null}
          {!error && !loading
            ? groups.map(([day, dayLogs]) => {
                const dayTotal = dayLogs.reduce((s, l) => s + l.minutes, 0)
                return (
                  <div key={day}>
                    <SectionLabel right={formatDuration(dayTotal)}>
                      {day}
                    </SectionLabel>
                    <div className="flex flex-col">
                      {dayLogs.map((log) => (
                        <WorklogRow key={log.id} log={log} />
                      ))}
                    </div>
                  </div>
                )
              })
            : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function WorklogRow({ log }: { log: WorkLog }) {
  const project = projectOf(log.ticketKey)
  const meta = projectMetaFor(project)

  return (
    <div className="group/log flex flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/70">
      {/* line 1: title + duration */}
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {log.ticketTitle}
        </span>
        <span className="shrink-0 font-mono text-xs font-semibold whitespace-nowrap tabular-nums">
          {formatDuration(log.minutes)}
        </span>
      </div>

      {/* line 2: key · time · note — actions swap in on hover */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-medium tracking-tight text-foreground/70">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: meta.tint }}
          />
          {log.ticketKey}
        </span>
        <Sep />
        <span className="shrink-0 font-mono tabular-nums">
          {formatTimeOfDay(log.startedAt)}
        </span>
        {log.description ? (
          <>
            <Sep />
            <span className="truncate">{log.description}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function StatusState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function WorklogSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 pt-4">
      <Skeleton className="mb-1 h-3 w-24" />
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg px-1 py-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-10" />
          </div>
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  )
}

function Sep() {
  return <span className="shrink-0 text-muted-foreground/40">·</span>
}
