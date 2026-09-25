# Fixed read-only Android/Termux metadata collector. REQUEST arrives as data.
# Android hardware identifiers are unavailable to this unprivileged process.
import datetime, hashlib, os, platform, re, subprocess

def prop(name):
    try:
        value = subprocess.check_output(['/system/bin/getprop', name], text=True, timeout=2, stderr=subprocess.DEVNULL).strip()
        return value if re.fullmatch(r'[\x20-\x7e]{1,160}', value) else None
    except (OSError, subprocess.SubprocessError):
        return None

# This is a PUBLIC host-key fingerprint, not a private key or hardware serial.
# The bootstrap independently matches it against the existing trusted SSH key.
result = subprocess.check_output(['ssh-keygen', '-E', 'sha256', '-lf', '/data/data/com.termux/files/usr/etc/ssh/ssh_host_ed25519_key.pub'], text=True, timeout=2, stderr=subprocess.DEVNULL)
fingerprint = result.split()[1]
if not re.fullmatch(r'SHA256:[A-Za-z0-9+/]{43}', fingerprint):
    raise RuntimeError('ssh_installation_identity_unavailable')
identity_hash = hashlib.sha256(('agent-control-android-ssh-host/v1:' + fingerprint).encode()).hexdigest()
del result, fingerprint
cpu = os.cpu_count()
try:
    memory = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
except (ValueError, OSError):
    memory = None
missing = ([] if cpu else ['CPU_UNAVAILABLE']) + ([] if memory else ['MEMORY_UNAVAILABLE']) + ['PHYSICAL_IDENTITY_UNAVAILABLE']
print(json.dumps({
    'schema': 'agent-control.estate-remote/v1', 'method': 'termux-ssh-host-key+android-metadata/v1',
    'resourceAlias': REQUEST['resourceAlias'], 'nonce': REQUEST['nonce'],
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
    'status': 'PARTIAL',
    'host': {'identitySha256': identity_hash, 'platform': 'android', 'architecture': platform.machine(), 'identityScope': 'SSH_INSTALLATION'},
    'cpuCount': cpu, 'memoryBytes': memory, 'cpuModel': prop('ro.soc.model'),
    'gpuInventory': {'status': 'UNAVAILABLE', 'devices': []},
    'deviceModel': prop('ro.product.model'), 'osVersion': prop('ro.build.version.release'), 'missing': missing
}, separators=(',', ':')))
