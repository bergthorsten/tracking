import * as React from "react"
import {
  ArrowRight,
  CircleCheck,
  Eye,
  EyeOff,
  ExternalLink,
  LoaderCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getDesktopBindings, type JiraSettingsInput } from "@/desktop-bindings"
import { cn } from "@/lib/utils"

type Status = "idle" | "testing" | "connected"
type OnboardingScreenProps = {
  onDone?: () => void
  onConnect?: (settings: JiraSettingsInput) => Promise<void> | void
}

/**
 * First-launch onboarding. Three fields — host (preconfigured), email, and
 * API token — with a single "Connect" action that verifies the credentials.
 */
export function OnboardingScreen({ onDone, onConnect }: OnboardingScreenProps) {
  const [host, setHost] = React.useState("stjornborg.atlassian.net")
  const [email, setEmail] = React.useState("")
  const [token, setToken] = React.useState("")
  const [reveal, setReveal] = React.useState(false)
  const [status, setStatus] = React.useState<Status>("idle")
  const [error, setError] = React.useState<string | null>(null)

  const canConnect = email.includes("@") && token.length > 8 && host.length > 3

  const connect = async () => {
    if (!canConnect || status !== "idle") {
      return
    }

    setStatus("testing")
    setError(null)

    try {
      if (onConnect) {
        await onConnect({ host, email, token })
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 1100))
      }

      setStatus("connected")
      window.setTimeout(() => onDone?.(), 700)
    } catch (error) {
      setStatus("idle")
      setError(
        error instanceof Error ? error.message : "Could not connect to Jira."
      )
    }
  }

  const openApiTokenLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!getDesktopBindings()) {
      return
    }

    event.preventDefault()
    window.open(event.currentTarget.href, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="flex h-full flex-col justify-center bg-background px-6 py-8">
      {/* Brand */}
      <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
        <img
          src="/logo.png"
          alt=""
          className="size-12 rounded-2xl shadow-sm"
        />
        <div>
          <h1 className="text-base font-semibold">Connect to Jira</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Track time straight from your menu bar. Your token stays on this
            device.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-3.5">
        <Field label="Jira site">
          <div className="flex items-center rounded-lg border border-input bg-muted/40 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <span className="pl-2.5 text-sm text-muted-foreground">
              https://
            </span>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
          </div>
        </Field>

        <Field label="Account email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>

        <Field
          label="API token"
          hint={
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noreferrer"
              onClick={openApiTokenLink}
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Create one <ExternalLink className="size-3" />
            </a>
          }
        >
          <div className="relative">
            <Input
              type={reveal ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="••••••••••••••••"
              className="pr-9 font-mono"
            />
            <Button
              size="icon-xs"
              variant="ghost"
              type="button"
              aria-label={reveal ? "Hide token" : "Show token"}
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
              onClick={() => setReveal((r) => !r)}
            >
              {reveal ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </Field>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* Action */}
      <Button
        size="lg"
        className={cn(
          "mt-5 w-full",
          status === "connected" &&
            "bg-emerald-600 text-white hover:bg-emerald-600/90"
        )}
        disabled={!canConnect || status !== "idle"}
        onClick={() => void connect()}
      >
        {status === "idle" && (
          <>
            Connect <ArrowRight data-icon="inline-end" />
          </>
        )}
        {status === "testing" && (
          <>
            <LoaderCircle className="animate-spin" /> Verifying credentials…
          </>
        )}
        {status === "connected" && (
          <>
            <CircleCheck /> Connected
          </>
        )}
      </Button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Stored locally on this device · never synced
      </p>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {hint ? <span className="text-[11px]">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}
