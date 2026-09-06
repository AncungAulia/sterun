import { ConnectionState } from "@/components/layouts/ConnectionState";

/**
 * Placeholder for the event directory (STE-13). What it proves today is what
 * STE-8 is for: the app boots, the design tokens are live, and a wallet can be
 * connected and read back.
 */
export default function DirectoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-16">
      <div className="max-w-2xl">
        <h1 className="heading-hero text-4xl text-ink sm:text-5xl">Verified race records</h1>
        <p className="mt-4 text-lg text-n-600">
          Entries, race pack collection and finish results are recorded on Stellar and bound to the
          runner. No transfer function exists, so a record cannot be resold.
        </p>
      </div>

      <ConnectionState />

      <p className="text-sm text-n-500">
        The event directory arrives in the next ticket. It reads events straight from testnet, so a
        new event appears here without redeploying this app.
      </p>
    </div>
  );
}
