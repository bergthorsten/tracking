import * as React from "react"
import { ListChecks, RefreshCw, Settings, Timer } from "lucide-react"
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
import { initialsFromName } from "@/domain/user"
import { formatDuration } from "@/lib/time"

type CurrentUser = {
  name: string
  host: string
  initials: string
  avatarUrl?: string
}

/** Quiet background sync — enough to stay current without nagging the tray. */
const AUTO_REFRESH_INTERVAL_MS = 30 * 60 * 1000

/**
 * The menu-bar popover shell. Fills its window (the DeviceFrame in the mockup
 * gallery sets the fixed 400×600 size). Two views — Track & Worklog — plus the
 * dedicated log-time sheet that covers the whole popover when active.
 */
export function TrayApp({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [tab, setTab] = React.useState("track")
  const [logging, setLogging] = React.useState<Ticket | null>(null)
  const [user, setUser] = React.useState<CurrentUser | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [submittingWorklog, setSubmittingWorklog] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<Date | null>(
    null
  )
  const refreshingRef = React.useRef(false)
  const desktopBindings = React.useMemo(() => getDesktopBindings(), [])

  React.useEffect(() => {
    let cancelled = false

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
  }, [desktopBindings])

  const refreshJiraData = React.useEffectEvent(
    async (options?: { silent?: boolean }) => {
      if (!desktopBindings || refreshingRef.current) {
        return
      }

      const silent = options?.silent ?? false
      refreshingRef.current = true
      setRefreshing(true)

      try {
        await desktopBindings.refreshJiraData()
        setLastRefreshedAt(new Date())
        React.startTransition(() => {
          setRefreshKey((key) => key + 1)
        })
        if (!silent) {
          toast.success("Jira data refreshed")
        }
      } catch (error) {
        if (!silent) {
          toast.error("Could not refresh Jira data", {
            description:
              error instanceof Error
                ? error.message
                : "Try again in a moment.",
          })
        }
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
      }
    }
  )

  React.useEffect(() => {
    if (!desktopBindings) {
      return
    }

    const intervalId = window.setInterval(() => {
      void refreshJiraData({ silent: true })
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [desktopBindings])

  const handleLog = async (
    ticket: Ticket,
    minutes: number,
    note: string,
    date: string
  ) => {
    if (!desktopBindings) {
      toast.error("Worklog was not created", {
        description: "Desktop Jira integration is unavailable.",
      })
      return
    }

    setSubmittingWorklog(true)

    try {
      const worklog = await desktopBindings.createJiraWorklog({
        issueKey: ticket.key,
        ticketTitle: ticket.title,
        minutes,
        date,
        note,
      })

      toast.success("Worklog created", {
        description: `${formatDuration(worklog.minutes)} · ${worklog.ticketKey}`,
      })
      setLogging(null)
      React.startTransition(() => {
        setRefreshKey((key) => key + 1)
      })
    } catch (error) {
      toast.error("Worklog was not created", {
        description:
          error instanceof Error ? error.message : "Could not create worklog.",
      })
    } finally {
      setSubmittingWorklog(false)
    }
  }

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-2.5 border-b px-3 py-2.5">
        {user ? <UserHeader user={user} /> : <HeaderSkeleton />}
        {lastRefreshedAt ? (
          <span className="text-[10px] whitespace-nowrap text-muted-foreground">
            {lastRefreshedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh Jira data"
          disabled={refreshing || !desktopBindings}
          onClick={() => void refreshJiraData()}
        >
          <RefreshCw className={refreshing ? "animate-spin" : undefined} />
        </Button>
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
          <TrackView
            onOpenTicket={setLogging}
            jiraHost={user?.host}
            refreshKey={refreshKey}
          />
        </TabsContent>
        <TabsContent
          value="worklog"
          className="flex min-h-0 flex-1 flex-col data-[hidden]:hidden"
        >
          <WorklogView jiraHost={user?.host} refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>

      {/* Dedicated log-time sheet */}
      {logging ? (
        <LogTimeSheet
          ticket={logging}
          loggedToday={logging.todayMinutes}
          onClose={() => setLogging(null)}
          onLog={handleLog}
          submitting={submittingWorklog}
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
