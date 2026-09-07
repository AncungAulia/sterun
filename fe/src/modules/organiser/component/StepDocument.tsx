"use client";

/**
 * Step 2: publish the document, then prove it is reachable before committing
 * to its hash.
 *
 * This step exists because of one failure that cannot be undone. `create_event`
 * stores `metadata_hash` permanently, and there is no `update_event`. Commit a
 * hash for bytes nobody ever fetched and the event page will say "the document
 * has been changed" for the rest of the event's life, with nothing anybody can
 * do about it.
 *
 * So the order is forced: generate, publish, fetch back, compare, and only then
 * offer to sign. The check is the same code path the public event page uses, so
 * a document that passes here passes there.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/elements/Field";
import { fetchEventMetadata } from "@/lib/metadata";

export interface PublishedDocument {
  uri: string;
  hash: string;
}

interface StepDocumentProps {
  /** The exact text to publish. Its bytes are what the hash covers. */
  text: string;
  hash: string;
  published: PublishedDocument | null;
  onPublished: (document: PublishedDocument | null) => void;
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "mismatch"; served: string }
  | { kind: "unreachable"; reason: string };

export function StepDocument({ text, hash, published, onPublished }: StepDocumentProps) {
  const [uri, setUri] = useState(published?.uri ?? "");
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
    onPublished(null);
    const result = await fetchEventMetadata(uri.trim(), hash);
    if (result.status === "verified") {
      setCheck({ kind: "idle" });
      onPublished({ uri: uri.trim(), hash });
    } else if (result.status === "modified") {
      setCheck({ kind: "mismatch", served: result.actualHash });
    } else {
      setCheck({ kind: "unreachable", reason: result.reason });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="heading text-xl text-n-700">Publish the document</h2>
        <p className="mt-2 max-w-2xl text-base text-n-600">
          Save this file, put it somewhere public, then paste the URL back here. The hash of these
          exact bytes goes on chain, so the file has to stay reachable and unchanged. A URL that
          pins a version, like a commit on GitHub, is safer than one that always serves the latest.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={download}>
          Download event.json
        </Button>
        <span className="numeric text-sm text-n-500">sha256 {hash.slice(0, 16)}...</span>
      </div>

      <pre className="numeric max-h-72 overflow-auto rounded-lg border border-n-200 bg-n-50 p-4 text-sm text-n-700">
        {text}
      </pre>

      <div className="flex flex-col gap-3">
        <Field
          id="document-uri"
          label="Published URL"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="https://raw.githubusercontent.com/..."
          hint="Fetched from your browser, so it has to allow cross origin reads."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void verify()} disabled={!uri.trim() || check.kind === "checking"}>
            {check.kind === "checking" ? "Checking" : "Check the published file"}
          </Button>
          {published ? <Badge variant="success">Document verified</Badge> : null}
        </div>
      </div>

      {check.kind === "mismatch" ? (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-5 py-4">
          <p className="heading-strong text-base text-danger">
            That URL serves different bytes to the file above
          </p>
          <p className="mt-1 text-base text-n-700">
            Publish the downloaded file exactly as it is. Editing it, even the whitespace, changes
            the hash.
          </p>
          <dl className="mt-3 grid gap-x-4 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-n-500">Expected</dt>
            <dd className="numeric break-all text-n-700">{hash}</dd>
            <dt className="text-n-500">Served</dt>
            <dd className="numeric break-all text-n-700">{check.served}</dd>
          </dl>
        </div>
      ) : null}

      {check.kind === "unreachable" ? (
        <div role="alert" className="rounded-lg border border-warning-border bg-warning-surface px-5 py-4">
          <p className="heading-strong text-base text-warning">That URL could not be read</p>
          <p className="mt-1 text-base text-n-700">{check.reason}</p>
          <p className="mt-1 text-base text-n-700">
            A host that blocks cross origin reads will fail here and on the public event page too,
            so it is worth fixing now rather than after the event exists.
          </p>
        </div>
      ) : null}
    </div>
  );
}
