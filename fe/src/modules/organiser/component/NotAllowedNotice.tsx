/**
 * The console's note for a wallet that is not on the organiser allowlist.
 *
 * A note, not `NotAllowlisted`'s full screen. That screen stands in front of
 * the wizard, where there is nothing else to do; here the wallet may still run
 * races of its own, and those have to stay visible below it (STE-36).
 *
 * The address is shown in full for the same reason as there: somebody asking
 * to be added has to be able to copy it.
 */
export function NotAllowedNotice({ address }: { address: string }) {
  return (
    <div className="rounded-lg border border-border bg-n-50 px-5 py-4">
      <p className="heading-strong text-lg text-ink">This wallet cannot publish new races yet</p>
      <p className="mt-1 max-w-3xl text-base text-n-600">
        Sterun keeps a list of the wallets allowed to publish a race, so nobody can put one up in
        somebody else{"'"}s name. Send this address to the Sterun team to be added. Races this
        wallet already runs stay yours to manage.
      </p>
      <p className="numeric mt-3 break-all text-sm text-foreground">{address}</p>
    </div>
  );
}
