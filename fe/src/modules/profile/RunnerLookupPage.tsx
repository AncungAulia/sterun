"use client";

/**
 * `/runner`: paste any address and open its race record.
 *
 * The handoff did not design this screen (Ancung asked for it on 2026-09-16),
 * so it borrows the profile page's own pieces: the same heading style, and the
 * same browser-side address check as P10, run before navigating so a typo is
 * answered here instead of on a page of its own.
 *
 * A connected wallet gets a one-press way to its own record, since that is the
 * address most people arriving here want.
 */
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/hooks/useWallet";

import { cleanAddress, isRunnerAddress } from "./lib/runner-address";

export function RunnerLookupPage() {
  const router = useRouter();
  const inputId = useId();
  const address = useWallet((state) => state.address);
  const [text, setText] = useState("");
  const [refused, setRefused] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = cleanAddress(text);
    if (!isRunnerAddress(cleaned)) {
      setRefused(true);
      return;
    }
    router.push(`/runner/${cleaned}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs text-n-600">Race record</p>
        <h1 className="heading-hero text-4xl text-ink">Look up a runner</h1>
        <p className="text-base text-n-600">
          Paste a runner&apos;s address to see every race it has entered. No account needed.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <Label htmlFor={inputId} className="text-sm font-normal text-n-700">
          Stellar address
        </Label>
        <Input
          id={inputId}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setRefused(false);
          }}
          placeholder="G..."
          autoComplete="off"
          spellCheck={false}
          aria-invalid={refused || undefined}
          className="numeric"
        />
        {refused ? (
          <p role="alert" className="text-sm text-danger">
            That is not a Stellar address. A runner&apos;s address starts with G and is 56 characters long.
          </p>
        ) : null}
        <Button type="submit" disabled={text.trim().length === 0}>
          Open race record
        </Button>
      </form>

      {address ? (
        <Button variant="outline" onClick={() => router.push(`/runner/${address}`)}>
          Open my race record
        </Button>
      ) : null}
    </div>
  );
}
