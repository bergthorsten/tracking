import * as React from "react"
import { ListChecks, Settings, Timer } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { TrackView } from "@/components/tray/track-view"
import { WorklogView } from "@/components/tray/worklog-view"
import { LogTimeSheet } from "@/components/tray/log-time-sheet"
import type { Ticket } from "@/data/domain"
import { getDesktopBindings, type SavedJiraSettings } from "@/desktop-bindings"
import { formatDuration } from "@/lib/time"

type CurrentUser = {
  name: string
  host: string
  initials: string
  avatarUrl?: string
}

/**
 * The menu-bar popover shell. Fills its window (the DeviceFrame in the mockup
 * gallery sets the fixed 400×600 size). Two views — Track & Worklog — plus the
 * dedicated log-time sheet that covers the whole popover when active.
 */
export function TrayApp({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [tab, setTab] = React.useState("track")
  const [logging, setLogging] = React.useState<Ticket | null>(null)
  const [user, setUser] = React.useState<CurrentUser | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const desktopBindings = getDesktopBindings()

    if (!desktopBindings) {
      return
    }

    void desktopBindings
      .loadJiraProfile()
      .catch(() => desktopBindings.loadJiraSettings())
      .then((settings) => {
        if (!cancelled && settings) {
          setUser(userFromSettings(settings))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

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
        {user ? <UserHeader user={user} /> : <HeaderSkeleton />}
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
          loggedToday={logging.todayMinutes}
          onClose={() => setLogging(null)}
          onLog={handleLog}
        />
      ) : null}
    </div>
  )
}

function UserHeader({ user }: { user: CurrentUser }) {
  return (
    <>
      <Avatar className="size-7">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
          {user.initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-tight font-semibold">
          {user.name}
        </span>
        <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {user.host}
        </span>
      </div>
    </>
  )
}

function HeaderSkeleton() {
  return (
    <>
      <Skeleton className="size-7 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-2.5 w-40" />
      </div>
    </>
  )
}

function userFromSettings(settings: SavedJiraSettings): CurrentUser {
  const name = settings.displayName || settings.email

  return {
    name,
    host: settings.host,
    initials: initialsFromName(name),
    avatarUrl: settings.avatarUrl,
  }
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials =
    parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)

  return initials.toUpperCase()
}
