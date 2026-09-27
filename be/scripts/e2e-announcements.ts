/**
 * STE-40 — signed event announcements, end to end against a running deployment.
 *
 *     pnpm --filter be e2e:announcements https://api-sterun.jameshub.fun
 *
 * On testnet: a throwaway organiser creates a race, publishes an announcement
 * signed the way a browser wallet signs (SEP-53), and reads it back from the
 * public list. It is then re-verified the way a third party would, with no trust
 * in the API: `verifyAnnouncement` from the published `@sterunxyz/sdk` code path,
 * and the organiser read from the chain. A stranger's announcement, a back-dated
 * one and a tampered body are refused; the same signed announcement twice is one.
 *
 * Needs STERUN_ADMIN_SECRET (testnet) in be/.env for the throwaway event.
 */
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { SterunClient, TESTNET, announcementMessage, verifyAnnouncement } from "@sterunxyz/sdk";
import { loadConfig } from "../src/config.js";
import { loadEnvFile } from "../src/env.js";

const base = (process.argv[2] ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const log = (message: string) => console.log(message);
const step = (message: string) => console.log(`\n▸ ${message}`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

interface AnnouncementJson {
  id: string;
  event_id: number;
  published_at: string;
  body: string;
  signer: string;
  signature: string;
  scheme: string;
  network_passphrase: string;
  event_registry: string;
  message: string;
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const adminSecret = process.env.STERUN_ADMIN_SECRET;
  assert(adminSecret, "STERUN_ADMIN_SECRET is not set (be/.env, testnet only)");

  const contracts = { eventRegistry: config.addresses.eventRegistry, raceRecord: config.addresses.raceRecord };
  const sterun = new SterunClient({ ...TESTNET, contracts });
  log(`Sterun signed announcements — ${base}`);

  step("A throwaway organiser creates a race");
  const organiser = Keypair.random();
  const stranger = Keypair.random();
  const funded = await fetch(`${config.network.friendbotUrl}?addr=${organiser.publicKey()}`);
  assert(funded.ok, `friendbot answered ${funded.status}`);
  await sterun.addOrganiser(organiser.publicKey(), SterunClient.as(Keypair.fromSecret(adminSecret)));
  const { value: eventId } = await sterun.createEvent(
    {
      organiser: organiser.publicKey(),
      name: `Sterun announcements e2e ${new Date().toISOString().slice(0, 10)}`,
      metadataHash: randomBytes(32).toString("hex"),
      uri: "https://sterun.xyz/events/announcements-e2e.json",
      startsAt: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    },
    SterunClient.as(organiser),
  );
  log(`  event ${eventId}, organiser ${organiser.publicKey()}`);

  /** What the console will send after the wallet signs with signMessage. */
  const signed = (kp: Keypair, body: string, publishedAt = new Date().toISOString()) => {
    const message = announcementMessage({
      networkPassphrase: config.network.passphrase,
      eventRegistry: config.addresses.eventRegistry,
      eventId,
      publishedAt,
      body,
    });
    return {
      published_at: publishedAt,
      body,
      signer: kp.publicKey(),
      signature: Buffer.from(kp.signMessage(message)).toString("base64"),
    };
  };
  const publish = (payload: Record<string, unknown>) =>
    fetch(`${base}/events/${eventId}/announcements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  step("The organiser publishes an announcement, signed like a browser wallet signs");
  const text = "Karena izin venue, start dipindah ke Lapangan Banteng.\nJadwal tetap.";
  const payload = signed(organiser, text);
  const created = await publish(payload);
  const createdBody = (await created.json()) as AnnouncementJson;
  assert(created.status === 201, `publish answered ${created.status}: ${JSON.stringify(createdBody)}`);
  assert(createdBody.scheme === "sep53", `scheme ${createdBody.scheme}`);
  log(`  201, announcement ${createdBody.id}, scheme ${createdBody.scheme}`);

  step("The same signed announcement again is the same announcement");
  const again = await publish(payload);
  const againBody = (await again.json()) as AnnouncementJson;
  assert(again.status === 200 && againBody.id === createdBody.id, `resubmit answered ${again.status}, id ${againBody.id}`);
  log(`  200, id ${againBody.id}`);

  step("Anyone reads it, and re-verifies it without trusting the API");
  const listed = await fetch(`${base}/events/${eventId}/announcements`);
  const listBody = (await listed.json()) as { count: number; announcements: AnnouncementJson[] };
  assert(listed.status === 200 && listBody.count === 1, `list answered ${listed.status}, count ${listBody.count}`);
  const [a] = listBody.announcements as [AnnouncementJson];
  assert(a.body === text, "the body came back changed");
  const verdict = verifyAnnouncement({
    networkPassphrase: a.network_passphrase,
    eventRegistry: a.event_registry,
    eventId: a.event_id,
    publishedAt: a.published_at,
    body: a.body,
    signer: a.signer,
    signature: a.signature,
  });
  assert(verdict.valid, "verifyAnnouncement rejected the published announcement");
  const onChain = await sterun.getEvent(eventId);
  assert(onChain.organiser === a.signer, `signer ${a.signer} is not the on-chain organiser ${onChain.organiser}`);
  log(`  public list: 1; signature valid (${verdict.valid ? verdict.scheme : "-"}); signer is getEvent(${eventId}).organiser`);

  step("A stranger's announcement is refused");
  const fromStranger = await publish(signed(stranger, "The race is cancelled."));
  assert(fromStranger.status === 403, `stranger answered ${fromStranger.status}`);
  log("  403");

  step("A back-dated announcement is refused");
  const backDated = await publish(signed(organiser, "Parking at gate 3.", new Date(Date.now() - 60 * 60_000).toISOString()));
  const backDatedBody = (await backDated.json()) as { error: string };
  assert(backDated.status === 400 && backDatedBody.error === "stale-announcement", `back-dated answered ${backDated.status} ${backDatedBody.error}`);
  log("  400 stale-announcement");

  step("A tampered body is refused");
  const tampered = await publish({ ...signed(organiser, "Parking at gate 3."), body: "The race is cancelled." });
  const tamperedBody = (await tampered.json()) as { error: string };
  assert(tampered.status === 401 && tamperedBody.error === "bad-signature", `tampered answered ${tampered.status} ${tamperedBody.error}`);
  log("  401 bad-signature");

  const finalCount = ((await (await fetch(`${base}/events/${eventId}/announcements`)).json()) as { count: number }).count;
  assert(finalCount === 1, `the refused announcements were stored: count ${finalCount}`);
  log("\n✓ an organiser's announcement is published once, verifiable by anyone, and nobody else's is");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
