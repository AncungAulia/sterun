"use client";

/**
 * A file the organiser hands over, stored the moment they pick it.
 *
 * ## Why this is an upload and not a URL box
 *
 * It used to ask for a link to a poster the organiser hosts themselves, with a
 * hint admitting there was no upload yet. That is the step most likely to make
 * the wizard go unused — and worse, a link somewhere else can be swapped for
 * different bytes after people have entered, which is the exact substitution
 * this product exists to make impossible. What the store gives back is
 * content-addressed: the url ends with the sha256 of the bytes it serves, so
 * the poster and the waiver are as frozen as the document that names them.
 *
 * ## Why it uploads on pick rather than at the end
 *
 * `POST /events/files` is authenticated, so every upload costs a wallet prompt.
 * Doing them at the end would fire three or four prompts in a row at the moment
 * the organiser is trying to create an event, and a poster that fails there
 * fails in the worst possible place. Picking a file is already a deliberate
 * act, so the prompt is attached to it: one file, one prompt, and the thumbnail
 * that appears is the proof it worked.
 *
 * ## What is checked here and what is left to the server
 *
 * Size and the browser's own idea of the type, both only to avoid spending a
 * signature on a file that was always going to be refused. The real check is
 * the server sniffing the bytes (`be/src/files/content-type.ts`), which is the
 * only one that cannot be lied to — nothing here is a security boundary.
 */
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { FieldMessage, LabelRow } from "@/components/elements/Field";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { friendlyError } from "@/lib/errors";
import { MAX_FILE_BYTES, uploadEventFile } from "@/lib/upload";
import { signMessage } from "@/lib/wallet";

/**
 * What the field is for, which decides both what it accepts and how it shows
 * what was stored. The two differ in kind: a poster is checked by looking at
 * it, a waiver by opening it.
 */
export type FileKind = "image" | "document";

/**
 * A subset of the backend's `ALLOWED_CONTENT_TYPES`, and deliberately narrower.
 *
 * The store also accepts GIF, WebP and AVIF, and will keep accepting them. They
 * are not offered here because a poster is a poster: nobody exports one as an
 * animated GIF, and naming five formats where two would do turns one glance
 * into a decision. Anyone who really has a WebP can convert it; nobody is
 * blocked, and the line under the field stays a line rather than a list.
 *
 * SVG is absent in the backend deliberately and must stay absent here too. It
 * is script in our own origin, not a picture.
 */
const ACCEPTED: Record<FileKind, string[]> = {
  image: ["image/png", "image/jpeg"],
  document: ["application/pdf"],
};

const REFUSED: Record<FileKind, string> = {
  image: "That is not a PNG or a JPEG.",
  document: "That is not a PDF.",
};

interface FileFieldProps {
  id: string;
  label: string;
  kind: FileKind;
  /** Kept to what to pick: the formats and the limit. */
  hint?: ReactNode;
  /** Why it matters, behind an info button. See `elements/Help.tsx`. */
  help?: ReactNode;
  /** The stored url, or an empty string. Owned by the form, like every field. */
  value: string;
  onChange: (url: string) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "uploading" }
  | { kind: "failed"; message: string };

export function FileField({ id, label, kind, hint, help, value, onChange }: FileFieldProps) {
  const address = useWallet((state) => state.address);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [name, setName] = useState("");
  /**
   * Cleared after every pick. Without this, choosing the same file twice after
   * a failure fires no change event at all, and the retry looks like a dead
   * button.
   */
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file || !address) return;
    if (input.current) input.current.value = "";

    if (file.size > MAX_FILE_BYTES) {
      setState({
        kind: "failed",
        message: `That file is ${megabytes(file.size)} MB. The limit is 5 MB.`,
      });
      return;
    }
    // An empty type is left to the server: some browsers report nothing for a
    // file with no extension, and the byte sniff is the stronger check anyway.
    if (file.type && !ACCEPTED[kind].includes(file.type)) {
      setState({ kind: "failed", message: REFUSED[kind] });
      return;
    }

    setState({ kind: "signing" });
    try {
      const stored = await uploadEventFile({
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type || ACCEPTED[kind][0]!,
        address,
        // The wrapper is how the two halves of the wait are told apart: the
        // moment the signer is called we are waiting for a person, and the
        // moment it returns we are waiting for the network.
        sign: async (message, opts) => {
          const signature = await signMessage(message, opts);
          setState({ kind: "uploading" });
          return signature;
        },
      });
      setName(file.name);
      setState({ kind: "idle" });
      onChange(stored.url);
    } catch (error) {
      // A declined prompt and a refusal from the store arrive the same way, and
      // both leave the field exactly as it was.
      setState({ kind: "failed", message: friendlyError(error) });
    }
  }

  const busy = state.kind === "signing" || state.kind === "uploading";

  return (
    <div className="flex flex-col gap-2">
      <LabelRow htmlFor={id} label={label} help={help} />

      {value ? <Stored kind={kind} url={value} label={label} name={name} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        {/*
          The browser's own file control is a grey button and a sentence, styled
          by the platform and by nothing else on this page. It is kept for what
          it is good at (labelling, keyboard, the picker itself) and taken out of
          the layout, with our own button in front of it.
        */}
        <input
          ref={input}
          id={id}
          type="file"
          accept={ACCEPTED[kind].join(",")}
          disabled={busy || !address}
          onChange={(e) => void pick(e.target.files?.[0])}
          className="sr-only"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !address}
          onClick={() => input.current?.click()}
        >
          {value ? `Replace the ${label.toLowerCase()}` : `Choose a ${kind === "image" ? "picture" : "PDF"}`}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setName("");
              setState({ kind: "idle" });
              onChange("");
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>

      {busy ? (
        <p className="text-sm text-muted-foreground">
          {state.kind === "signing" ? "Confirm the upload in your wallet" : "Uploading"}
        </p>
      ) : (
        <FieldMessage hint={hint} error={state.kind === "failed" ? state.message : undefined} />
      )}
    </div>
  );
}

/**
 * What was stored, shown the way that file is actually checked: a poster by
 * looking at it, a waiver by opening it.
 */
function Stored({
  kind,
  url,
  label,
  name,
}: {
  kind: FileKind;
  url: string;
  label: string;
  name: string;
}) {
  if (kind === "image") {
    return (
      // Not next/image: this is a url on another origin, chosen at runtime, and
      // the optimiser would need it whitelisted at build time.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={label}
        className="max-h-48 w-auto rounded-md border border-border object-contain"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-teal-500 underline underline-offset-4"
    >
      {name || "Open the file"}
    </a>
  );
}

const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
