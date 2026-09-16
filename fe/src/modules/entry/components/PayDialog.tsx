"use client";

/**
 * Sign and pay, from the first wallet prompt to the entry (mockup block 4).
 *
 * ## It cannot be closed while it runs
 *
 * A dialog that closes mid-attempt leaves somebody watching a wallet prompt
 * with no idea what it belongs to. The same holds for a check that could not
 * run: the only way out of "we couldn't check your entry" is checking again,
 * because paying again before knowing is how a runner is charged twice.
 *
 * ## Every stop has its own sentence
 *
 * From the spec's failure table. None of them says the entry "may have gone
 * through": no answer is a check, and `enter` being atomic is what lets "not
 * found" say nothing was charged.
 */
import Link from "next/link";
import { CheckIcon, CircleAlertIcon, LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { formatAmount, formatPrice } from "@/utils/format";

import type { AttemptState } from "../lib/attempt";

import { GetTestSusd } from "@/components/wallet/GetTestSusd";

export interface PayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  raceName: string;
  eventId: number;
  runner: string;
  total: bigint;
  attempt: {
    state: AttemptState;
    running: boolean;
    start: () => void;
    checkAgain: () => void;
  };
  /** A distance or item sold out: back to step 1. */
  onChangeDistance: () => void;
  onDone: (tokenId: number) => void;
}

export function PayDialog({
  open,
  onOpenChange,
  raceName,
  eventId,
  runner,
  total,
  attempt,
  onChangeDistance,
  onDone,
}: PayDialogProps) {
  const { state } = attempt;
  const locked = attempt.running || state.phase === "check-failed";

  // Handed on once per token, however often the parent re-renders.
  const handedOn = useRef<number | null>(null);
  useEffect(() => {
    if (state.phase === "entered" && handedOn.current !== state.tokenId) {
      handedOn.current = state.tokenId;
      onDone(state.tokenId);
    }
  }, [state, onDone]);

  const close = <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>;
  const tryAgain = <Button onClick={attempt.start}>Try again</Button>;

  let body: ReactNode;
  switch (state.phase) {
    case "checking":
      body = (
        <Outcome
          tone="busy"
          icon={<LoaderCircleIcon aria-hidden="true" className="size-6 animate-spin" />}
          title="Checking whether your entry went through"
          description="This can take up to half a minute. Please keep this page open."
        />
      );
      break;

    case "not-through":
      body = (
        <Outcome
          icon={<CircleAlertIcon aria-hidden="true" className="size-6" />}
          title="Your entry didn't go through"
          description="Nothing was charged. Your details are still here, so you can try again."
          actions={<>{close}{tryAgain}</>}
        />
      );
      break;

    case "check-failed":
      body = (
        <Outcome
          tone="warning"
          icon={<TriangleAlertIcon aria-hidden="true" className="size-6" />}
          title="We couldn't check your entry"
          description="Your internet connection dropped. Before paying again, reconnect and tap Check again, so you are not charged twice."
          actions={<Button onClick={attempt.checkAgain}>Check again</Button>}
        />
      );
      break;

    case "failed": {
      const { failure } = state;
      const icon = <CircleAlertIcon aria-hidden="true" className="size-6" />;
      switch (failure.kind) {
        case "declined":
          body = (
            <Outcome icon={icon} title="You declined in your wallet" description="Nothing was charged." actions={<>{close}{tryAgain}</>} />
          );
          break;
        case "short":
          body = (
            <Outcome
              icon={icon}
              title={`You need ${formatAmount(failure.needed)} more sUSD to enter`}
              description="Nothing was charged."
              actions={<>{close}{tryAgain}</>}
            >
              <div className="flex justify-center">
                <GetTestSusd address={runner} />
              </div>
            </Outcome>
          );
          break;
        case "sold-out":
          body = (
            <Outcome
              icon={icon}
              title="This distance just sold out"
              description="Nothing was charged."
              actions={<>{close}<Button onClick={onChangeDistance}>Choose another distance</Button></>}
            />
          );
          break;
        case "add-on-sold-out":
          body = (
            <Outcome
              icon={icon}
              title={`${failure.names.join(", ")} just sold out`}
              description="Nothing was charged."
              actions={<>{close}<Button onClick={onChangeDistance}>Change your race pack</Button></>}
            />
          );
          break;
        case "closed":
          body = (
            <Outcome
              icon={icon}
              title="Entries for this race have closed"
              description="Nothing was charged."
              actions={
                <Button asChild>
                  <Link href={`/events/${eventId}`}>Back to the race</Link>
                </Button>
              }
            />
          );
          break;
        default:
          body = (
            <Outcome
              icon={icon}
              title="Your entry didn't go through"
              description={"message" in failure ? failure.message : "Nothing was charged."}
              actions={<>{close}{tryAgain}</>}
            />
          );
      }
      break;
    }

    default: {
      const identityDone = state.phase === "paying" || state.phase === "entered";
      body = (
        <>
          <DialogHeader>
            <DialogTitle className="heading-strong text-xl text-ink">Entering {raceName}</DialogTitle>
            <DialogDescription className="text-base text-n-600">Your wallet will ask you twice.</DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-3 py-2">
            <Step
              state={identityDone ? "done" : state.phase === "confirming-identity" ? "running" : "waiting"}
              label="Confirm it's you"
              detail={
                identityDone
                  ? "Signed. Your details are saved securely."
                  : state.phase === "confirming-identity"
                    ? "Check your wallet."
                    : "Free. Proves this wallet is yours."
              }
            />
            <Step
              state={state.phase === "entered" ? "done" : state.phase === "paying" ? "running" : "waiting"}
              label={total > 0n ? `Pay ${formatPrice(total)} and enter` : "Enter the race"}
              detail={state.phase === "paying" ? "Check your wallet." : undefined}
            />
          </ol>
        </>
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && locked) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => {
          if (locked) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (locked) event.preventDefault();
        }}
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}

function Step({
  state,
  label,
  detail,
}: {
  state: "done" | "running" | "waiting";
  label: string;
  detail?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
          state === "done" && "bg-success text-paper",
          state === "running" && "text-teal-500",
          state === "waiting" && "border border-n-300",
        )}
      >
        {state === "done" ? <CheckIcon className="size-4" /> : null}
        {state === "running" ? <LoaderCircleIcon className="size-5 animate-spin" /> : null}
      </span>
      <div>
        <p className="text-base text-ink">{label}</p>
        {detail ? <p className="text-sm text-n-500">{detail}</p> : null}
      </div>
    </li>
  );
}

function Outcome({
  icon,
  tone = "neutral",
  title,
  description,
  actions,
  children,
}: {
  icon: ReactNode;
  tone?: "neutral" | "warning" | "busy";
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <DialogHeader className="items-center text-center sm:text-center">
        <span
          className={cn(
            "mb-2 grid size-11 place-items-center rounded-full",
            tone === "neutral" && "bg-n-100 text-n-600",
            tone === "warning" && "bg-warning-surface text-warning",
            tone === "busy" && "text-teal-500",
          )}
        >
          {icon}
        </span>
        <DialogTitle className="heading-strong text-xl text-ink">{title}</DialogTitle>
        <DialogDescription className="text-base text-n-600">{description}</DialogDescription>
      </DialogHeader>
      {children}
      {actions ? <DialogFooter className="sm:justify-center">{actions}</DialogFooter> : null}
    </>
  );
}
