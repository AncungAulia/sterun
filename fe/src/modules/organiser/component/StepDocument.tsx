"use client";

/**
 * Step 2: get the details file online, then prove it is reachable before
 * committing to its hash.
 *
 * This step exists because of one failure that cannot be undone. `create_event`
 * stores `metadata_hash` permanently, and there is no `update_event`. Commit a
 * hash for bytes nobody ever fetched and the event page will say "the document
 * has been changed" for the rest of the event's life, with nothing anybody can
 * do about it.
 *
 * So the order is forced: build, publish, fetch back, compare, and only then
 * offer to sign. The check is the same code path the public event page uses, so
 * a document that passes here passes there.
 *
 * ## Why there are two ways to publish
 *
 * The backend will host the file (`POST /events/files`), and that is the path
 * offered first, because "put this online yourself and paste the link" was the
 * step most likely to make the whole wizard go unused. What the store gives
 * back is content-addressed — the url ends with the sha256 of the bytes it
 * serves — which is exactly the promise `metadata_hash` needs.
 *
 * Hosting it elsewhere stays possible, further down. An organiser who already
 * has a site should not be forced onto our origin, and `uri` is just a string
 * on chain: nothing about the contract prefers one host over another.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/elements/Field";
import { useWallet } from "@/hooks/useWallet";
import { fetchEventMetadata } from "@/lib/metadata";
import { uploadEventFile, type UploadedFile } from "@/lib/upload";
import { signMessage, walletErrorMessage } from "@/lib/wallet";

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

type PublishState = { kind: "idle" } | { kind: "publishing" } | { kind: "failed"; message: string };

export function StepDocument({ text, hash, published, onPublished }: StepDocumentProps) {
  /**
   * Read here rather than threaded down as a prop, the same way `useChainWrite`
   * reads it: the whole console sits inside `WalletGate`, so by the time this
   * step renders there is an address, and passing it through four levels only
   * to assert it is non-null would say less than this does.
   */
  const address = useWallet((state) => state.address);
  const [uri, setUri] = useState(published?.uri ?? "");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const [publishState, setPublishState] = useState<PublishState>({ kind: "idle" });
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);

  /**
   * True only while the file we uploaded is still the one the parent trusts.
   * The parent drops `published` the moment any detail changes, which makes
   * these bytes stale, and the badge has to go with it.
   */
  const isOurs = published !== null && uploaded !== null && published.uri === uploaded.url;

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

  async function publish() {
    if (!address) return;
    setPublishState({ kind: "publishing" });
    onPublished(null);
    setUploaded(null);
    try {
      const stored = await uploadEventFile({
        // The hash covers these exact bytes, so they are encoded once, here,
        // and not re-derived from anything downstream.
        bytes: new TextEncoder().encode(text),
        contentType: "application/json",
        address,
        expectedSha256: hash,
        sign: signMessage,
      });

      // Stored is not the same as served. Reading it back through the same
      // helper the public page uses is what makes "Published" mean something.
      const result = await fetchEventMetadata(stored.url, hash);
      if (result.status !== "verified") {
        setPublishState({
          kind: "failed",
          message:
            result.status === "modified"
              ? `The file came back with a different fingerprint (${result.actualHash.slice(0, 16)}...). Nothing has been recorded.`
              : `The file was stored but could not be read back: ${result.reason}`,
        });
        return;
      }

      setUploaded(stored);
      setPublishState({ kind: "idle" });
      onPublished({ uri: stored.url, hash });
    } catch (error) {
      // Covers both halves: a declined wallet and a refusal from the backend
      // arrive here the same way, and both leave the step unpublished.
      setPublishState({ kind: "failed", message: walletErrorMessage(error) });
    }
  }

  async function verify() {
    setCheck({ kind: "checking" });
    onPublished(null);
    setUploaded(null);
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
        <h2 className="heading text-xl text-n-700">Publish the event details</h2>
        <p className="mt-2 max-w-2xl text-base text-n-600">
          We put this file online and record a fingerprint of it with your event. From then on it
          has to stay exactly as it is. Change one space and your event page will say the details
          were altered, so read it through before publishing.
        </p>
      </div>

      <pre className="numeric max-h-72 overflow-auto rounded-lg border border-n-200 bg-n-50 p-4 text-sm text-n-700">
        {text}
      </pre>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void publish()}
          disabled={publishState.kind === "publishing" || !address}
        >
          {publishState.kind === "publishing" ? "Publishing" : "Publish the details file"}
        </Button>
        {isOurs ? <Badge variant="success">Published</Badge> : null}
        <span className="numeric text-sm text-n-500">Fingerprint {hash.slice(0, 16)}...</span>
      </div>

      {isOurs && uploaded ? (
        <p className="text-sm text-n-600">
          {uploaded.created ? "Now online at" : "Already online at"}{" "}
          <a
            href={uploaded.url}
            target="_blank"
            rel="noreferrer"
            className="numeric break-all text-teal-500 underline underline-offset-4"
          >
            {uploaded.url}
          </a>
        </p>
      ) : null}

      {publishState.kind === "failed" ? (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-5 py-4">
          <p className="heading-strong text-base text-danger">The file was not published</p>
          <p className="mt-1 text-base text-n-700">{publishState.message}</p>
          <p className="mt-1 text-base text-n-700">
            Nothing has been recorded, so it is safe to try again.
          </p>
        </div>
      ) : null}

      <details className="rounded-lg border border-n-200 px-5 py-4">
        <summary className="cursor-pointer text-base text-n-700">
          Host the file somewhere else instead
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="max-w-2xl text-base text-n-600">
            Your event can point at any public address. Save the file, put it online exactly as it
            is, then paste the link and we will read it back to check.
          </p>
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
            hint="It has to be public. We read it straight from your browser."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => void verify()}
              disabled={!uri.trim() || check.kind === "checking"}
            >
              {check.kind === "checking" ? "Checking" : "Check the published file"}
            </Button>
            {published && !isOurs ? <Badge variant="success">Checked</Badge> : null}
          </div>
        </div>
      </details>

      {check.kind === "mismatch" ? (
        <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-5 py-4">
          <p className="heading-strong text-base text-danger">
            That link is showing a different file
          </p>
          <p className="mt-1 text-base text-n-700">
            Publish the downloaded file exactly as it is. Even changing one space makes it a
            different file.
          </p>
          <dl className="mt-3 grid gap-x-4 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-n-500">Expected</dt>
            <dd className="numeric break-all text-n-700">{hash}</dd>
            <dt className="text-n-500">Found</dt>
            <dd className="numeric break-all text-n-700">{check.served}</dd>
          </dl>
        </div>
      ) : null}

      {check.kind === "unreachable" ? (
        <div role="alert" className="rounded-lg border border-warning-border bg-warning-surface px-5 py-4">
          <p className="heading-strong text-base text-warning">That link could not be read</p>
          <p className="mt-1 text-base text-n-700">{check.reason}</p>
          <p className="mt-1 text-base text-n-700">
            If we cannot read it, neither can the people looking at your event page. Worth sorting
            out now rather than after the event exists.
          </p>
        </div>
      ) : null}
    </div>
  );
}
