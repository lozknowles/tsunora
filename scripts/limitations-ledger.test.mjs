import assert from "node:assert/strict";
import test from "node:test";

import { validateLimitationsLedger } from "./check-limitations-ledger.mjs";

test("historical limitations ledger is internally consistent", async () => {
  const { ledger, errors } = await validateLimitationsLedger();
  assert.deepEqual(errors, []);
  assert.equal(ledger.releaseInventory.at(-1).release, "v4.10.0");
  assert.equal(ledger.historicalMetrics.at(-1).totalKnownOpenAfterRelease, 53);
});

test("v4.11 does not retroactively close audited historical limitations", async () => {
  const { ledger } = await validateLimitationsLedger();
  const related = ledger.records.filter((record) => record.flags.includes("RELATED_TO_V4_11"));
  assert.ok(related.length > 0);
  assert.ok(related.every((record) => record.resolutionRelease !== "v4.11.0"));
  assert.ok(related.every((record) => !record.resolutionEvidence.some((item) => item.startsWith("v4.11"))));
});

test("physical limitations are not closed by automated evidence alone", async () => {
  const { ledger } = await validateLimitationsLedger();
  const resolved = ledger.records.filter((record) => record.currentStatus === "RESOLVED");
  assert.ok(resolved.every((record) => !["NOT_QUALIFIED", "PARTIAL"].includes(record.qualification.physical)));
});
