import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { AgentControlService } from "./application-service.js";
import { emptyConfig } from "./config.js";
import {
  EnvironmentDiscoveryRuntime,
  type DiscoveryAdapter,
} from "./environment-discovery.js";
import { PtyRegistry } from "./pty.js";
import { startWebDashboard } from "./web-server.js";

test("Environment Discovery API and assets use the existing operator boundary", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "environment-web-")),
    adapter: DiscoveryAdapter = {
      id: "fixture",
      discover: async (context) => [
        {
          id: "machine:fixture",
          kind: "MACHINE",
          label: "Fixture controller",
          nodeId: "controller",
          health: "HEALTHY",
          lifecycle: "DISCOVERED",
          attributes: { platform: "fixture" },
          provenance: [
            {
              adapter: "fixture",
              method: "bounded",
              observedAt: context.observedAt,
              authority: "AUTHORITATIVE",
            },
          ],
        },
      ],
    },
    runtime = new EnvironmentDiscoveryRuntime({
      file: path.join(root, "state.json"),
      config: () => emptyConfig(),
      configurationRevision: () => "r1",
      adapters: [adapter],
    }),
    service = new AgentControlService(
      { version: 1, paused: false, lastRestorePoint: null, lanes: [] },
      new PtyRegistry(),
    ).configureProjection({ environmentDiscovery: runtime }),
    server = startWebDashboard(service, {
      host: "127.0.0.1",
      port: 0,
      operatorToken: "test-token",
      assetsDir: path.resolve("assets/dashboard"),
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
  assert.equal((await fetch(`${base}/api/environment-discovery`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/environment-discovery`, {
        headers: { Authorization: "Bearer test-token" },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/api/environment-discovery/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
  );
  const response = await fetch(`${base}/api/environment-discovery/scans`, {
    method: "POST",
    headers,
    body: JSON.stringify({ mode: "QUICK_RESCAN", testing: "QUICK_TEST" }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).items[0].label, "Fixture controller");
  const estate = await fetch(`${base}/api/estate-map`, {
    headers: { Authorization: "Bearer test-token" },
  });
  assert.equal(estate.status, 200);
  assert.equal((await estate.json()).mapKind, "ESTATE");
  assert.equal(
    (await fetch(`${base}/dashboard-environment-discovery.js`)).status,
    200,
  );
  assert.equal(
    (await fetch(`${base}/dashboard-environment-discovery.css`)).status,
    200,
  );
  assert.equal((await fetch(`${base}/dashboard-installation.js`)).status, 200);
});

test("dashboard exposes discovery, capability, bootstrap and shared Estate Map controls", () => {
  const html = fs.readFileSync(
      path.resolve("assets/dashboard/index.html"),
      "utf8",
    ),
    script = fs.readFileSync(
      path.resolve("assets/dashboard/dashboard-environment-discovery.js"),
      "utf8",
    ),
    map = fs.readFileSync(
      path.resolve("assets/dashboard/dashboard-runtime-map.js"),
      "utf8",
    );
  for (const phrase of [
    "Environment Discovery",
    "FIRST_RUN",
    "QUICK_RESCAN",
    "FULL_DISCOVERY",
    "Include\\s+configured\\s+remote\\s+machines",
    "DISCOVERED → QUALIFIED → RECOMMENDED → APPROVED → ACTIVE",
    "Add Capability",
    "Installation",
    "PROCESS MAP",
    "ESTATE MAP",
  ])
    assert.match(html, new RegExp(phrase));
  assert.match(script, /No configuration was activated/);
  assert.match(script, /mutateCapability\(button\)\.catch\(showError\)/);
  assert.match(script, /finally \{ setBusy\(false\); \}/);
  assert.match(map, /api\/estate-map/);
  assert.doesNotMatch(script, /api[-_]?key|bearer token|credential value/i);
  const referencedIds = [...script.matchAll(/querySelector\(["'`]#([a-zA-Z0-9_-]+)/g)].map((match) => match[1]);
  for (const id of new Set(referencedIds)) assert.match(html, new RegExp(`id=["']${id}["']`), `dashboard element #${id} must exist`);
});
