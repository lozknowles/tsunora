# Nested Execution Change Review

## Scope

This review compares public Agent Control 4.7.1 at `ead48c896ff2e0551bf6b140186948fe12b4cff2` with the isolated experiment commit `c9ff96706cca2b17341aa24e46322201bb38fdf8`. It reviews product suitability; the physical experiment result is evidence, not authority to merge.

Classification: A generic core capability; B reusable adapter capability; C Podroid-specific integration; D experimental or test-only; E accidental coupling; F unnecessary.

## File-by-file review

| Changed file in `c9ff967` | Class | Finding | Candidate disposition |
|---|---|---|---|
| `docs/managed-nodes.md` | A/B | Describes per-resource timeout and executable discovery, but the experiment wording did not define the wider topology or accounting boundary. | Retain and rewrite as generic nested-environment guidance. |
| `scripts/managed-node-probe.sh` | B | Adds bounded executable-presence observations for Podman, Docker and LXC. It does not inspect secrets or claim runtime readiness. | Retain as adapter-level discovery. |
| `src/control/config.ts` | A | Adds a bounded per-resource probe timeout, avoiding a global slow-guest policy. | Retain unchanged. |
| `src/control/estate-map.test.ts` | D | Proves explicit same-node nesting and rejection of missing, cyclic and cross-node parents. | Retain and add typed-contract coverage. |
| `src/control/estate-map.ts` | A/E | The evidence gate is sound, but `attributes.executionParentId` is an untyped experimental encoding embedded in the renderer. | Replace product logic with a typed optional containment contract; keep a backward-compatible legacy reader. |
| `src/control/managed-node-ssh.test.ts` | D | Proves bounded timeout propagation only. | Retain and add distinct failure-class tests. |
| `src/control/managed-node-ssh.ts` | A | Makes the probe deadline resource-specific and bounded. | Retain; add typed timeout/authentication/transport/command/capability failure evidence. |
| `src/control/managed-node.test.ts` | D | Proves detected-only capabilities for three container runtimes. | Retain and add runtime-observation and failure-projection coverage. |
| `src/control/managed-node.ts` | B | Maps executable presence to detected-only capabilities. It has no container inventory or resource-accounting model. | Retain and project safe generic runtime observations. |

No changed file in `c9ff967` is class C or F. The experiment harness, device address, guest key reference, image digest and Podroid lifecycle controls were outside the repository and are not product code.

## Coupling audit

The changed production code contains no Pixel, Android, Alpine, QEMU, private address, device identifier, fixed SSH port or Podroid assumption. It names Podman, Docker and LXC only as independent container-discovery adapters. SSH remains one transport implementation, not part of the topology schema.

The product candidate removes the only accidental coupling: Estate rendering no longer owns the ad hoc `executionParentId` interpretation. A shared validator now accepts the typed relation and reads the original encoding only for backward compatibility.

## Genericity decisions

| Capability | Would make sense without Podroid? | Decision |
|---|---|---|
| Container executable discovery | Yes | Retain as adapter discovery. |
| Per-resource probe timeout | Yes | Retain in core. |
| Evidence-backed nested Estate relationships | Yes | Generalise through a typed optional contract. |
| SSH discovery and execution | Yes | Keep as one existing transport adapter. |
| Parent/child environment relationships | Yes | Add generic records and validation. |
| Capability inheritance | Only when explicitly evidenced | Do not add implicit inheritance. Route against capabilities recorded on the selected environment/worker. |
| Resource reporting | Yes | Separate physical, allocated, guest-visible, runtime-limit and measured scopes. |
| Container representation | Yes | Add safe runtime/container observation contracts without sensitive configuration. |
| Evidence relationships | Yes | Require evidence identifiers and observation timestamps. |
| Mallow routing | Yes | Resolve deterministically from requested capability, device constraint, environment, runtime and healthy worker. |

## Review conclusion

`c9ff967` contains useful generic foundations but is not sufficient by itself as a product model. With the typed containment, accounting, runtime-observation, failure-classification and capability-routing changes documented in the integration candidate, the retained design remains platform, runtime, provider, model and worker neutral.
