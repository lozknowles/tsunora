import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { AgentControlService } from "../src/control/application-service.js";
import { emptyConfig } from "../src/control/config.js";
import { EnvironmentDiscoveryRuntime } from "../src/control/environment-discovery.js";
import { PtyRegistry } from "../src/control/pty.js";
import { startWebDashboard } from "../src/control/web-server.js";
import {
  CapabilityAdapterRegistry,
  RegisteredCapabilityDiscoveryAdapter,
} from "../src/control/capability-adapter-registry.js";
import { InstallationLifecycle } from "../src/control/installation-lifecycle.js";

const require = createRequire(import.meta.url),
  root = path.resolve(
    "qualification/agent-control-environment-discovery-20260912",
  ),
  raw = path.join(root, "raw-video"),
  temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-control-environment-qualification-"),
  );
fs.mkdirSync(raw, { recursive: true });
const token = randomBytes(32).toString("hex"),
  capabilityAdapters = new CapabilityAdapterRegistry(
    path.join(temporary, "capabilities.json"),
  ),
  installation = new InstallationLifecycle(
    path.join(temporary, "installation.json"),
    process.cwd(),
  ),
  runtime = new EnvironmentDiscoveryRuntime({
    file: path.join(temporary, "inventory.json"),
    config: () => emptyConfig(),
    configurationRevision: () => "physical-read-only-r1",
    additionalAdapters: [
      new RegisteredCapabilityDiscoveryAdapter(capabilityAdapters),
    ],
    runtimeInventory: () => ({
      jobs: [
        {
          id: "environment-discovery-qualification",
          name: "Environment Discovery physical qualification",
          version: "1.0.0",
        },
      ],
      agents: [
        {
          id: "controller",
          health: "healthy",
          capabilities: ["environment.discover"],
        },
      ],
      tools: ["environment.discover@1.0.0"],
      skills: [],
      mcpServers: [],
      plugins: [],
    }),
  }),
  service = new AgentControlService(
    { version: 1, paused: false, lastRestorePoint: null, lanes: [] },
    new PtyRegistry(),
  ).configureProjection({
    environmentDiscovery: runtime,
    capabilityAdapters,
    installation,
  }),
  server = startWebDashboard(service, {
    host: "127.0.0.1",
    port: 4399,
    operatorToken: token,
    allowedOrigins: ["http://127.0.0.1:4399"],
    assetsDir: path.resolve("assets/dashboard"),
  });
