"use client";

/**
 * "Add to home screen", on the two screens that are opened at a venue
 * (Ancung, 2026-09-17).
 *
 * The pass and the desk are the offline screens (`app/(offline)`), and an
 * installed copy is what makes them survive a phone with no signal: it opens
 * without the browser's own chrome, keeps the worker's cache, and is one tap
 * from the home screen at a gate rather than a link in somebody's chat history.
 * Nothing said so, so nobody installed it.
 *
 * ## Three states, because the browsers genuinely differ
 *
 * - **A browser that offers installing** (Chrome on Android, Chrome and Edge on
 *   desktop) fires `beforeinstallprompt`. The event is kept and a press raises
 *   the browser's own dialog. Only then is a button drawn: a button that says
 *   "install" and cannot install is worse than nothing.
 * - **iOS** has no such event and never will. Safari installs from its Share
 *   sheet, so the only honest thing to offer there is the instruction, and it
 *   is a sentence rather than a button, because the button is not ours.
 * - **Already installed** shows nothing. `display-mode: standalone` is what an
 *   installed copy runs in, and iOS answers `navigator.standalone`.
 *
 * Dismissing is remembered per device in `localStorage`, because this sits
 * under a runner's QR code at a desk and must be possible to get rid of. The
 * read is wrapped: a browser in private mode can throw on access, and this is
 * decoration, not a feature worth an error for.
 */
import { ShareIcon, SmartphoneIcon, XIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const DISMISSED = "sterun.install-dismissed";

/** The part of `BeforeInstallPromptEvent` this uses. It is not in lib.dom yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function alreadyInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia("(display-mode: standalone)").matches;
}

/** Safari on an iPhone or iPad, the one place installing is a hand instruction. */
function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function remembered(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether this is the browser yet.
 *
 * Every question below (installed? iOS? dismissed before?) can only be asked of
 * a real browser, and asking during hydration renders something the server did
 * not. `useSyncExternalStore` answers false until React has hydrated and true
 * after, which is the same shape `hooks/useMediaQuery.ts` uses, and it keeps
 * the answer out of an effect: setting state from an effect body is what the
 * React Compiler lint refuses, and rightly, since it renders twice.
 */
const NEVER_CHANGES = () => () => {};

export function InstallApp({ what }: { what: "pass" | "desk" }) {
  const mounted = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  // Read once, at hydration, so a press elsewhere cannot make it disagree with
  // what is on screen. `mounted` keeps it off the server's render.
  const [hidden, setHidden] = useState(remembered);

  useEffect(() => {
    function offered(fired: Event) {
      // Kept rather than acted on: the browser only allows the dialog from a
      // gesture, and raising one over a QR code nobody asked about is rude.
      fired.preventDefault();
      setEvent(fired as InstallPromptEvent);
    }
    function installed() {
      setHidden(true);
    }

    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offered);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // A device that will not remember asks again next time. That is all.
    }
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    // Accepted or refused, the event is spent: a second press does nothing.
    setEvent(null);
    setHidden(true);
  }

  const ios = mounted && isIosSafari();
  if (!mounted || hidden || alreadyInstalled() || (!event && !ios)) return null;

  const line =
    what === "pass"
      ? "Keep this pass on your home screen, so it opens at the desk without signal."
      : "Keep the desk on your home screen, so it opens at the venue without signal.";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-n-200 bg-paper px-4 py-3 text-left">
      <SmartphoneIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-n-600">{line}</p>
        {event ? (
          <Button size="sm" className="self-start" onClick={() => void install()}>
            Add to home screen
          </Button>
        ) : (
          <p className="flex flex-wrap items-center gap-1 text-sm text-n-600">
            Tap
            <ShareIcon aria-hidden="true" className="size-4 text-teal" />
            <span className="font-medium text-ink">Share</span>, then
            <span className="font-medium text-ink">Add to Home Screen</span>.
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Hide this"
        className="-mt-1 -mr-2 shrink-0 text-n-500"
        onClick={dismiss}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
