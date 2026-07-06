import * as React from "react"
import { Clock3, Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { MonthSummary } from "@/components/tray/month-summary"
import { SectionLabel } from "@/components/tray/section-label"
import { TicketRow } from "@/components/tray/ticket-row"
import type { Ticket } from "@/data/domain"
import { getDesktopBindings } from "@/desktop-bindings"

/**
 * Primary view: search, recent tickets, and the month summary footer.
 * Tapping a row (or its "+") opens the dedicated log-time sheet in the shell.
 */
export function TrackView({
  onOpenTicket,
  refreshKey = 0,
}: {
  onOpenTicket: (ticket: Ticket) => void
  refreshKey?: number
}) {
  const [query, setQuery] = React.useState("")
  const [recentTickets, setRecentTickets] = React.useState<Ticket[]>([])
  const [searchResults, setSearchResults] = React.useState<Ticket[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const deferredQuery = React.useDeferredValue(query)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const desktopBindings = React.useMemo(() => getDesktopBindings(), [])

  const searching = query.trim().length > 0
  React.useEffect(() => {
    if (!desktopBindings) {
      return
    }

    let cancelled = false
    const timeout = window.setTimeout(
      () => {
        setLoading(true)
        setError(null)

        void desktopBindings
          .loadJiraIssues(deferredQuery.trim())
          .then((tickets) => {
            if (cancelled) {
              return
            }

            if (deferredQuery.trim()) {
              setSearchResults(tickets)
            } else {
              setRecentTickets(tickets)
            }
          })
          .catch((loadError: unknown) => {
            if (!cancelled) {
              setError(
                loadError instanceof Error
                  ? loadError.message
                  : "Could not load Jira tickets."
              )
            }
          })
          .finally(() => {
            if (!cancelled) {
              setLoading(false)
            }
          })
      },
      deferredQuery.trim() ? 250 : 0
    )

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [deferredQuery, desktopBindings, refreshKey])

  const results = searchResults
  const list = searching ? results : recentTickets

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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

      {/* List */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          <SectionLabel
            right={
              loading
                ? "Loading"
                : searching
                  ? `${results.length} found`
                  : undefined
            }
          >
            {searching ? "Search results" : "Recent tickets"}
          </SectionLabel>

          {error ? (
            <StatusState title="Could not load Jira tickets" detail={error} />
          ) : loading && list.length === 0 ? (
            <TicketListSkeleton />
          ) : list.length === 0 ? (
            <EmptyState query={query} searching={searching} />
          ) : (
            <div className="flex flex-col">
              {list.map((t) => (
                <TicketRow key={t.key} ticket={t} onOpen={onOpenTicket} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <MonthSummary refreshKey={refreshKey} />
    </div>
  )
}

function EmptyState({
  query,
  searching,
}: {
  query: string
  searching: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
        <Clock3 className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">
        {searching ? `No tickets match "${query}"` : "No recent tickets yet"}
      </p>
      <p className="text-xs text-muted-foreground">
        {searching
          ? "Try the full issue key, e.g. PLAT-1428."
          : "Jira returned no tracked or recently changed tickets."}
      </p>
    </div>
  )
}

function TicketListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2 pt-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg px-1 py-2"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="size-7 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function StatusState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-muted">
        <Clock3 className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
