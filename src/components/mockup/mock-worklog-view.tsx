import * as React from "react"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SectionLabel } from "@/components/tray/section-label"
import { projectMetaFor, type WorkLog } from "@/data/domain"
import { MOCK_USER, WORK_LOGS } from "@/data/mock"
import { projectKeyFromIssueKey } from "@/domain/jira"
import { groupWorklogsByDay } from "@/domain/time-tracking"
import { formatDuration, formatTimeOfDay } from "@/lib/time"

export function MockWorklogView() {
  const [logs, setLogs] = React.useState(WORK_LOGS)
  const groups = React.useMemo(() => groupWorklogsByDay(logs), [logs])

  const remove = (log: WorkLog) => {
    setLogs((prev) => prev.filter((item) => item.id !== log.id))
    toast(`Deleted ${formatDuration(log.minutes)} · ${log.ticketKey}`, {
      action: {
        label: "Undo",
        onClick: () => setLogs((prev) => [log, ...prev]),
      },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-3">
          {groups.map(([day, dayLogs]) => {
            const dayTotal = dayLogs.reduce((sum, log) => sum + log.minutes, 0)
            return (
              <div key={day}>
                <SectionLabel right={formatDuration(dayTotal)}>
                  {day}
                </SectionLabel>
                <div className="flex flex-col">
                  {dayLogs.map((log) => (
                    <MockWorklogRow
                      key={log.id}
                      log={log}
                      onDelete={remove}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

function MockWorklogRow({
  log,
  onDelete,
}: {
  log: WorkLog
  onDelete: (log: WorkLog) => void
}) {
  const meta = projectMetaFor(projectKeyFromIssueKey(log.ticketKey))
  const jiraUrl = `https://${MOCK_USER.host}/browse/${encodeURIComponent(log.ticketKey)}`

  return (
    <div className="group/log flex flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/70">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {log.ticketTitle}
        </span>
        <span className="shrink-0 font-mono text-xs font-semibold whitespace-nowrap tabular-nums">
          {formatDuration(log.minutes)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <a
          href={jiraUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm font-mono text-[11px] font-medium tracking-tight text-foreground/70 underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <TicketDot tint={meta.tint} />
          {log.ticketKey}
        </a>
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

        <div className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover/log:opacity-100 focus-within:opacity-100">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Edit worklog"
            onClick={() => toast("Edit worklog (mock)")}
          >
            <Pencil />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Delete worklog"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(log)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  )
}

function TicketDot({ tint }: { tint: string }) {
  return (
    <span
      aria-hidden
      className="size-1.5 rounded-full"
      style={{ backgroundColor: tint }}
    />
  )
}

function Sep() {
  return <span className="shrink-0 text-muted-foreground/40">·</span>
}
