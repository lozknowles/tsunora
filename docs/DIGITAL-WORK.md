# Digital work

A WorkOrder binds identity, organisation, description, input, capabilities, permissions, qualification, deadline, budget, attempt bound, verifier and execution scope. The UI imports and reviews that contract; the runtime decides admission and allocation. A process exiting successfully does not prove the outcome: the verifier must pass.

Pipeline: receive → requirements → eligible workers → allocation → execute → verify → evidence → accounting → outcome. Failed attempts and retries remain in accounting. Work outside the bounded qualified contracts must not inherit their qualification.
