import assert from "node:assert/strict";
import test from "node:test";
import { SshFilesystemSessionReplicationBackend } from "./session-vault-ssh.js";
import type { ResourceConfig } from "./config.js";
import type { SshExecutor } from "./managed-node-ssh.js";

const resource: ResourceConfig = {
  id: "peer",
  platform: "linux",
  transport: {
    type: "ssh",
    host: "peer.example",
    user: "operator",
    port: 2222,
    identityFile: "/keys/peer",
  },
  capabilities: [],
};
test("peer-node backend installs one fixed helper and treats session bytes only as data", async () => {
  const calls: Array<{ args: string[]; input: string }> = [],
    executor: SshExecutor = async (_command, args, input) => {
      calls.push({ args, input });
      return {
        status: 0,
        stdout: args.includes("has") ? "no" : "ok",
        stderr: "",
      };
    },
    backend = new SshFilesystemSessionReplicationBackend(
      "peer",
      resource,
      "/var/lib/agent-control/session-vault",
      executor,
    );
  assert.equal(await backend.hasObject("a".repeat(64), false), false);
  await backend.putObject(
    "a".repeat(64),
    false,
    Buffer.from("operator supplied ; rm -rf / remains data"),
  );
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0]!.args.slice(-4), [
    "sh",
    "-s",
    "--",
    "/var/lib/agent-control/session-vault",
  ]);
  assert.deepEqual(calls[1]!.args.slice(-5), [
    "node",
    "/var/lib/agent-control/session-vault/.agent-control-session-vault-backend.cjs",
    "has",
    "/var/lib/agent-control/session-vault",
    "a".repeat(64) + ".object",
  ]);
  assert.equal(
    calls[3]!.args.some((value) => value.includes("operator supplied")),
    false,
  );
  assert.doesNotMatch(calls[3]!.input, /operator supplied/);
  assert.ok(calls[0]!.input.length > 100);
  assert.ok(calls[3]!.args.includes("ClearAllForwardings=yes"));
});

test("Windows resources and relative remote roots fail closed", () => {
  assert.throws(
    () =>
      new SshFilesystemSessionReplicationBackend(
        "bad",
        { ...resource, platform: "windows" },
        "/tmp/vault",
      ),
    /configuration_invalid/,
  );
  assert.throws(
    () =>
      new SshFilesystemSessionReplicationBackend(
        "bad",
        resource,
        "relative/vault",
      ),
    /configuration_invalid/,
  );
});
