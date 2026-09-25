import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertNoSensitiveMaterial,
  redactSensitiveValue,
} from "./security-redaction.js";

export type InstallationState =
  | "NOT_INSTALLED"
  | "BOOTSTRAP_RUNNING"
  | "DASHBOARD_AVAILABLE"
  | "SETUP_REQUIRED"
  | "DISCOVERY_RUNNING"
  | "REVIEW_REQUIRED"
  | "QUALIFICATION_REQUIRED"
  | "READY_TO_APPLY"
  | "ACTIVE"
  | "REPAIR_REQUIRED"
  | "ROLLBACK_AVAILABLE"
  | "BOOTSTRAP_FAILED";
export type InstallationMode =
  | "FRESH_INSTALL"
  | "EXISTING_CHECKOUT"
  | "UPDATE"
  | "REPAIR"
  | "DEVELOPER_INSTALL";
export type InstallationRole = "CONTROL_NODE" | "WORKER_NODE";
export interface InstallationInspection {
  schema: "agent-control.installation/v1";
  id: string;
  observedAt: string;
  mode: InstallationMode;
  role: InstallationRole;
  state: InstallationState;
  repository: {
    root: string;
    exists: boolean;
    isGit: boolean;
    head: string | null;
    branch: string | null;
    origin: string | null;
    clean: boolean | null;
    ahead: number | null;
    behind: number | null;
    integrity: "VERIFIED" | "DIRTY" | "DIVERGED" | "UNAVAILABLE";
  };
  prerequisites: Array<{
    id: string;
    required: boolean;
    available: boolean;
    version: string | null;
  }>;
  dashboard: { assetsPresent: boolean; configurationPresent: boolean };
  nextAction: string;
  safeToProceed: boolean;
  sha256: string;
}
interface Store {
  version: 1;
  current: InstallationInspection | null;
  history: InstallationInspection[];
}
export class InstallationLifecycle {
  private value: Store;
  constructor(
    private readonly file: string,
    private readonly root: string,
    private readonly clock = () => new Date(),
  ) {
    this.value = this.load();
  }
  projection() {
    return redactSensitiveValue({
      schema: "agent-control.installation/v1",
      current: this.value.current,
      history: this.value.history,
    }) as {
      schema: string;
      current: InstallationInspection | null;
      history: InstallationInspection[];
    };
  }
  inspect(
    mode: InstallationMode = "EXISTING_CHECKOUT",
    role: InstallationRole = "CONTROL_NODE",
  ) {
    const observedAt = this.clock().toISOString(),
      exists = fs.existsSync(this.root),
      isGit = exists && fs.existsSync(path.join(this.root, ".git")),
      head = isGit ? git(this.root, ["rev-parse", "HEAD"]) : null,
      branch = isGit ? git(this.root, ["branch", "--show-current"]) : null,
      origin = isGit ? git(this.root, ["remote", "get-url", "origin"]) : null,
      status = isGit ? git(this.root, ["status", "--porcelain"]) : null,
      counts = isGit
        ? git(this.root, [
            "rev-list",
            "--left-right",
            "--count",
            "HEAD...@{upstream}",
          ])
        : null,
      [ahead, behind] = counts?.split(/\s+/).map(Number) ?? [null, null],
      clean = status === "" ? true : status === null ? null : false,
      integrity: InstallationInspection["repository"]["integrity"] = !isGit
        ? "UNAVAILABLE"
        : clean === false
          ? "DIRTY"
          : Number(ahead) > 0 && Number(behind) > 0
            ? "DIVERGED"
            : "VERIFIED",
      prerequisites = [
        probe("node", true, ["--version"]),
        probe("npm", true, ["--version"]),
        probe("git", true, ["--version"]),
      ],
      assetsPresent = fs.existsSync(
        path.join(this.root, "assets/dashboard/index.html"),
      ),
      configurationPresent = Boolean(
        process.env.AGENT_CONTROL_CONFIG &&
        fs.existsSync(process.env.AGENT_CONTROL_CONFIG),
      ),
      requiredMissing = prerequisites.some(
        (value) => value.required && !value.available,
      ),
      state: InstallationState = !exists
        ? "NOT_INSTALLED"
        : requiredMissing
          ? "BOOTSTRAP_FAILED"
          : integrity === "DIRTY" || integrity === "DIVERGED"
            ? "REPAIR_REQUIRED"
            : !assetsPresent
              ? "BOOTSTRAP_FAILED"
              : configurationPresent
                ? "DASHBOARD_AVAILABLE"
                : "SETUP_REQUIRED",
      safeToProceed =
        !requiredMissing && integrity === "VERIFIED" && assetsPresent,
      base: Omit<InstallationInspection, "sha256"> = {
        schema: "agent-control.installation/v1",
        id: `installation-${randomUUID()}`,
        observedAt,
        mode,
        role,
        state,
        repository: {
          root: this.root,
          exists,
          isGit,
          head,
          branch,
          origin,
          clean,
          ahead,
          behind,
          integrity,
        },
        prerequisites,
        dashboard: { assetsPresent, configurationPresent },
        nextAction: next(state),
        safeToProceed,
      };
    const inspection: InstallationInspection = {
      ...base,
      sha256: createHash("sha256").update(JSON.stringify(base)).digest("hex"),
    };
    assertNoSensitiveMaterial(
      JSON.stringify(inspection),
      "installation_inspection_secret_forbidden",
    );
    this.value.current = inspection;
    this.value.history.push(inspection);
    this.value.history = this.value.history.slice(-30);
    this.persist();
    return structuredClone(inspection);
  }
  private load(): Store {
    if (!fs.existsSync(this.file))
      return { version: 1, current: null, history: [] };
    const value = JSON.parse(fs.readFileSync(this.file, "utf8")) as Store;
    if (value.version !== 1 || !Array.isArray(value.history))
      throw new Error("installation_state_invalid");
    assertNoSensitiveMaterial(
      JSON.stringify(value),
      "installation_state_secret_forbidden",
    );
    return value;
  }
  private persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(
      temporary,
      `${JSON.stringify(redactSensitiveValue(this.value), null, 2)}\n`,
      { mode: 0o600 },
    );
    fs.renameSync(temporary, this.file);
  }
}
function git(root: string, args: string[]) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
    }).trim();
  } catch {
    return null;
  }
}
function probe(id: string, required: boolean, args: string[]) {
  try {
    return {
      id,
      required,
      available: true,
      version:
        execFileSync(id, args, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 1500,
        })
          .trim()
          .split(/\r?\n/)[0] ?? null,
    };
  } catch {
    return { id, required, available: false, version: null };
  }
}
function next(state: InstallationState) {
  return {
    NOT_INSTALLED:
      "Run the explicit bootstrap command with a reviewed target directory.",
    BOOTSTRAP_RUNNING: "Wait for the bounded bootstrap operation.",
    DASHBOARD_AVAILABLE: "Open the dashboard and start Environment Discovery.",
    SETUP_REQUIRED: "Open the dashboard and start First Run Setup.",
    DISCOVERY_RUNNING: "Review discovery progress.",
    REVIEW_REQUIRED: "Review discovered resources individually.",
    QUALIFICATION_REQUIRED: "Choose skip, quick test or full qualification.",
    READY_TO_APPLY: "Approve the governed configuration Work Parcel.",
    ACTIVE: "No installation action required.",
    REPAIR_REQUIRED:
      "Review repository dirt/divergence; no automatic reset or pull will occur.",
    ROLLBACK_AVAILABLE: "Select a documented known-good checkpoint.",
    BOOTSTRAP_FAILED:
      "Resolve the reported required prerequisite or integrity failure.",
  }[state];
}
