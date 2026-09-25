import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('scripts/provision-android.mjs'), 'utf8');

test('Android provisioning is config driven and safe when unconfigured', () => {
  assert.match(source, /loadConfig/);
  assert.match(source, /UNCONFIGURED/);
  assert.match(source, /androidResource\.transport/);
  assert.doesNotMatch(source, /ANDROID_HOST|ANDROID_USER|ANDROID_SSH_PORT|ANDROID_IDENTITY_FILE/);
});

test('privileged Android install path cannot capture or pass a password', () => {
  assert.doesNotMatch(source, /sudo\s+-S|readline|process\.stdin|stdin/);
  assert.match(source, /sudo.*-n.*PRIVILEGED_HELPER.*install-adb/);
  const helper = fs.readFileSync(path.resolve('scripts/agent-control-privileged'), 'utf8');
  assert.match(helper, /\[ "\$\{1-\}" != install-adb \]/);
  assert.doesNotMatch(helper, /\$@|\$\*|sudo|sh -c|bash -c/);
});

test('artifact, package and installed hook are independently verified', () => {
  assert.match(source, /termux_boot_artifact_hash_changed_after_verification/);
  assert.match(source, /verifyTermuxBootPackage/);
  assert.match(source, /sha256sum.*TERMUX_HOOK_SOURCE/);
});

test('reboot qualification requires explicit approval and configured keyed SSH', () => {
  assert.match(source, /--approve-reboot-test/);
  assert.match(source, /PasswordAuthentication=no/);
  assert.match(source, /BatchMode=yes/);
  assert.match(source, /android_ssh_transport_incomplete/);
});
