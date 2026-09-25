import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
export function checkedPath(p) {
  if (
    typeof p !== "string" ||
    !p ||
    p.includes("\\") ||
    p.includes(":") ||
    p.includes("%") ||
    p.startsWith("/") ||
    p.split("/").some((x) => !x || x === "." || x === "..")
  )
    throw Error("unsafe_catalogue_path");
  return p;
}
export async function boundedGet(
  url,
  { transport = fetch, maxBytes = 1048576, timeoutMs = 15000 } = {},
) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw Error("catalogue_https_required");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(parsed.href, {
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Agent-Control-External-Catalogue-Test",
      },
    });
    if (!response.ok) throw Error(`catalogue_http_${response.status}`);
    const advertised = Number(response.headers.get("content-length"));
    if (advertised > maxBytes) throw Error("catalogue_too_large");
    if (!response.body) throw Error("catalogue_empty_body");
    const reader = response.body.getReader(),
      chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw Error("catalogue_too_large");
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks);
    return {
      body,
      bytes,
      sha256: sha256(body),
      advertisedBytes:
        Number.isFinite(advertised) && advertised > 0 ? advertised : null,
      contentEncoding: response.headers.get("content-encoding"),
      etag: response.headers.get("etag"),
    };
  } finally {
    clearTimeout(timer);
  }
}
function strings(v) {
  return (
    Array.isArray(v) &&
    v.every((x) => typeof x === "string" && x.length > 0) &&
    new Set(v).size === v.length
  );
}
export function validateCatalogue(value, jobSchema) {
  if (!value || value.schema_version !== "1.0.0")
    throw Error("unsupported_catalogue_version");
  if (
    !versionPattern.test(value.library_version ?? "") ||
    !Array.isArray(value.jobs) ||
    value.jobs.length > 2000
  )
    throw Error("invalid_catalogue");
  if (!jobSchema) throw Error("pinned_job_schema_required");
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    validateFormats: false,
  });
  const valid = ajv.compile(jobSchema);
  const ids = new Set();
  for (const j of value.jobs) {
    if (!j || typeof j.id !== "string" || ids.has(j.id))
      throw Error("duplicate_or_invalid_job_identity");
    ids.add(j.id);
    if (
      j.spec_version !== "1.0.0" ||
      !versionPattern.test(j.version ?? "") ||
      typeof j.description !== "string" ||
      !strings(j.capabilities) ||
      !strings(j.connectors) ||
      !strings(j.credentials) ||
      !strings(j.files) ||
      !strings(j.tags) ||
      typeof j.common_job !== "boolean" ||
      !Array.isArray(j.permissions) ||
      !j.permissions.length ||
      !Array.isArray(j.provenance) ||
      !j.provenance.length ||
      !hashPattern.test(j.sha256 ?? "") ||
      !j.payload ||
      !j.evidence ||
      !j.approval ||
      !j.models ||
      !j.qualification
    )
      throw Error("invalid_job_metadata");
    const { path: jobPath, sha256: composite, payload, ...manifest } = j;
    checkedPath(jobPath);
    if (jobPath !== `jobs/${j.category}/${j.id}`)
      throw Error("job_path_identity_mismatch");
    if (valid && !valid(manifest))
      throw Error(`manifest_schema_invalid:${ajv.errorsText(valid.errors)}`);
    const keys = ["job.yaml", ...j.files].sort();
    if (
      new Set(keys).size !== keys.length ||
      JSON.stringify(keys) !== JSON.stringify(Object.keys(payload).sort())
    )
      throw Error("payload_manifest_mismatch");
    for (const p of keys) {
      checkedPath(p);
      if (!hashPattern.test(payload[p])) throw Error("invalid_payload_digest");
    }
    if (sha256(keys.map((p) => `${p}\0${payload[p]}`).join("\n")) !== composite)
      throw Error("job_digest_mismatch");
  }
  return structuredClone(value);
}
function validateSource(s) {
  if (
    !s ||
    !s.id ||
    !s.repository ||
    !s.release ||
    !s.revision ||
    !hashPattern.test(s.indexSha256 ?? "")
  )
    throw Error("source_identity_required");
  const base = new URL(s.resourceBaseUrl);
  if (
    base.protocol !== "https:" ||
    !base.pathname.endsWith("/") ||
    base.username ||
    base.password
  )
    throw Error("invalid_source_base");
  const index = new URL(s.indexUrl);
  if (index.origin !== base.origin || !index.pathname.startsWith(base.pathname))
    throw Error("source_origin_mismatch");
}
export function immutablePin(source, job) {
  return JSON.parse(
    JSON.stringify({
      sourceId: source.id,
      repository: source.repository,
      release: source.release,
      revision: source.revision,
      catalogueSha256: source.indexSha256,
      jobId: job.id,
      jobVersion: job.version,
      jobDigest: job.sha256,
      manifest: job,
      authorised: false,
      execution: "NOT_STARTED",
      qualified: false,
    }),
  );
}
export class ExternalJobCatalogue {
  constructor({ transport = fetch, jobSchema } = {}) {
    this.transport = transport;
    this.jobSchema = jobSchema;
    this.current = null;
    this.lastError = null;
  }
  snapshot() {
    return this.current
      ? structuredClone({
          ...this.current,
          stale: Boolean(this.lastError),
          lastRefreshError: this.lastError,
        })
      : null;
  }
  async refresh(source) {
    try {
      validateSource(source);
      const fetched = await boundedGet(source.indexUrl, {
        transport: this.transport,
      });
      if (fetched.sha256 !== source.indexSha256)
        throw Error("catalogue_digest_mismatch");
      const catalogue = validateCatalogue(
        JSON.parse(fetched.body.toString("utf8")),
        this.jobSchema,
      );
      const previous = this.current;
      const changes = { added: [], changed: [], removed: [] };
      for (const j of catalogue.jobs) {
        const old = previous?.catalogue.jobs.find((p) => p.id === j.id);
        if (!old) changes.added.push(j.id);
        else if (old.sha256 !== j.sha256) {
          if (old.version === j.version)
            throw Error("immutable_job_version_changed");
          changes.changed.push(j.id);
        }
      }
      for (const j of previous?.catalogue.jobs ?? [])
        if (!catalogue.jobs.some((p) => p.id === j.id))
          changes.removed.push(j.id);
      const unchanged = previous?.source.indexSha256 === source.indexSha256;
      this.current = {
        source: structuredClone(source),
        catalogue,
        checkedAt: new Date().toISOString(),
        changes,
        transfer: {
          bytes: fetched.bytes,
          advertisedBytes: fetched.advertisedBytes,
          contentEncoding: fetched.contentEncoding,
        },
        authorityGranted: false,
      };
      this.lastError = null;
      return {
        ...this.snapshot(),
        refreshState: unchanged ? "UNCHANGED" : "REVIEW_UPDATE",
      };
    } catch (e) {
      this.lastError = e.message;
      throw e;
    }
  }
  query({ search, category, capability, common } = {}) {
    if (!this.current) throw Error("catalogue_not_loaded");
    return this.current.catalogue.jobs
      .filter(
        (j) =>
          (!search ||
            JSON.stringify(j).toLowerCase().includes(search.toLowerCase())) &&
          (!category || j.category === category) &&
          (!capability || j.capabilities.includes(capability)) &&
          (common === undefined || j.common_job === common),
      )
      .map((j) => structuredClone(j));
  }
  pin(id) {
    if (this.lastError) throw Error("catalogue_refresh_failed_no_new_pin");
    const j = this.query().find((j) => j.id === id);
    if (!j) throw Error("job_missing");
    return immutablePin(this.current.source, j);
  }
  async manifest(id) {
    const pin = this.pin(id),
      j = pin.manifest;
    const url = new URL(
      `${checkedPath(j.path)}/job.yaml`,
      this.current.source.resourceBaseUrl,
    ).href;
    const got = await boundedGet(url, { transport: this.transport });
    if (got.sha256 !== j.payload["job.yaml"])
      throw Error("manifest_digest_mismatch");
    const m = parseYaml(got.body.toString("utf8"), {
      maxAliasCount: 0,
      uniqueKeys: true,
    });
    const { path, sha256, payload, ...expected } = j;
    if (JSON.stringify(m) !== JSON.stringify(expected))
      throw Error("manifest_catalogue_mismatch");
    return { pin, manifest: m, transfer: got.bytes };
  }
}

