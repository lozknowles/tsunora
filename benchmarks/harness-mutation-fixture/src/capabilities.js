export function normalizeCapabilities(values) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error('capabilities_invalid');
  return values.map(value => value.trim().toLowerCase()).filter(Boolean);
}

export function hasAllCapabilities(available, required) {
  const normalized = new Set(normalizeCapabilities(available));
  return normalizeCapabilities(required).every(capability => normalized.has(capability));
}
