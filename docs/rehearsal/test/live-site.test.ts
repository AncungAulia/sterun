/**
 * A 200 does not mean the app is live, and a ticket's status is never evidence.
 *
 * Both halves have gone wrong on this project: sterun.xyz was reported "live,
 * HTTP 200" while it was a Hostinger parked page, and the rehearsal's S.2 step
 * kept asserting "STE-32 is still Backlog" for two days after STE-32 shipped.
 *
 * Run: pnpm --filter be exec tsx --tsconfig ../docs/rehearsal/tsconfig.stage.json --test ../docs/rehearsal/test/live-site.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { verdictFor } from "../src/live-site";

const URL = "https://sterun.xyz";

test("a parked page answering 200 is not live", () => {
  const v = verdictFor(URL, { status: 200, body: "<html><title>Parked Domain name on Hostinger DNS system</title></html>" });
  assert.equal(v.live, false);
  assert.equal(v.placeholder, true);
  assert.match(v.reason, /parking placeholder/);
});

test("a real page answering 200 is live", () => {
  const v = verdictFor(URL, { status: 200, body: "<html><title>Sterun: runs you can't fake</title><body>How it works</body></html>" });
  assert.equal(v.live, true);
  assert.equal(v.placeholder, false);
});

test("a non-2xx is not live, whatever the body says", () => {
  for (const status of [301, 404, 500, 503]) {
    const v = verdictFor(URL, { status, body: "Sterun" });
    assert.equal(v.live, false, `status ${status}`);
    assert.match(v.reason, new RegExp(String(status)));
  }
});

test("an unreachable host is reported as unreachable, not as a placeholder", () => {
  const v = verdictFor(URL, { status: 0, body: "" });
  assert.equal(v.live, false);
  assert.equal(v.placeholder, false);
  assert.match(v.reason, /could not be reached/);
});

test("the other common parking wordings are caught too", () => {
  for (const body of ["Future home of something quite cool", "This domain is for sale", "Default Web Site Page"]) {
    assert.equal(verdictFor(URL, { status: 200, body }).live, false, body);
  }
});

test("an empty body is not a placeholder — an empty read is a tool limit, not a fact about the site", () => {
  // The rule from CLAUDE.md, pinned: a thin response must never be reported as
  // "the site is nearly empty". It is live unless something says otherwise.
  const v = verdictFor(URL, { status: 200, body: "" });
  assert.equal(v.live, true);
  assert.equal(v.placeholder, false);
});
