# macOS Signing and Notarization

The macOS release path builds, Developer ID signs, notarizes, staples, and zips the Deno Desktop app locally on a trusted Mac. This keeps Apple certificates and app-specific passwords out of GitHub Actions.

## Requirements

- Apple Developer Program membership.
- A `Developer ID Application` certificate installed in the local keychain.
- An Apple ID app-specific password for notarization.
- The Apple Developer Team ID.

## 1. Create the Certificate

Create a `Developer ID Application` certificate in the Apple Developer portal.

Install it locally and verify it is available:

```bash
security find-identity -v -p codesigning
```

Expected output includes:

```txt
Developer ID Application: Your Name or Company (TEAMID)
```

Use that full string as `APPLE_SIGNING_IDENTITY`.

## 2. Create Notarization Password

Create an app-specific password for the Apple ID at `appleid.apple.com`.

Use these values:

```bash
APPLE_ID="you@example.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="TEAMID"
```

## 3. Create Local `.env`

Copy the template and fill in your real values:

```bash
cp .env.example .env
```

`.env` is ignored by Git and must never be committed.

## 4. Build, Notarize, and Staple

On the Mac where the certificate is installed, run:

```bash
npm run desktop:package:mac
```

The script builds both macOS targets, signs them through Deno Desktop using `APPLE_SIGNING_IDENTITY`, performs a final hardened-runtime Developer ID re-sign after the app bundle is complete, submits each app to Apple notarization, staples the notarization ticket, verifies Gatekeeper assessment, and creates release ZIPs:

```txt
dist-desktop/release/Jira-Tracking-v0.0.2-macos-arm64.zip
dist-desktop/release/Jira-Tracking-v0.0.2-macos-x64.zip
```

## 5. Publish to GitHub Releases

After packaging succeeds, upload the notarized ZIPs to the matching `v<version>` GitHub release:

```bash
npm run desktop:publish:mac
```

The publish script verifies each ZIP with `unzip -t`, checks both app bundles with Gatekeeper via `spctl`, verifies `gh` authentication, and then either replaces the macOS assets on the existing release or creates the release if it does not exist.

Expected release asset names use the same convention as the existing release artifacts:

```txt
Jira-Tracking-v0.0.2-macos-arm64.zip
Jira-Tracking-v0.0.2-macos-x64.zip
```

## Quick Release Flow

```bash
npm run desktop:package:mac
npm run desktop:publish:mac
```

## Notes

- `deno desktop` ad-hoc signing is still used for normal development packaging.
- `scripts/package-mac.ts` creates a temporary Deno config containing `desktop.macos.codesignIdentity` so the committed `deno.json` does not hard-code a local certificate name.
- The package script includes and signs Deno Desktop's `libruntime.dylib.update-ok` marker before sealing the app bundle because the runtime expects that file on launch; adding it after signing would invalidate the sealed bundle.
- Do **not** ship `Deno.autoUpdate()` dylib patches for notarized macOS builds. In-place `libruntime.dylib` replacement invalidates the sealed bundle. The app updates by downloading the full notarized ZIP from GitHub Releases and swapping the `.app` on quit instead.
- Notarization runs with `xcrun notarytool submit --wait`, then `xcrun stapler staple`.
- Publishing uses `gh release upload --clobber` when the release already exists.
- Do not commit Apple credentials, app-specific passwords, GitHub tokens, `.p12` files, or `.env`.
