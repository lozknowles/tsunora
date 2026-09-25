# Tsunora architecture

Tsunora product shell → existing authenticated HTTP API → Agent Control runtime → optional Digital Labour Exchange → trusted execution backend → verifier → ledger.

Product vocabulary: TSUNORA CONTROL, WORK, WORKFORCE, SKILLS, TOOLS, EXCHANGE, EVIDENCE, LEDGER, MEMORY. This vocabulary is not an assertion that each is a separate implemented service.

The product shell imports complete WorkOrder contracts, displays their scope and verifier for review, then submits them unchanged. It cannot grant permissions, qualify workers, clear quarantine or bypass stopped admission. Operator credentials remain in page memory. Lost connection clears observed state. The root dashboard remains the full runtime control surface; the product entry is /tsunora.html.

Digital Labour Exchange is optional and disabled unless explicitly configured by the inherited module gate. Its single-writer ledger, backend revision fencing, reservations and contract-bound settlement remain unchanged. No production service, runtime API, CLI name, schema namespace, persistence format or provider adapter is renamed.

This is an incremental product architecture: work-first exchange navigation and evidence inspection are delivered; a general natural-language outcome composer, integrated skill/tool authoring and universal workforce are not.

Recommend keeping Agent Control separately consumable now. A stable runtime API boundary can support a later extraction if measured operational need justifies it. Do not restructure into a library merely for branding.
