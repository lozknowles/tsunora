import {assertNoSensitiveMaterial} from './security-redaction.js';

export const GOVERNED_REQUEST_ORIGIN_SCHEMA = 'agent-control.request-origin/v1' as const;
export type GovernedRequestModality = 'text' | 'voice-confirmed-by-text' | 'dashboard' | 'internal';

/**
 * Safe, provider-neutral provenance for the request that initiated governed work.
 * Transport identities remain one-way references; credential and sender material
 * must never cross this boundary.
 */
export interface GovernedRequestOrigin {
  schema: typeof GOVERNED_REQUEST_ORIGIN_SCHEMA;
  channel: string;
  modality: GovernedRequestModality;
  receivedAt: string;
  authentication: string;
  actorId: string;
  authority: string[];
  messageReference: string;
  identityReference: string;
  request: string;
  confirmationReference?: string;
  transcriptionAuthority?: 'untrusted-confirmed-by-text';
}

const LABEL = /^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,191}$/;
const REFERENCE = /^[a-f0-9]{64}$/;

export function governedRequestOrigin(input: Omit<GovernedRequestOrigin, 'schema'>): GovernedRequestOrigin {
  if (!LABEL.test(input.channel) || !LABEL.test(input.authentication) || !LABEL.test(input.actorId)) throw new Error('request_origin_identity_invalid');
  if (!REFERENCE.test(input.messageReference) || !REFERENCE.test(input.identityReference) || input.confirmationReference && !REFERENCE.test(input.confirmationReference)) throw new Error('request_origin_reference_invalid');
  if (!Number.isFinite(Date.parse(input.receivedAt))) throw new Error('request_origin_timestamp_invalid');
  if (!input.request.trim() || input.request.length > 65_536) throw new Error('request_origin_request_invalid');
  if (!Array.isArray(input.authority) || input.authority.some(value => !LABEL.test(value))) throw new Error('request_origin_authority_invalid');
  assertNoSensitiveMaterial(input.request, 'request_origin_credential_material_forbidden');
  const value: GovernedRequestOrigin = {schema: GOVERNED_REQUEST_ORIGIN_SCHEMA, ...structuredClone(input), request: input.request.trim()};
  assertNoSensitiveMaterial(JSON.stringify(value), 'request_origin_credential_material_forbidden');
  return value;
}
