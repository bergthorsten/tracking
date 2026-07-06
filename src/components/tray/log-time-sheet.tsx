import * as React from "react"
import { Check, Minus, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PROJECT_META, WORK_LOGS, type Ticket } from "@/data/mock"
import {
  formatDuration,
  formatTimeOfDay,
  STEP_MINUTES,
} from "@/lib/time"
import { cn } from "@/lib/utils"

const PRESETS = [15, 30, 45, 60, 120]

function isToday(iso: string) {
  const d = new Date(iso)
  const n = new Date()
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}

/**
 * Full-cover, in-popover sheet for logging time against one ticket.
 * Stays inside the 400px window (unlike a viewport-fixed dialog), so it works
 * identically in the mockup and the real menu-bar app.
 */
export function LogTimeSheet({
  ticket,
  onClose,
  onLog,
}: {
  ticket: Ticket
  onClose: () => void
  onLog: (ticket: Ticket, minutes: number, note: string) => void
}) {
  const [minutes, setMinutes] = React.useState(STEP_MINUTES)
  const [note, setNote] = React.useState("")
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )

  const meta = PROJECT_META[ticket.project]
  const todaysEntries = WORK_LOGS.filter(
    (l) => l.ticketKey === ticket.key && isToday(l.startedAt)
  )
  const loggedToday = todaysEntries.reduce((s, l) => s + l.minutes, 0)

  const bump = (d: number) =>
    setMinutes((m) => Math.min(8 * 60, Math.max(0, m + d)))

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-background duration-150 animate-in fade-in-0 slide-in-from-bottom-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && minutes > 0)
          onLog(ticket, minutes, note)
      }}
    >
      {/* header */}
      <header className="flex items-center gap-1.5 border-b px-2 py-2.5">
        <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
        <h2 className="text-sm font-semibold">Log time</h2>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-4">
          {/* ticket identity */}
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-1 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: meta.tint }}
            />
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-medium tracking-tight text-muted-foreground">
                {ticket.key} · {meta.name}
              </p>
              <p className="text-sm font-medium leading-snug">{ticket.title}</p>
            </div>
          </div>

          {/* duration hero */}
          <div className="flex flex-col items-center gap-3.5">
            <div className="flex items-center gap-5">
              <Button
                size="icon-lg"
                variant="outline"
                aria-label="Subtract 15 minutes"
                className="size-10 rounded-full"
                onClick={() => bump(-STEP_MINUTES)}
                disabled={minutes <= 0}
              >
                <Minus />
              </Button>
              <span className="w-28 text-center font-mono text-3xl font-semibold tracking-tight tabular-nums">
                {formatDuration(minutes)}
              </span>
              <Button
                size="icon-lg"
                variant="outline"
                aria-label="Add 15 minutes"
                className="size-10 rounded-full"
                onClick={() => bump(STEP_MINUTES)}
              >
                <Plus />
              </Button>
            </div>

            <div className="flex flex-wrap justify-center gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMinutes(p)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    minutes === p
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {formatDuration(p)}
                </button>
              ))}
            </div>
          </div>

          {/* note + date */}
          <div className="flex flex-col gap-2.5">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="h-9"
            />
            <div className="flex items-center justify-between rounded-lg border bg-card/40 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Date</span>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-7 w-[8.5rem] border-0 bg-transparent px-0 text-right font-mono text-xs shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* already logged today */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Logged today
              </span>
              <span className="font-mono text-xs font-medium tabular-nums">
                {formatDuration(loggedToday)}
              </span>
            </div>
            {todaysEntries.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2.5 text-center text-xs text-muted-foreground">
                Nothing logged on this ticket today yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                {todaysEntries.map((l, i) => (
                  <div
                    key={l.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm",
                      i > 0 && "border-t"
                    )}
                  >
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatTimeOfDay(l.startedAt)}
                    </span>
                    <span className="flex-1 truncate text-xs text-muted-foreground">
                      {l.description ?? "No note"}
                    </span>
                    <span className="font-mono text-xs font-medium tabular-nums">
                      {formatDuration(l.minutes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* footer */}
      <div className="border-t p-3">
        <Button
          size="lg"
          className="w-full"
          disabled={minutes <= 0}
          onClick={() => onLog(ticket, minutes, note)}
        >
          <Check /> Log {formatDuration(minutes)}
        </Button>
      </div>
    </div>
  )
}
