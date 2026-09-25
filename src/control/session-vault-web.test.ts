import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  defaultCapabilities,
  type LaneState,
  type WorkspaceState,
} from "../state.js";
import { AgentControlService } from "./application-service.js";
import { PtyRegistry } from "./pty.js";
import { startWebDashboard } from "./web-server.js";
import {
  CodexSessionAdapter,
  ImmutableSessionVault,
  SessionVaultRuntime,
} from "./session-vault.js";

test("Session Vault dashboard API is authenticated, source-path safe and capture is an authenticated mutation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-vault-web-")),
    native = path.join(root, "native");
  fs.mkdirSync(native);
  fs.writeFileSync(
    path.join(native, "web.jsonl"),
    `${JSON.stringify({ timestamp: "2026-09-12T09:00:00Z", type: "session_meta", payload: { id: "web", cwd: "/private/repository" } })}\n`,
  );
  const runtime = new SessionVaultRuntime(
      new ImmutableSessionVault(path.join(root, "vault")),
      [new CodexSessionAdapter([native], "controller")],
      { sensitivity: "RESTRICTED", redactSensitive: true },
    ),
    lane: LaneState = {
      id: 1,
      name: "Primary",
      status: "waiting",
      model: "unassigned",
      reasoning: "medium",
      context: "0",
      lines: [],
      contract: {
        version: 2,
        laneId: 1,
        goal: "Await task",
        constraints: [],
        cwd: root,
        priority: 1,
        mode: "auto",
        capabilities: defaultCapabilities(),
        resourceLocks: {},
        modelLock: null,
        sharedTaskIds: [],
        updatedAt: new Date().toISOString(),
      },
      baton: {
        version: 1,
        laneId: 1,
        revision: 1,
        status: "waiting",
        progress: [],
        hypothesis: "",
        evidence: [],
        changes: [],
        nextAction: "wait",
        openQuestions: [],
        model: "unassigned",
        reasoning: "medium",
        updatedAt: new Date().toISOString(),
      },
      lease: { laneId: 1, holder: null, acquiredAt: null, expiresAt: null },
    },
    state: WorkspaceState = {
      version: 1,
      paused: false,
      lastRestorePoint: null,
      lanes: [lane],
    },
    service = new AgentControlService(
      state,
      new PtyRegistry(),
      undefined,
      "4.5.0-test",
      () => {},
    ),
    server = startWebDashboard(service, {
      host: "127.0.0.1",
      port: 0,
      operatorToken: "test-token",
      assetsDir: path.resolve("assets/dashboard"),
      sessionVault: runtime,
    });
  await once(server, "listening");
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    };
  assert.equal((await fetch(`${base}/api/session-vault`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/session-vault/discover`, {
        headers: { Authorization: "Bearer test-token" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/api/session-vault/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
  );
  const captured = await fetch(`${base}/api/session-vault/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({ providerId: "codex", nativeId: "web" }),
  });
  assert.equal(captured.status, 201);
  const projection = await (
    await fetch(`${base}/api/session-vault`, {
      headers: { Authorization: "Bearer test-token" },
    })
  ).json();
  assert.equal(projection.sessions, 1);
  assert.equal(JSON.stringify(projection).includes(native), false);
  assert.equal((await fetch(`${base}/dashboard-session-vault.js`)).status, 200);
  assert.equal(
    (await fetch(`${base}/dashboard-session-vault.css`)).status,
    200,
  );
});
