"use client";

/**
 * The way out when publishing the details file fails.
 *
 * This used to be the front of a whole step: a JSON dump, a Publish button, and
 * a fold-out for hosting the file yourself. An organiser does not need to know
 * a file exists, so the file moved behind the review and publishing became the
 * first signature of the run. What is left is genuinely a fallback, and it is
 * only rendered once the run has stopped on that step.
 *
 * It stays in the product rather than being deleted. `uri` is just a string on
 * chain and nothing about the contract prefers our origin, so our backend being
 * down should not be able to stop anybody creating an event. Both ways out are
 * here: host it somewhere else, or go on with no document at all.
 *
 * Checking a hosted url runs the same code path the public event page uses, so
 * a document that passes here passes there.
 */
import { useState } from "react";

import { Field } from "@/components/elements/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchEventMetadata } from "@/lib/metadata";

export interface PublishedDocument {
  uri: string;
  hash: string;
}

interface DocumentFallbackProps {
  /** The exact text to publish. Its bytes are what the hash covers. */
  text: string;
  hash: string;
  /** Called with a url that has been fetched back and matches the hash. */
  onChecked: (document: PublishedDocument) => void;
  /** Called when the organiser decides to create the event with no document. */
  onSkip: () => void;
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked" }
  | { kind: "mismatch"; served: string }
  | { kind: "unreachable"; reason: string };

export function DocumentFallback({ text, hash, onChecked, onSkip }: DocumentFallbackProps) {
  const [uri, setUri] = useState("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });

  function download() {
    // A blob rather than a data: URL, so the browser names the file and the
    // organiser gets something they can drop straight onto a host.
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "event.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function verify() {
    setCheck({ kind: "checking" });
    const result = await fetchEventMetadata(uri.trim(), hash);
    if (result.status === "verified") {
      setCheck({ kind: "checked" });
      onChecked({ uri: uri.trim(), hash });
    } else if (result.status === "modified") {
      setCheck({ kind: "mismatch", served: result.actualHash });
    } else {
      setCheck({ kind: "unreachable", reason: result.reason });
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border px-5 py-4">
      <div>
        <p className="heading-strong text-base text-foreground">Other ways to go on</p>
        <p className="mt-1 max-w-2xl text-base text-muted-foreground">
          Your event can point at any public address. Save the file, put it online exactly as it
          is, then paste the link and we will read it back to check.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={download}>
          Download event.json
        </Button>
      </div>

      <Field
        id="document-uri"
        label="Published URL"
        value={uri}
        onChange={(e) => setUri(e.target.value)}
        placeholder="https://raw.githubusercontent.com/..."
        hint="It has to be public."
        help="We fetch it from your browser and compare what comes back with what was built here, so a link we cannot read is caught now rather than by a runner three days before the race."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => void verify()}
          disabled={!uri.trim() || check.kind === "checking"}
        >
          {check.kind === "checking" ? "Checking" : "Check the published file"}
        </Button>
        {check.kind === "checked" ? <Badge variant="success">Checked</Badge> : null}
      </div>

      {check.kind === "mismatch" ? (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-5 py-4">
          <p className="heading-strong text-base text-danger">
            That link is showing a different file
          </p>
          <p className="mt-1 text-base text-foreground">
            Publish the downloaded file exactly as it is. Even changing one space makes it a
            different file.
          </p>
          <dl className="mt-3 grid gap-x-4 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Expected</dt>
            <dd className="numeric break-all text-foreground">{hash}</dd>
            <dt className="text-muted-foreground">Found</dt>
            <dd className="numeric break-all text-foreground">{check.served}</dd>
          </dl>
        </div>
      ) : null}

      {check.kind === "unreachable" ? (
        <div role="alert" className="rounded-lg border border-warning-border bg-warning-surface px-5 py-4">
          <p className="heading-strong text-base text-warning">That link could not be read</p>
          <p className="mt-1 text-base text-foreground">{check.reason}</p>
          <p className="mt-1 text-base text-foreground">
            If we cannot read it, neither can the people looking at your event page.
          </p>
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <Button variant="ghost" onClick={onSkip}>
          Create the event without any details
        </Button>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The event will work, and people can enter. Its page will have no poster, no location and
          no schedule on it, and you cannot add them later.
        </p>
      </div>
    </div>
  );
}
