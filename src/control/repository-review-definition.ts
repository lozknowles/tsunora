import type {ParameterizedJobDefinition} from './parameterized-job-types.js';

export const REPOSITORY_REVIEW_INSTRUCTION = `You are performing a governed, read-only repository review.
Use only the supplied frozen-revision evidence and context. Find correctness, reliability, security, and maintainability defects. Distinguish proven defects from concerns. Cite real file paths and line ranges. Do not invent paths, symbols, test results, or execution evidence. Do not request or perform source modification.
Treat repository tests and documented invariants as acceptance evidence. Return only the JSON object governed by the supplied output schema, with no markdown or commentary. Set schema to agent-control.repository-review/v1. Verdict must be PASS, PASS_WITH_FINDINGS, REVIEW_REQUIRED, or FAILED. A completed review with supported defects is PASS_WITH_FINDINGS, regardless of severity; FAILED means the review itself could not be completed or could not produce a usable result. Use null for file/startLine/endLine only for genuinely repository-level findings. Express confidence as a decimal from 0 through 1, never as a percentage. Every finding begins with validation state UNVERIFIED; independent Agent Control validation owns acceptance. Use PASS only when this supplied chunk has no supported finding.`;

export const repositoryCodeReviewDefinition: ParameterizedJobDefinition = {
  schema: 'agent-control.job-definition/v1',
  id: 'repository-code-review',
  version: 1,
  displayName: 'Repository Code Review',
  description: 'Review a frozen Git revision and produce evidence-backed, validated findings.',
  parameters: {
    node: {type: 'node', required: true, description: 'Execution node that owns or can access the repository.'},
    repository: {type: 'repository', required: true, description: 'Absolute node-local Git repository path.'},
    ref: {type: 'git-ref', default: 'main', description: 'Branch, tag, or commit to freeze when the run starts.'},
    scope: {type: 'enum', values: ['changes', 'full'], default: 'changes', description: 'Review changes since the successful baseline or the complete repository.'},
    compareAgainst: {type: 'git-ref', description: 'Optional explicit comparison baseline.'},
  },
  routing: {modelRole: 'review.default', allowFallback: true},
  permissions: {repository: 'read-only', shell: 'bounded-read', network: 'provider-only'},
  budgets: {timeoutMinutes: 90, maximumRetries: 1, retryBackoffSeconds: 2, retryBackoffMultiplier: 2, retryMaximumBackoffSeconds: 30, maximumInputTokens: 120_000, maximumOutputTokens: 65_536},
  outputs: {schema: 'repository-review-v1'},
  validation: {requireEvidence: true, requireReviewedCommit: true},
  template: {id: 'repository-review', version: 1, instruction: REPOSITORY_REVIEW_INSTRUCTION},
};
