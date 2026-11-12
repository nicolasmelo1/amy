---
base: 42e8103c7fbc8ca82efbeeddb439bb310f72e042
sources:
  - { id: S1, kind: friction, said: "2026-11-12: a private project's screen proofs keep a picture and a video a reviewer opens, while its API proofs keep only which assertions passed: nobody can see what the API answered" }
  - { id: S2, kind: reference, ref: "plans/a-proof-runs-against-its-own-branch.md", said: "http.request returns status, headers and body; a screenshot or a recording is written in the project's artifact root and the proof record names the file" }
  - { id: S3, kind: code, ref: "plugins/prove/src/proof.ts", symbol: "ProofRecord", said: "a proof records each assertion's status, the code digest and the brief revision; it names no evidence file" }
  - { id: S4, kind: code, ref: "plugins/prove/src/resources.ts", symbol: "readResource", said: "a resource is capacity, up, check and down, and any other key is refused" }
  - { id: S5, kind: decision, said: "an API proof keeps each request and response as evidence, the way a screen proof keeps its video, and a played-back run shows them. Decided 2026-11-12" }
  - { id: S6, kind: decision, said: "a change to an API's contract proves its responses match the new OpenAPI schema, and the schema's diff is evidence too. Decided 2026-11-12" }
  - { id: S7, kind: reference, ref: "https://github.com/oasdiff/oasdiff", said: "oasdiff compares two OpenAPI 3.0 or 3.1 documents: changelog and breaking as JSON, diff as yaml, json or markdown; Apache-2.0, a Go binary on brew, releases and Docker" }
  - { id: S8, kind: reference, ref: "https://github.com/scalar/scalar/tree/main/packages/openapi-parser", said: "@scalar/openapi-parser validates, dereferences and upgrades OpenAPI 3.0 to 3.1 documents in TypeScript; MIT" }
  - { id: S9, kind: reference, ref: "https://ajv.js.org/json-schema.html", said: "Ajv validates every keyword of JSON Schema draft 2020-12, the dialect OpenAPI 3.1 schemas use, through its own 2020 class" }
  - { id: S10, kind: decision, said: "a call is kept as one JSON file per step: method, URL, headers and body both ways; credentials named by reference and Authorization, Cookie and Set-Cookie are written as [redacted]. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "a resource may name its contract, `openapi:` a path in the repository; it is read at the work's branch and at its base, and a resource naming none keeps calls only. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "a call to an operation the branch's contract documents is checked against that response's schema with no assertion written; a mismatch or an undocumented route fails the step's contract check. Proposed 2026-11-12" }
  - { id: S13, kind: decision, said: "an operation the diff changed that no call reached leaves the proof undecided, naming it, so a person decides rather than the proof passing quietly. Proposed 2026-11-12" }
touches:
  - plugins/http/src/evidence.ts
  - plugins/http/src/plugin.ts
  - plugins/http/tests/evidence.test.ts
  - plugins/http/tests/evidence.property.test.ts
  - plugins/http/README.md
  - plugins/prove/src/contract.ts
  - plugins/prove/src/resources.ts
  - plugins/prove/src/plugin.ts
  - plugins/prove/src/proof.ts
  - plugins/prove/src/assertions.ts
  - plugins/prove/package.json
  - plugins/prove/README.md
  - plugins/prove/tests/contract.test.ts
  - plugins/prove/tests/contract.property.test.ts
  - plugins/prove/tests/proof-record.test.ts
  - plugins/prove/tests/fixtures/openapi-base.yaml
  - plugins/prove/tests/fixtures/openapi-branch.yaml
  - plugins/prove/tests/fixtures/oasdiff-changelog.json
  - package-lock.json
  - docs/build/prove-a-phase.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/api-proof-scenario.sh
criteria:
  - { id: A1, statement: "each http.request step writes one evidence file in the project's artifact root, the request and the response, and the step's output names it", proof: "deferred:test:plugins/http/tests/evidence.test.ts", sources: [S1, S2, S5, S10] }
  - { id: A2, statement: "for any request, its credentials' values and any Authorization, Cookie or Set-Cookie header never appear in the evidence file", proof: "deferred:property:plugins/http/tests/evidence.property.test.ts#a_credential_written", sources: [S10] }
  - { id: A3, statement: "a body past 256 KiB is cut and says how many bytes were cut; a body that is not text is kept as its type and size", proof: "deferred:test:plugins/http/tests/evidence.test.ts", sources: [S10] }
  - { id: A4, statement: "a proof names every call file its steps kept, beside its pictures and videos, and amy prove show prints them", proof: "deferred:test:plugins/prove/tests/proof-record.test.ts", sources: [S2, S3, S5] }
  - { id: A5, statement: "a resource naming openapi reads the document at the work's branch and its base, and keeps oasdiff's changelog of the two as evidence", proof: "deferred:test:plugins/prove/tests/contract.test.ts", sources: [S4, S6, S7, S11] }
  - { id: A6, statement: "a call to a documented operation is checked on status and body against the branch's dereferenced 3.0 or 3.1 schema; a mismatch fails the step's contract check naming the pointer", proof: "deferred:test:plugins/prove/tests/contract.test.ts", sources: [S6, S8, S9, S12] }
  - { id: A7, statement: "for any body generated from a response schema the check passes, and dropping a required field or changing a type fails it", proof: "deferred:property:plugins/prove/tests/contract.property.test.ts#a_required_field_dropped", sources: [S9, S12] }
  - { id: A8, statement: "a call to a method and path the branch's contract does not document fails the step's contract check naming both", proof: "deferred:test:plugins/prove/tests/contract.test.ts", sources: [S12] }
  - { id: A9, statement: "an operation the changelog names that no call reached leaves the proof undecided, naming each; every changed operation reached leaves nothing", proof: "deferred:test:plugins/prove/tests/contract.test.ts", sources: [S6, S13] }
  - { id: A10, statement: "a resource naming no openapi keeps calls only, checks no contract and diffs nothing; one naming it without oasdiff installed is refused at mount naming the tool", proof: "deferred:test:plugins/prove/tests/contract.test.ts", sources: [S7, S11] }
  - { id: A11, statement: "the built plugins, in another process, prove against a stand-in API on a free port: calls kept redacted, a changed operation validated, a broken response refused", proof: "assertion:proof.an_api_proof_keeps_its_calls_and_its_contract", sources: [S1, S5, S6] }
crosses:
  - { mechanism: agent-replies, answer: n/a, why: "no agent reply is read differently; an agent step of a proof calls http.request as it did and the evidence is written by the operation" }
guarantee:
  - { holds: "every API call a proof made can be read afterwards, request and response, with no credential in it", not_against: "a secret the API itself returns in a response body, which is kept as the API sent it" }
  - { holds: "a changed operation is either reached and checked against its new schema, or the proof stays undecided", not_against: "a contract document that does not describe what the API really does" }
failures:
  - { step: contract, when: "the document does not parse or dereference", goes_to: "the proof is undecided, naming the file and the parser's reason" }
  - { step: contract, when: "the base has no document at that path", goes_to: "every documented operation counts as changed" }
cut:
  - "inferring a contract from the code when no document exists: a project names its document or has none"
  - "request validation against the contract: a proof checks what the API answers"
exit: "a ticket that adds a field to GET /invoices/{id} is proven only when a call reached it and its response matched the new schema; the proof keeps that call and the schema's changelog"
---
# An API proof keeps its calls and its contract

A screen proof keeps a picture and a video, while an API proof keeps only
pass or fail. This plan keeps every call as evidence, with credentials
redacted. When the work changes an API's OpenAPI contract, each changed
operation must be reached and match its new schema, and the diff is kept.
