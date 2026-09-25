# Fixed Agent Control collector, supplied on stdin by the native SSH adapter.
# REQUEST is data decoded by the adapter prefix, not executable caller input.
import datetime, hashlib, os, platform, re, subprocess

identity = subprocess.check_output(['systemd-id128', 'machine-id'], text=True, timeout=2).strip()
if not re.fullmatch('[a-fA-F0-9]{32}', identity):
    raise RuntimeError('machine_identity_unavailable')
identity_hash = hashlib.sha256(('agent-control-machine/v1:' + identity.lower()).encode()).hexdigest()
del identity
cpu = os.cpu_count()
try:
    memory = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
except (ValueError, OSError):
    memory = None
missing = ([] if cpu else ['CPU_UNAVAILABLE']) + ([] if memory else ['MEMORY_UNAVAILABLE'])
cpu_model = None
gpus = {'status': 'UNAVAILABLE', 'devices': []}
# Optional hardware inventory uses fixed metadata utilities, never caller commands.
# Keep controller identity-only collection fast and independent of GPU drivers.
if REQUEST['resourceAlias'] != 'controller':
    try:
        result = subprocess.check_output(['lscpu', '--json'], text=True, timeout=2,
                                         stderr=subprocess.DEVNULL, env={**os.environ, 'LC_ALL': 'C'})
        rows = json.loads(result).get('lscpu', [])
        cpu_model = next((r['data'].strip() for r in rows if r.get('field') == 'Model name:'), None)
        if not isinstance(cpu_model, str) or not re.fullmatch(r'[\x20-\x7e]{1,160}', cpu_model):
            cpu_model = None
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        pass
    try:
        result = subprocess.check_output(['nvidia-smi', '--query-gpu=index,name,memory.total,driver_version',
                                          '--format=csv,noheader,nounits'], text=True, timeout=2,
                                         stderr=subprocess.DEVNULL)
        devices = []
        for row in result.strip().splitlines():
            index, model, memory_mib, driver = [v.strip() for v in row.split(',')]
            if not (index.isdigit() and re.fullmatch(r'[\x20-\x7e]{1,160}', model)
                    and memory_mib.isdigit() and int(memory_mib) > 0
                    and re.fullmatch(r'[0-9][0-9.\-]{0,63}', driver)):
                raise ValueError('unsupported_gpu_metadata')
            devices.append({'index': int(index), 'model': model, 'memoryMiB': int(memory_mib), 'driver': driver})
        if len(devices) > 32 or len({v['index'] for v in devices}) != len(devices):
            raise ValueError('invalid_gpu_inventory')
        gpus = {'status': 'OBSERVED', 'devices': sorted(devices, key=lambda v: v['index'])}
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
print(json.dumps({
    'schema': 'agent-control.estate-remote/v1',
    'method': 'systemd-machine-identity+python-os-metadata/v1',
    'resourceAlias': REQUEST['resourceAlias'], 'nonce': REQUEST['nonce'],
    'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
    'status': 'PARTIAL' if missing else 'COMPLETE',
    'host': {'identitySha256': identity_hash, 'platform': platform.system().lower(), 'architecture': platform.machine()},
    'cpuCount': cpu, 'memoryBytes': memory, 'missing': missing,
    'cpuModel': cpu_model, 'gpuInventory': gpus
}, separators=(',', ':')))
