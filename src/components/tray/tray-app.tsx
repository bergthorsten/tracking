import * as React from "react"
import { ListChecks, Settings, Timer } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TrackView } from "@/components/tray/track-view"
import { WorklogView } from "@/components/tray/worklog-view"
import { LogTimeSheet } from "@/components/tray/log-time-sheet"
import { MOCK_USER, type Ticket } from "@/data/mock"
import { formatDuration } from "@/lib/time"

/**
 * The menu-bar popover shell. Fills its window (the DeviceFrame in the mockup
 * gallery sets the fixed 400×600 size). Two views — Track & Worklog — plus the
 * dedicated log-time sheet that covers the whole popover when active.
 */
export function TrayApp({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [tab, setTab] = React.useState("track")
  const [logging, setLogging] = React.useState<Ticket | null>(null)

  const handleLog = (ticket: Ticket, minutes: number, note: string) => {
    setLogging(null)
    toast.success(`Logged ${formatDuration(minutes)} · ${ticket.key}`, {
      description: note || ticket.title,
      action: { label: "Undo", onClick: () => {} },
    })
  }

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
            {MOCK_USER.initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold leading-tight">
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

      {/* Tabs */}
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
          <TrackView onOpenTicket={setLogging} />
        </TabsContent>
        <TabsContent
          value="worklog"
          className="flex min-h-0 flex-1 flex-col data-[hidden]:hidden"
        >
          <WorklogView />
        </TabsContent>
      </Tabs>

      {/* Dedicated log-time sheet */}
      {logging ? (
        <LogTimeSheet
          ticket={logging}
          onClose={() => setLogging(null)}
          onLog={handleLog}
        />
      ) : null}
    </div>
  )
}
