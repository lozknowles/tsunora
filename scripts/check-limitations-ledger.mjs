import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const STATUS = new Set([
  "OPEN",
  "RESOLVED",
  "PARTIALLY_RESOLVED",
  "SUPERSEDED",
  "ACCEPTED_LIMITATION",
  "NEEDS_REQUALIFICATION",
  "NOT_REPRODUCIBLE",
  "EXTERNAL_BLOCKER",
]);
const CLOSURE = new Set(["NONE", "ENGINEERING", "QUALIFICATION_ONLY", "ACCEPTED", "EXTERNAL"]);
const QUALIFICATION = new Set([
  "PRESENT",
  "PARTIAL",
  "NOT_IMPLEMENTED",
  "PASS",
  "QUALIFIED",
  "QUALIFIED_NEGATIVE",
  "NOT_QUALIFIED",
  "NOT_APPLICABLE",
  "NOT_REPRODUCIBLE",
]);

export async function validateLimitationsLedger(path = new URL("../evidence/limitations/agent-control-limitations.json", import.meta.url)) {
  const ledger = JSON.parse(await readFile(path, "utf8"));
  const errors = [];
  const fail = (condition, message) => { if (!condition) errors.push(message); };

  fail(ledger.schema === "agent-control.limitations-ledger/v1", "unexpected ledger schema");
  fail(ledger.authoritativeComparisonRelease === "v4.10.0", "comparison release must be v4.10.0");
  fail(ledger.authoritativeComparisonCommit === "6102d4889a836c6477cd70d574df9fadee9cea4a", "comparison commit is not the public v4.10.0 commit");
  fail(Array.isArray(ledger.releaseInventory) && ledger.releaseInventory.length === 28, "release inventory must contain all 28 public tags");
  fail(Array.isArray(ledger.records) && ledger.records.length > 0, "ledger contains no limitation records");
  fail(ledger.auditMethod?.keywordCandidateCount > 0, "raw candidate inventory count is absent");
  fail(/^[a-f0-9]{64}$/.test(ledger.auditMethod?.keywordCandidateArtifactSha256 ?? ""), "raw candidate inventory checksum is invalid");

  const releases = new Set();
  for (const item of ledger.releaseInventory ?? []) {
    fail(/^v\d+\.\d+\.\d+$/.test(item.release ?? ""), `invalid release name: ${item.release}`);
    fail(/^[a-f0-9]{40}$/.test(item.commit ?? ""), `invalid release commit: ${item.release}`);
    fail(!releases.has(item.release), `duplicate release: ${item.release}`);
    releases.add(item.release);
    fail(Array.isArray(item.limitationSources), `missing limitation sources: ${item.release}`);
  }

  if (ledger.candidateRelease) {
    fail(/^v\d+\.\d+\.\d+$/.test(ledger.candidateRelease), "candidate release is invalid");
    releases.add(ledger.candidateRelease);
  }

  const ids = new Set();
  for (const [index, record] of (ledger.records ?? []).entries()) {
    const expected = `AC-LIM-${String(index + 1).padStart(4, "0")}`;
    fail(record.id === expected, `non-sequential stable ID: expected ${expected}, received ${record.id}`);
    fail(!ids.has(record.id), `duplicate limitation ID: ${record.id}`);
    ids.add(record.id);
    fail(STATUS.has(record.currentStatus), `${record.id}: uncontrolled status ${record.currentStatus}`);
    fail(CLOSURE.has(record.closureClass), `${record.id}: uncontrolled closure class ${record.closureClass}`);
    fail(releases.has(record.firstReleaseObserved), `${record.id}: first release is not public`);
    fail(typeof record.originalWording === "string" && record.originalWording.length > 0, `${record.id}: original wording missing`);
    fail(typeof record.firstEvidenceReference === "string" && record.firstEvidenceReference.length > 0, `${record.id}: first evidence missing`);
    fail(Array.isArray(record.evidenceReferences) && record.evidenceReferences.length > 0, `${record.id}: evidence missing`);
    fail(record.evidenceReferences?.includes(record.firstEvidenceReference), `${record.id}: first evidence is not retained in evidence list`);
    for (const key of ["implementation", "automated", "physical", "production"]) {
      fail(QUALIFICATION.has(record.qualification?.[key]), `${record.id}: invalid ${key} qualification`);
    }
    if (record.currentStatus === "RESOLVED" || record.currentStatus === "SUPERSEDED") {
      fail(releases.has(record.resolutionRelease), `${record.id}: resolution release missing or not public`);
      fail(Array.isArray(record.resolutionEvidence) && record.resolutionEvidence.length > 0, `${record.id}: resolution evidence missing`);
      fail(record.closureClass === "NONE", `${record.id}: resolved item still has a closure class`);
    } else {
      fail(record.resolutionRelease === null, `${record.id}: unresolved item has a resolution release`);
    }
    fail(record.resolutionRelease !== "v4.11.0", `${record.id}: v4.11 may not close a v4.10 audit record`);
    fail(!(record.resolutionEvidence ?? []).some((value) => value.startsWith("v4.11")), `${record.id}: v4.11 evidence may not prove closure`);
  }

  fail(Array.isArray(ledger.historicalMetrics) && ledger.historicalMetrics.length === ledger.releaseInventory?.length, "historical metrics must cover every release");
  for (const [index, metric] of (ledger.historicalMetrics ?? []).entries()) {
    fail(metric.release === ledger.releaseInventory[index]?.release, `metric order mismatch at ${metric.release}`);
    const expectedOpen = metric.carriedForward + metric.newLimitations - metric.resolvedOrSuperseded;
    fail(metric.totalKnownOpenAfterRelease === expectedOpen, `${metric.release}: open count does not reconcile`);
  }

  return { ledger, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ledger, errors } = await validateLimitationsLedger();
  if (errors.length) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    const current = ledger.records.filter((record) => !["RESOLVED", "SUPERSEDED"].includes(record.currentStatus)).length;
    console.log(`limitations ledger valid: ${ledger.releaseInventory.length} releases, ${ledger.records.length} records, ${current} current`);
  }
}
