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
 * down should not be able to stop anybody creating an event.
 *
 * ## Why "create it with no document at all" is gone
 *
 * It used to sit at the bottom of this panel, and it looked like the same kind
 * of thing as hosting the file yourself. It was not. Hosting it elsewhere
 * produces a complete event; skipping produces an event whose page has no
 * poster, no location and no schedule, permanently, because there is no
 * `update_event` and the hash is committed at creation. That button offered a
 * broken event at the exact moment somebody is frustrated enough to press
 * anything, and it could never be undone. An escape hatch that ruins the thing
 * it is escaping from is a trap.
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
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "checked" }
  | { kind: "mismatch" }
  | { kind: "unreachable"; reason: string };

export function DocumentFallback({ text, hash, onChecked }: DocumentFallbackProps) {
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
      setCheck({ kind: "mismatch" });
    } else {
      setCheck({ kind: "unreachable", reason: result.reason });
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border px-5 py-4">
      <div>
        <p className="heading-strong text-base text-foreground">Put the details online yourself</p>
        <p className="mt-1 max-w-2xl text-base text-muted-foreground">
          Download your race details, upload the file unchanged to any public website, then paste
          its link and we will check it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={download}>
          Download race details
        </Button>
      </div>

      <Field
        id="document-uri"
        label="Link to your file"
        value={uri}
        onChange={(e) => setUri(e.target.value)}
        placeholder="https://..."
        hint="It has to be public."
        help="We check the link now, so a runner does not find a broken page three days before the race."
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

    </div>
  );
}