// Consumes native DiscoveryScan directly. No parallel estate store or runtime grants.
export function assessLegacyReadiness(
  job,
  scan,
  { now = new Date(), bindings = {} } = {},
) {
  if (
    scan?.schema !== "agent-control.environment-discovery/v1" ||
    !Array.isArray(scan.items)
  )
    throw Error("invalid_discovery_scan");
  const reasons = [],
    matched = [],
    observed = [];
  const add = (state, reason) => reasons.push({ state, reason });
  const age = (now - Date.parse(scan.completedAt)) / 1000;
  if (!Number.isFinite(age) || age < 0 || age > job.evidence.max_age_seconds)
    add("BLOCKED", "estate_snapshot_stale");
  if (scan.status !== "COMPLETED") add("BLOCKED", "estate_scan_incomplete");
  const good = (i) =>
    i.health === "HEALTHY" &&
    ["QUALIFIED", "ACTIVE"].includes(i.lifecycle) &&
    ["QUALIFIED", "ACTIVE"].includes(i.operationalState) &&
    i.provenance?.some(
      (p) =>
        p.authority === "AUTHORITATIVE" &&
        now - Date.parse(p.observedAt) >= 0 &&
        now - Date.parse(p.observedAt) <= job.evidence.max_age_seconds * 1000,
    );
  const match = (group, name) =>
    scan.items.find((i) => i.id === bindings[group]?.[name] && good(i));
  for (const i of scan.items)
    if (
      ["MACHINE", "GPU", "RUNTIME", "MODEL", "MCP", "CREDENTIAL"].includes(
        i.kind,
      )
    )
      observed.push({
        kind: i.kind,
        health: i.health,
        lifecycle: i.lifecycle,
        operationalState: i.operationalState,
        fingerprint: i.fingerprint,
      });
  for (const c of job.capabilities) {
    const i = match("capabilities", c);
    if (i) matched.push({ requirement: c, evidence: i.fingerprint });
    else add("UNSUPPORTED", `capability_not_verified:${c}`);
  }
  for (const c of job.connectors)
    if (!match("connectors", c)) add("CONNECTOR_REQUIRED", c);
  for (const c of job.credentials)
    if (!match("credentials", c)) add("CREDENTIAL_REQUIRED", c);
  for (const c of job.models.required)
    if (!match("models", c)) add("UNSUPPORTED", `model_capability:${c}`);
  if (
    !job.platforms.includes("any") &&
    !scan.items.some(
      (i) =>
        i.kind === "MACHINE" &&
        good(i) &&
        job.platforms.includes(i.attributes.platform),
    )
  )
    add("UNSUPPORTED", "platform");
  for (const r of job.resources)
    if (
      r.required &&
      !(
        bindings.resources?.[r.id]?.length >= r.count &&
        bindings.resources[r.id].every((id) =>
          scan.items.some((i) => i.id === id && good(i)),
        )
      )
    )
      add("CONFIGURATION_REQUIRED", `target_binding:${r.id}`);
  if (!bindings.configuredJobs?.includes(job.id))
    add("CONFIGURATION_REQUIRED", "reviewed_job_adapter");
  // Readiness never substitutes for the existing Work Parcel authority boundary.
  add("APPROVAL_REQUIRED", "execution_grant_not_supplied");
  const priority = [
    "BLOCKED",
    "UNSUPPORTED",
    "CONNECTOR_REQUIRED",
    "CREDENTIAL_REQUIRED",
    "CONFIGURATION_REQUIRED",
    "APPROVAL_REQUIRED",
  ];
  return {
    id: job.id,
    objective: job.description,
    primaryState:
      priority.find((s) => reasons.some((r) => r.state === s)) ?? "READY",
    reasons,
    matched,
    observed,
    authorityGranted: false,
    execution: "NOT_STARTED",
    qualification: job.qualification.status,
  };
}

// Technical readiness v2 is separate from the historical launch-compatibility projection.
export { assessReadiness } from './capability-binding.mjs';
