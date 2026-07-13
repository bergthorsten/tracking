import * as React from "react"
import {
  ChevronLeft,
  LogOut,
  Monitor,
  Moon,
  Rocket,
  Sun,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { useTheme } from "@/components/theme-provider"
import {
  getDesktopBindings,
  type AppReminder,
  type AppSettingsInput,
  type PublicAppSettings,
  type SavedJiraSettings,
} from "@/desktop-bindings"
import { initialsFromName } from "@/domain/user"
import { cn } from "@/lib/utils"

type ConnectionUser = {
  email: string
  host: string
  initials: string
  avatarUrl?: string
}

/** Settings surface: connection, reminders, and preferences. */
export function SettingsScreen({
  onBack,
  onDisconnected,
}: {
  onBack?: () => void
  onDisconnected?: () => void
}) {
  const [user, setUser] = React.useState<ConnectionUser | null>(null)
  const [appSettings, setAppSettings] =
    React.useState<PublicAppSettings | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)
  const settingsSaveVersion = React.useRef(0)

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
          setUser(connectionUserFromSettings(settings))
        }
      })

    void desktopBindings.loadAppSettings().then((settings) => {
      if (!cancelled) {
        setAppSettings(settings)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const saveAppSettings = async (next: AppSettingsInput) => {
    const desktopBindings = getDesktopBindings()
    const saveVersion = ++settingsSaveVersion.current

    if (!desktopBindings) {
      return
    }

    setSaving(true)

    try {
      const saved = await desktopBindings.saveAppSettings(next)
      if (saveVersion === settingsSaveVersion.current) {
        setAppSettings(saved)
      }
    } catch (error) {
      toast.error("Settings were not saved", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (saveVersion === settingsSaveVersion.current) {
        setSaving(false)
      }
    }
  }

  const updateAppSettings = (patch: Partial<AppSettingsInput>) => {
    if (!appSettings) {
      return
    }

    setAppSettings((current) => (current ? { ...current, ...patch } : current))
    void saveAppSettings(patch)
  }

  const toggleNotifications = async (enabled: boolean) => {
    const desktopBindings = getDesktopBindings()

    if (enabled && desktopBindings) {
      setSaving(true)

      try {
        const status = await desktopBindings.requestNotificationPermission()

        if (status.permission !== "granted") {
          toast.error("Notifications are not enabled", {
            description:
              status.message || "Allow notifications in system settings.",
          })
          return
        }

        updateAppSettings({ notificationsEnabled: true })
      } catch (error) {
        toast.error("Notifications are not enabled", {
          description: error instanceof Error ? error.message : String(error),
        })
      } finally {
        setSaving(false)
      }
      return
    }

    updateAppSettings({ notificationsEnabled: false })
  }

  const toggleLaunchAtLogin = async (enabled: boolean) => {
    const desktopBindings = getDesktopBindings()

    if (!desktopBindings) {
      return
    }

    setSaving(true)

    try {
      const status = await desktopBindings.setLaunchAtLogin(enabled)
      setAppSettings((current) =>
        current
          ? {
              ...current,
              launchAtLogin: status.enabled === true,
              native: { ...current.native, launchAtLogin: status },
            }
          : current
      )
    } catch (error) {
      toast.error("Launch at login was not updated", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    const desktopBindings = getDesktopBindings()

    if (!desktopBindings) {
      return
    }

    setDisconnecting(true)

    try {
      await desktopBindings.disconnectJira()
      toast.success("Jira disconnected")
      onDisconnected?.()
    } catch (error) {
      toast.error("Jira was not disconnected", {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-1.5 border-b px-2 py-2.5">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Back"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Connection */}
          <section className="flex flex-col gap-2">
            <SectionTitle>Jira connection</SectionTitle>
            <div className="flex items-center gap-2.5 rounded-lg border bg-card/40 p-2.5">
              {user ? (
                <ConnectionCard
                  user={user}
                  disconnecting={disconnecting}
                  onDisconnect={disconnect}
                />
              ) : (
                <ConnectionSkeleton />
              )}
            </div>
          </section>

          <Separator />

          {/* Reminders */}
          <section>
            {appSettings ? (
              <NotificationSettings
                enabled={appSettings.notificationsEnabled}
                remindersEnabled={appSettings.remindersEnabled}
                reminders={appSettings.reminders}
                notificationStatus={appSettings.native.notifications}
                saving={saving}
                onToggleNotifications={toggleNotifications}
                onToggleReminders={(remindersEnabled) =>
                  updateAppSettings({ remindersEnabled })
                }
                onChangeReminders={(reminders: AppReminder[]) =>
                  updateAppSettings({ reminders })
                }
              />
            ) : (
              <ConnectionSkeleton />
            )}
          </section>

          <Separator />

          {/* Preferences */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Preferences</SectionTitle>

            <ThemeRow />

            <Row
              icon={<Rocket className="size-4 text-muted-foreground" />}
              title="Launch at login"
              subtitle={
                appSettings?.native.launchAtLogin.supported === false
                  ? appSettings.native.launchAtLogin.message
                  : "Open automatically after signing in"
              }
            >
              <Switch
                checked={appSettings?.native.launchAtLogin.enabled === true}
                disabled={
                  saving ||
                  appSettings?.native.launchAtLogin.supported === false
                }
                onCheckedChange={toggleLaunchAtLogin}
              />
            </Row>
          </section>

          <p className="pt-1 text-center text-[11px] text-muted-foreground">
            Jira Time Tracker · v0.0.2
          </p>
        </div>
      </ScrollArea>
    </div>
  )
}

function ConnectionCard({
  user,
  disconnecting,
  onDisconnect,
}: {
  user: ConnectionUser
  disconnecting?: boolean
  onDisconnect: () => void
}) {
  return (
    <>
      <Avatar className="size-8">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
          {user.initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{user.email}</span>
        <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Connected · {user.host}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={disconnecting}
        onClick={onDisconnect}
      >
        <LogOut /> Disconnect
      </Button>
    </>
  )
}

function ConnectionSkeleton() {
  return (
    <>
      <Skeleton className="size-8 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-2.5 w-44" />
      </div>
      <Skeleton className="h-8 w-20" />
    </>
  )
}

function connectionUserFromSettings(
  settings: SavedJiraSettings
): ConnectionUser {
  const name = settings.displayName || settings.email

  return {
    email: settings.email,
    host: settings.host,
    initials: initialsFromName(name),
    avatarUrl: settings.avatarUrl,
  }
}

function ThemeRow() {
  const { theme, setTheme } = useTheme()
  const options = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "system", icon: Monitor },
  ] as const
  return (
    <Row title="Appearance" subtitle="Match your workflow">
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {options.map(({ value, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={value}
            onClick={() => setTheme(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md transition-colors",
              theme === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
    </Row>
  )
}

function Row({
  icon,
  title,
  subtitle,
  children,
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm font-medium">{title}</p>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}
