import { Plus } from "lucide-react"

import { projectMetaFor, type Ticket } from "@/data/domain"
import { formatDuration, relativeTime } from "@/lib/time"
import { cn } from "@/lib/utils"

/**
 * A single ticket line. Uniform two-line rhythm keeps the list calm:
 *   line 1 — the title (primary, scannable)
 *   line 2 — colored key · time logged today · last worked
 * The trailing "+" opens the dedicated log-time sheet.
 */
export function TicketRow({
  ticket,
  onOpen,
  className,
}: {
  ticket: Ticket
  onOpen: (ticket: Ticket) => void
  className?: string
}) {
  const meta = projectMetaFor(ticket.project)

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className={cn(
        "group/row flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/70",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{ticket.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium tracking-tight text-foreground/70">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: meta.tint }}
            />
            {ticket.key}
          </span>
          {ticket.todayMinutes > 0 ? (
            <>
              <Sep />
              <span className="font-medium text-foreground/70">
                {formatDuration(ticket.todayMinutes)} today
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
    </button>
  )
}

function Sep() {
  return <span className="text-muted-foreground/40">·</span>
}
