import * as React from "react"
import { ListChecks, Settings, Timer } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogTimeSheet } from "@/components/tray/log-time-sheet"
import { MockTrackView } from "@/components/mockup/mock-track-view"
import { MockWorklogView } from "@/components/mockup/mock-worklog-view"
import type { Ticket } from "@/data/domain"
import { MOCK_USER, WORK_LOGS } from "@/data/mock"
import { formatDuration } from "@/lib/time"

function isToday(iso: string) {
  const date = new Date(iso)
  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

export function MockTrayApp({
  onOpenSettings,
}: {
  onOpenSettings?: () => void
}) {
  const [tab, setTab] = React.useState("track")
  const [logging, setLogging] = React.useState<Ticket | null>(null)

  const handleLog = (ticket: Ticket, minutes: number, note: string) => {
    setLogging(null)
    toast.success(`Logged ${formatDuration(minutes)} · ${ticket.key}`, {
      description: note || ticket.title,
      action: { label: "Undo", onClick: () => {} },
    })
  }

  const todaysEntries = logging
    ? WORK_LOGS.filter(
        (log) => log.ticketKey === logging.key && isToday(log.startedAt)
      )
    : []
  const loggedToday = todaysEntries.reduce((sum, log) => sum + log.minutes, 0)

  return (
    <div className="relative flex h-full flex-col bg-background">
      <header className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
            {MOCK_USER.initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-tight font-semibold">
            {MOCK_USER.name}
          </span>
          <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {MOCK_USER.host}
          </span>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <Settings />
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="px-3 pt-2.5">
          <TabsList className="w-full">
            <TabsTrigger value="track">
              <Timer />
              Track
            </TabsTrigger>
            <TabsTrigger value="worklog">
              <ListChecks />
              Worklog
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="track"
          className="flex min-h-0 flex-1 flex-col data-[hidden]:hidden"
        >
          <MockTrackView onOpenTicket={setLogging} />
        </TabsContent>
        <TabsContent
          value="worklog"
          className="flex min-h-0 flex-1 flex-col data-[hidden]:hidden"
        >
          <MockWorklogView />
        </TabsContent>
      </Tabs>

      {logging ? (
        <LogTimeSheet
          ticket={logging}
          loggedToday={loggedToday}
          todaysEntries={todaysEntries}
          onClose={() => setLogging(null)}
          onLog={handleLog}
        />
      ) : null}
    </div>
  )
}