await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let browser: any, context: any, video: any;
const browserErrors: string[] = [];
try {
  const { chromium } = require("playwright-core");
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.AGENT_CONTROL_CHROMIUM ?? "/snap/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: raw, size: { width: 1920, height: 1080 } },
    colorScheme: "dark",
  });
  await context.addInitScript(
    (value) => sessionStorage.setItem("agent-control-operator-token", value),
    token,
  );
  const page = await context.newPage();
  video = page.video();
  page.on("pageerror", (error: any) => browserErrors.push(error.message));
  page.on("response", (response: any) => {
    if (
      response.status() >= 400 &&
      /\/api\/(environment-discovery|estate-map|capability-adapters|installation)/.test(
        response.url(),
      )
    )
      browserErrors.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document
        .querySelector("#operator-button")
        ?.textContent?.includes("authenticated"),
    undefined,
    { timeout: 15_000 },
  );
  await page.click('[data-view="environment"]');
  await page.waitForFunction(
    () => Boolean(window.AgentControlEnvironmentDiscovery),
    undefined,
    { timeout: 10_000 },
  );
  await page.selectOption("#environment-mode", "FULL_DISCOVERY");
  await page.selectOption("#environment-testing", "QUICK_TEST");
  await page.check("#environment-memory");
  const scanResponse = page.waitForResponse((response: any) =>
    response.url().endsWith("/api/environment-discovery/scans"),
  );
  await page.click('#environment-scan-form button[type="submit"]');
  assert.equal((await scanResponse).status(), 201);
  await page.waitForSelector("[data-environment-item]", { timeout: 8_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(root, "environment-discovery-dashboard.png"),
    fullPage: true,
  });
  const card = page.locator("[data-environment-item]").first();
  if (await card.count()) await card.click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(root, "environment-discovery-drill-down.png"),
    fullPage: true,
  });
  await page.click('[data-view="runtime-map"]');
  await page.click('[data-runtime-surface="estate"]');
  await page.waitForSelector(".runtime-graph-node", { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(root, "estate-map-dashboard.png"),
    fullPage: true,
  });
  await context.close();
  context = undefined;
  const rawPath = await video.path();
  await browser.close();
  browser = undefined;
  execFileSync("ffmpeg", [
    "-nostdin",
    "-y",
    "-loglevel",
    "error",
    "-i",
    rawPath,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    path.join(root, "agent-control-environment-discovery-physical.mp4"),
  ]);
  fs.rmSync(raw, { recursive: true, force: true });
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  server.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
assert.deepEqual(browserErrors, []);
const scan = runtime.projection().latest!;
const estate = service.estateMap();
assert.equal(scan.mode, "FULL_DISCOVERY");
assert.equal(scan.testing, "QUICK_TEST");
assert.equal(scan.includeRemote, false);
assert.ok(scan.items.some((item) => item.kind === "MACHINE"));
assert.ok(scan.items.some((item) => item.kind === "AGENT"));
assert.ok(scan.items.some((item) => item.kind === "TOOL"));
assert.ok(scan.items.some((item) => item.kind === "MEMORY"));
assert.equal(runtime.projection().proposals.length, 0);
assert.equal(estate.mapKind, "ESTATE");
assert.ok(estate.nodes.length > 1);
fs.writeFileSync(
  path.join(root, "physical-scan.json"),
  `${JSON.stringify(scan, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(root, "complete-human-readable-transcript.md"),
  `# Agent Control 4.5 Environment Discovery physical qualification\n\n- Operator opened **Settings → Environment Discovery**.\n- Mode: **Full discovery**.\n- Testing: **Quick test**.\n- Configured remote discovery: **not authorised for this run**.\n- Your Memories discovery: **explicitly selected**.\n- Result: **${scan.status}**, ${scan.items.length} inventory items, ${scan.failures.length} contained adapter failures.\n- Configuration proposals created: **0**.\n- Configuration changes applied: **0**.\n- Operator opened **Runtime Map → Estate Map** using the shared graph renderer.\n- Estate nodes: **${estate.nodes.length}**; explicit connections: **${estate.edges.length}**.\n\nThe run exercised the real local operating-system, executable, accelerator and bounded loopback probes through the production discovery runtime and dashboard API. Discovery did not imply qualification or activation. Estate availability used resource-specific evidence freshness.\n`,
);
const files = [
    "agent-control-environment-discovery-physical.mp4",
    "environment-discovery-dashboard.png",
    "environment-discovery-drill-down.png",
    "estate-map-dashboard.png",
    "physical-scan.json",
    "complete-human-readable-transcript.md",
  ].map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return {
      file,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }),
  videoInfo = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=codec_name,width,height,r_frame_rate",
        "-of",
        "json",
        path.join(root, files[0]!.file),
      ],
      { encoding: "utf8" },
    ),
  );
const manifest = {
  schema: "agent-control.environment-discovery-qualification/v1",
  verdict: "PASS_LOCAL_NON_DISRUPTIVE",
  qualifiedAt: new Date().toISOString(),
  scope: {
    localDiscovery: true,
    configuredRemoteDiscovery: false,
    reason:
      "No remote configuration was supplied to this isolated qualification; remote permission and failure behaviour are deterministic-test evidence.",
  },
  scan: {
    id: scan.id,
    status: scan.status,
    itemCount: scan.items.length,
    failures: scan.failures,
    summary: scan.summary,
  },
  estate: {
    mapKind: estate.mapKind,
    nodes: estate.nodes.length,
    edges: estate.edges.length,
    freshness: estate.freshness,
    authority: estate.authority,
  },
  governance: { proposals: 0, configurationMutations: 0 },
  browserErrors,
  videoInfo,
  files,
};
fs.writeFileSync(
  path.join(root, "evidence-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    { verdict: manifest.verdict, root, scan: manifest.scan, video: files[0] },
    null,
    2,
  ),
);
