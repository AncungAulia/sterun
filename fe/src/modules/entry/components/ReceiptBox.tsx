"use client";

/**
 * The receipt code, with the three things a runner does with it: look, download,
 * copy (mockup block 5).
 *
 * Partly hidden until Show is pressed, because this page is the one somebody
 * holds up to show a friend, and the code is the one line on it to keep private.
 */
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { maskCode } from "../lib/receipt";

export function ReceiptBox({ code, onDownload }: { code: string; onDownload: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A browser that refuses the clipboard still shows the code under Show.
    }
  }

  return (
    <Card role="region" aria-labelledby="receipt-title" className="gap-3 p-5">
      <h2 id="receipt-title" className="heading-strong text-lg text-ink">
        Your receipt
      </h2>
      <p className="text-sm text-n-500">
        Keep this receipt. Together with your ID details, it proves this race record is yours.
      </p>

      <div className="flex items-center gap-3 rounded-md border border-dashed border-n-300 bg-paper px-3 py-2.5">
        <code className="numeric min-w-0 flex-1 text-sm break-all text-n-700">{shown ? code : maskCode(code)}</code>
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setShown((value) => !value)}>
          {shown ? "Hide" : "Show"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onDownload}>
          <DownloadIcon aria-hidden="true" className="size-4" />
          Download receipt
        </Button>
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? (
            <CheckIcon aria-hidden="true" className="size-4" />
          ) : (
            <CopyIcon aria-hidden="true" className="size-4" />
          )}
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
    </Card>
  );
}
