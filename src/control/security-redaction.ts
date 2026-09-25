const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const PROVIDER_KEYS = [
  /\bnvapi-[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{10,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
];
const ASSIGNMENT = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|password|secret|session[_-]?token)\s*[:=]\s*[^\s,;]+/gi;

/** Redacts credential material before it can enter state, evidence, telemetry or an API projection. */
export function redactSensitiveText(value: string, runtimeCredentials: readonly string[] = []): string {
  let redacted = String(value);
  for (const credential of [...runtimeCredentials].filter((item): item is string => typeof item === 'string' && item.length >= 8).sort((left, right) => right.length - left.length)) {
    redacted = redacted.split(credential).join('[REDACTED CREDENTIAL]');
    const encoded = encodeURIComponent(credential);
    if (encoded !== credential) redacted = redacted.split(encoded).join('[REDACTED CREDENTIAL]');
  }
  redacted = redacted
    .replace(PRIVATE_KEY, '[REDACTED PRIVATE KEY]')
    .replace(BEARER, 'Bearer [REDACTED]');
  for (const pattern of PROVIDER_KEYS) redacted = redacted.replace(pattern, '[REDACTED API KEY]');
  return redacted.replace(ASSIGNMENT, '$1=[REDACTED]');
}

export function containsSensitiveMaterial(value: string): boolean {
  return redactSensitiveText(value) !== value;
}

export function redactSensitiveValue<T>(value: T, key = '', runtimeCredentials: readonly string[] = []): T {
  if (/^(?:authorization|cookie|set-cookie|password|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)$/i.test(key)) return '[REDACTED]' as T;
  if (typeof value === 'string') return redactSensitiveText(value, runtimeCredentials) as T;
  if (Array.isArray(value)) return value.map(item => redactSensitiveValue(item, '', runtimeCredentials)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, item]) => [name, redactSensitiveValue(item, name, runtimeCredentials)])) as T;
  return value;
}

export function assertNoSensitiveMaterial(value: string, error = 'credential_material_forbidden'): void {
  if (containsSensitiveMaterial(value)) throw new Error(error);
}
