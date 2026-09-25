import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { InstallationLifecycle } from "./installation-lifecycle.js";
test("clean existing checkout reaches setup required without mutating repository", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-control-install-"));
  try {
    fs.mkdirSync(path.join(root, "assets/dashboard"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets/dashboard/index.html"), "ok");
    execFileSync("git", ["-C", root, "init"]);
    execFileSync("git", [
      "-C",
      root,
      "config",
      "user.email",
      "fixture@example.invalid",
    ]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-m", "fixture"]);
    const before = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      runtime = new InstallationLifecycle(
        path.join(root, ".state/install.json"),
        root,
        () => new Date("2026-09-12T12:00:00Z"),
      ),
      result = runtime.inspect();
    assert.equal(result.state, "SETUP_REQUIRED");
    assert.equal(result.safeToProceed, true);
    assert.equal(
      execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      before,
    );
    assert.equal(
      execFileSync("git", ["-C", root, "status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
      "?? .state/",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("dirty repository fails closed as repair required", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-control-install-"));
  try {
    fs.mkdirSync(path.join(root, "assets/dashboard"), { recursive: true });
    fs.writeFileSync(path.join(root, "assets/dashboard/index.html"), "ok");
    execFileSync("git", ["-C", root, "init"]);
    execFileSync("git", [
      "-C",
      root,
      "config",
      "user.email",
      "fixture@example.invalid",
    ]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-m", "fixture"]);
    fs.writeFileSync(path.join(root, "dirty"), "change");
    const runtime = new InstallationLifecycle(
        path.join(os.tmpdir(), `agent-control-install-${process.pid}.json`),
        root,
      ),
      result = runtime.inspect("UPDATE");
    assert.equal(result.state, "REPAIR_REQUIRED");
    assert.equal(result.safeToProceed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
