import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileField, type FileKind } from "@/components/elements/FileField";
import { useWallet } from "@/hooks/useWallet";

const uploadEventFile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/wallet", () => ({
  signMessage: vi.fn(async () => "c2ln"),
  walletErrorMessage: (error: unknown) => String(error),
}));
vi.mock("@/lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload")>()),
  uploadEventFile,
}));

const ORGANISER = "GBGUI5MPVOBI37LSQMYXJGMWSVQZ4AKLUUNAZIUWTOEGOYMWP47FC4TN";
const STORED = "https://api-sterun.jameshub.fun/files/abc.png";

/** A PNG by its magic bytes, so the type is not merely claimed by a filename. */
function png(name = "poster.png", bytes = 64): File {
  const body = new Uint8Array(bytes);
  body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([body], name, { type: "image/png" });
}

function pdf(name = "waiver.pdf"): File {
  return new File([new Uint8Array(64)], name, { type: "application/pdf" });
}

/** The field is controlled, so the test holds the value the way the form does. */
function Harness({ kind = "image", label = "Poster" }: { kind?: FileKind; label?: string }) {
  const [url, setUrl] = useState("");
  return <FileField id="poster" label={label} kind={kind} value={url} onChange={setUrl} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadEventFile.mockResolvedValue({
    url: STORED,
    sha256: "abc",
    size: 64,
    contentType: "image/png",
    created: true,
  });
  useWallet.setState({ address: ORGANISER, isRestoring: false, isConnecting: false, error: null });
});

describe("FileField", () => {
  describe("positive", () => {
    it("uploads the picked file and shows what is now stored", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.upload(screen.getByLabelText("Poster"), png());

      await waitFor(() => expect(uploadEventFile).toHaveBeenCalledTimes(1));
      expect(uploadEventFile).toHaveBeenCalledWith(
        expect.objectContaining({ address: ORGANISER, contentType: "image/png" }),
      );
      expect(await screen.findByRole("img", { name: /poster/i })).toHaveAttribute("src", STORED);
    });

    it("offers a waiver as something to open rather than a picture", async () => {
      // A PDF has no useful thumbnail, and the one thing an organiser wants to
      // check is that the file they uploaded is the one that opens.
      const user = userEvent.setup();
      uploadEventFile.mockResolvedValue({
        url: "https://api-sterun.jameshub.fun/files/def.pdf",
        sha256: "def",
        size: 64,
        contentType: "application/pdf",
        created: true,
      });
      render(<Harness kind="document" label="Waiver" />);

      await user.upload(screen.getByLabelText("Waiver"), pdf());

      const link = await screen.findByRole("link", { name: /waiver\.pdf/i });
      expect(link).toHaveAttribute("href", "https://api-sterun.jameshub.fun/files/def.pdf");
    });

    it("replaces one file with another", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.upload(screen.getByLabelText("Poster"), png("first.png"));
      await screen.findByRole("img", { name: /poster/i });

      uploadEventFile.mockResolvedValue({
        url: "https://api-sterun.jameshub.fun/files/second.png",
        sha256: "second",
        size: 64,
        contentType: "image/png",
        created: true,
      });
      await user.upload(screen.getByLabelText(/replace/i), png("second.png"));

      await waitFor(() =>
        expect(screen.getByRole("img", { name: /poster/i })).toHaveAttribute(
          "src",
          "https://api-sterun.jameshub.fun/files/second.png",
        ),
      );
    });

    it("removes a file, leaving nothing recorded", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.upload(screen.getByLabelText("Poster"), png());
      await screen.findByRole("img", { name: /poster/i });

      await user.click(screen.getByRole("button", { name: /remove/i }));

      expect(screen.queryByRole("img", { name: /poster/i })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Poster")).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    it("refuses a file over the size limit without asking the wallet for anything", async () => {
      // The signature costs the organiser a popup and the upload costs them a
      // wait, and the server was always going to refuse it. Refusing here is
      // both faster and quieter.
      const user = userEvent.setup();
      render(<Harness />);

      await user.upload(screen.getByLabelText("Poster"), png("huge.png", 5 * 1024 * 1024 + 1));

      expect(await screen.findByRole("alert")).toHaveTextContent(/5 MB/i);
      expect(uploadEventFile).not.toHaveBeenCalled();
    });

    it("refuses a type the store does not host", async () => {
      // `accept` filters the picker, and `applyAccept: false` is how a test
      // reaches past it, which a person does by dragging the file in or by
      // switching the picker to "All files". SVG is the one that matters: the
      // backend refuses it deliberately, because served from our own origin it
      // is script, not a picture.
      const user = userEvent.setup({ applyAccept: false });
      render(<Harness />);

      const svg = new File(["<svg/>"], "poster.svg", { type: "image/svg+xml" });
      await user.upload(screen.getByLabelText("Poster"), svg);

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(uploadEventFile).not.toHaveBeenCalled();
    });

    it("says a declined signature is not a failure to fix, and lets it be tried again", async () => {
      const user = userEvent.setup();
      uploadEventFile.mockRejectedValueOnce(new Error("User declined the request"));
      render(<Harness />);

      await user.upload(screen.getByLabelText("Poster"), png());

      expect(await screen.findByRole("alert")).toHaveTextContent(/declined/i);
      expect(screen.queryByRole("img", { name: /poster/i })).not.toBeInTheDocument();

      uploadEventFile.mockResolvedValue({
        url: STORED,
        sha256: "abc",
        size: 64,
        contentType: "image/png",
        created: true,
      });
      await user.upload(screen.getByLabelText("Poster"), png());

      expect(await screen.findByRole("img", { name: /poster/i })).toHaveAttribute("src", STORED);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    it("says which half of the wait it is in, because they feel different", async () => {
      // ARCHITECTURE.md §4.5: a prompt sitting in another window is not the
      // same as nothing to do but wait, and a screen that confuses the two
      // looks broken.
      const user = userEvent.setup();
      let release = (): void => {};
      uploadEventFile.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                url: STORED,
                sha256: "abc",
                size: 64,
                contentType: "image/png",
                created: true,
              });
          }),
      );
      render(<Harness />);

      await user.upload(screen.getByLabelText("Poster"), png());

      expect(await screen.findByText(/wallet/i)).toBeInTheDocument();
      release();
      expect(await screen.findByRole("img", { name: /poster/i })).toBeInTheDocument();
    });

    it("does nothing at all when the picker is dismissed without a file", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.upload(screen.getByLabelText("Poster"), []);

      expect(uploadEventFile).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
