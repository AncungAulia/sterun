# Deploying the web app and the landing page (STE-32)

Two Vercel projects out of one repository: **`fe/`** (the web app) and
**`landing-page/`**. Both are Next.js, both are members of the root pnpm
workspace, and neither can be built from its own folder alone, which is what the
two `vercel.json` files are for.

The backend is not here: it runs on James's VPS and is already live at
`https://api-sterun.jameshub.fun` (STE-31).

## 1. What each project needs in Vercel

| Setting | `fe` | `landing-page` |
| --- | --- | --- |
| Root Directory | `fe` | `landing-page` |
| Framework | Next.js (detected) | Next.js (detected) |
| Install command | from `vercel.json` | from `vercel.json` |
| Build command | from `vercel.json` | from `vercel.json` |
| Node version | 22 | 22 |

**Why the commands are overridden.** Vercel would run `pnpm install` inside the
root directory, where there is no lockfile: the only one is at the repository
root (`fe/CLAUDE.md`). And `fe` depends on `@sterunxyz/sdk` as
`workspace:*`, which has to be compiled to `sdk/dist` before Next can typecheck
against it, so the build steps up a level and builds the SDK first. The landing
page has no SDK dependency and only needs the install fixed.

## 2. Environment variables

Everything `fe` reads is already committed in `fe/.env`, because every value is
public and is the same evidence in `docs/deployments.md`: the RPC url, the
network passphrase, the two contract ids, the sUSD SAC and issuer, and the API
url. Vercel picks those up from the repository with nothing to type.

**One variable is not in git and has to be set in the Vercel dashboard:**

| Variable | Value | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | the Reown project id (in Ancung's `fe/.env.local`) | WalletConnect is left out of the wallet picker, so no phone can pair. Nothing else breaks. |

The same id also has to list the deployed origin in the Reown dashboard, or the
relay refuses the pairing. That is a change on Reown, not in this repository.

`landing-page` reads no environment at all.

## 3. What has to change outside this repository

**The API refuses the browser until it is told the origin.** CORS is an exact
allow-list, never `*`, because authenticated requests carry a wallet signature
(`be/src/http/hardening.ts`). It comes from `STERUN_WEB_ORIGIN`, comma-separated,
and it currently holds `http://localhost:3000` alone. Until the deployed origin
is added, every call to the backend fails in the browser and looks like a
frontend bug: downloading a roster, submitting entry details, uploading an event
file, the sUSD faucet, publishing an announcement, and the Updates list.

So, after the first deploy, James adds the exact origin (scheme and host, no
path, no trailing slash) and restarts the API. A preview deployment has its own
hostname and needs its own entry; the production alias
(`https://<project>.vercel.app`) is stable and is the one that matters.

**The faucet works, and `payoutConfigured` is not the field to read.**
`faucet.payoutConfigured` reports the **distributor** key, which never goes on a
public box — the distributor can move the whole test supply. What the web app's
**Get test sUSD** uses is `faucet.route.available`, backed by its own small
float (`STERUN_SUSD_FAUCET_SECRET`). On production that is `true`, proven end to
end on 2026-09-23: a fresh wallet with a trustline was paid 50 sUSD.

## 4. After it is live

1. Record the two URLs in `docs/deployments.md`, like every other deploy.
2. Repeat the STE-25 rehearsal's manual steps against the live app: create a
   race through the console, enter and pay, two phones as two desks with one
   runner scanned at both, and the public profile (`M.1`, `M.2`, `M.3`, `M.4` in
   `docs/rehearsal/runs/*/EVIDENCE.md`).
3. The scanner can then be tested from a phone at all, which has been waiting on
   this since STE-22.
