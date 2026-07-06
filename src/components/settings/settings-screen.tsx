import { ChevronLeft, LogOut, Monitor, Moon, Rocket, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { useTheme } from "@/components/theme-provider"
import { MOCK_USER } from "@/data/mock"
import { cn } from "@/lib/utils"

/** Settings surface: connection, reminders, and preferences. */
export function SettingsScreen({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-1.5 border-b px-2 py-2.5">
        <Button size="icon-sm" variant="ghost" aria-label="Back" onClick={onBack}>
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
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                  {MOCK_USER.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {MOCK_USER.email}
                </span>
                <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Connected · {MOCK_USER.host}
                </span>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive">
                <LogOut /> Disconnect
              </Button>
            </div>
          </section>

          <Separator />

          {/* Reminders */}
          <section>
            <NotificationSettings />
          </section>

          <Separator />

          {/* Preferences */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Preferences</SectionTitle>

            <ThemeRow />

            <Row
              icon={<Rocket className="size-4 text-muted-foreground" />}
              title="Launch at login"
              subtitle="Start quietly in the menu bar"
            >
              <Switch defaultChecked />
            </Row>
          </section>

          <p className="pt-1 text-center text-[11px] text-muted-foreground">
            Jira Time Tracker · v0.0.1
          </p>
        </div>
      </ScrollArea>
    </div>
  )
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
