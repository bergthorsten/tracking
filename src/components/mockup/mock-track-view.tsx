import * as React from "react"
import { Clock3, Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MockMonthSummary } from "@/components/mockup/mock-month-summary"
import { SectionLabel } from "@/components/tray/section-label"
import { TicketRow } from "@/components/tray/ticket-row"
import type { Ticket } from "@/data/domain"
import { RECENT_TICKETS, SEARCHABLE_TICKETS } from "@/data/mock"

export function MockTrackView({
  onOpenTicket,
}: {
  onOpenTicket: (ticket: Ticket) => void
}) {
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const searching = query.trim().length > 0
  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return SEARCHABLE_TICKETS.filter(
      (ticket) =>
        ticket.key.toLowerCase().includes(q) ||
        ticket.title.toLowerCase().includes(q)
    )
  }, [query])
  const list = searching ? results : RECENT_TICKETS

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search any ticket by key or title…"
            className="h-9 pr-8 pl-8"
          />
          {searching ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
              onClick={() => {
                setQuery("")
                inputRef.current?.focus()
              }}
            >
              <X />
            </Button>
          ) : (
            <kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              /
            </kbd>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          <SectionLabel
            right={searching ? `${results.length} found` : undefined}
          >
            {searching ? "Search results" : "Recent tickets"}
          </SectionLabel>

          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
              <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                <Clock3 className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No tickets match "{query}"</p>
              <p className="text-xs text-muted-foreground">
                Try the full issue key, e.g. PLAT-1428.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {list.map((ticket) => (
                <TicketRow
                  key={ticket.key}
                  ticket={ticket}
                  onOpen={onOpenTicket}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <MockMonthSummary />
    </div>
  )
}
