import { Plus } from "lucide-react"

import { projectMetaFor, type Ticket } from "@/data/domain"
import { formatDuration, relativeTime } from "@/lib/time"
import { cn } from "@/lib/utils"

/**
 * A single ticket line. Uniform two-line rhythm keeps the list calm:
 *   line 1 — the title (primary, scannable)
 *   line 2 — colored key · tracked time · last worked
 * The trailing "+" opens the dedicated log-time sheet.
 */
export function TicketRow({
  ticket,
  onOpen,
  jiraHost,
  className,
}: {
  ticket: Ticket
  onOpen: (ticket: Ticket) => void
  jiraHost?: string
  className?: string
}) {
  const meta = projectMetaFor(ticket.project)
  const jiraUrl = jiraHost
    ? `https://${jiraHost}/browse/${encodeURIComponent(ticket.key)}`
    : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(ticket)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen(ticket)
        }
      }}
      className={cn(
        "group/row flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{ticket.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {jiraUrl ? (
            <a
              href={jiraUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-sm font-mono text-[11px] font-medium tracking-tight text-foreground/70 underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <TicketDot tint={meta.tint} />
              {ticket.key}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium tracking-tight text-foreground/70">
              <TicketDot tint={meta.tint} />
              {ticket.key}
            </span>
          )}
          {(ticket.trackedMinutes ?? 0) > 0 ? (
            <>
              <Sep />
              <span
                className="font-medium text-foreground/70"
                title={
                  ticket.todayMinutes > 0
                    ? `${formatDuration(ticket.todayMinutes)} logged today`
                    : undefined
                }
              >
                {formatDuration(ticket.trackedMinutes ?? 0)} tracked
              </span>
            </>
          ) : null}
          <Sep />
          <span className="truncate">{relativeTime(ticket.lastWorked)}</span>
        </span>
      </div>

      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover/row:bg-primary group-hover/row:text-primary-foreground"
      >
        <Plus className="size-4" />
      </span>
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
  return <span className="text-muted-foreground/40">·</span>
}
