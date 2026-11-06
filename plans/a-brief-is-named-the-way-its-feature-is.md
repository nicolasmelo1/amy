---
base: 26de19c8574aed6e08c5576742c142cb2ffb3efd
sources:
  - { id: S1, kind: code, ref: "plugins/linear/src/LinearTracker.ts", said: "a child ticket's briefId is node.parent.id, the Linear uuid; the same parent read as a feature (toFeature) is named node.identifier" }
  - { id: S2, kind: code, ref: "packages/workflow-feature-grooming/src/groom.ts", said: "feature-grooming writes a brief under feature.id, the identifier" }
  - { id: S3, kind: code, ref: "packages/workflow-ticket-to-qa/src/lanes.ts", said: "ticket-to-qa asks the brief store for ticket.briefId and reads null as no brief" }
  - { id: S4, kind: friction, said: "a private workflow looked its declaration up by briefId, found a file named by the uuid absent instead of the one named PROJ-1200.yaml, and passed the ticket through grooming as if nothing was groomed; it was built against no brief" }
  - { id: S5, kind: decision, said: "briefId, and featureId on updated groomed work, are the parent's identifier; a test holds a child and its feature to one name, and fails when they drift" }
touches:
  - plugins/linear/src/LinearTracker.ts
  - plugins/linear/tests/LinearTracker.test.ts
  - plugins/linear/tests/LinearTracker.features.test.ts
criteria:
  - { id: A1, statement: "a child ticket's briefId is its parent's identifier, and the query selects it", proof: "test:plugins/linear/tests/LinearTracker.test.ts", sources: [S1, S4, S5] }
  - { id: A2, statement: "a child's briefId equals the id its parent is read by as a feature", proof: "test:plugins/linear/tests/LinearTracker.features.test.ts", sources: [S1, S2, S3, S5] }
  - { id: A3, statement: "updated groomed work names its feature by the parent's identifier", proof: "test:plugins/linear/tests/LinearTracker.features.test.ts", sources: [S1, S2, S5] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "test:plugins/linear/tests/LinearTracker.features.test.ts" }
guarantee:
  - { holds: "every Ticket and GroomedWork this adapter returns names its brief the way getFeature and features name the feature", not_against: "a parent re-keyed in Linear (moved to another team) between two looks: the identifier changes and the brief written under the old one is not found" }
  - { holds: "a ticket with no parent carries no briefId", not_against: "a parent that is not a feature (no Feature label): its identifier is carried as the brief id all the same, as the uuid was" }
failures:
  - { step: inProgress, when: "Linear answers a parent without an identifier", goes_to: "the GraphQL contract test refuses the answer; at runtime briefId is undefined and the ticket reads as having no brief, as a parentless one does" }
cut:
  - "migrating a brief already written under a uuid: no store writes under one (S2), so there is nothing to migrate"
exit: "a ticket under a groomed feature reaches that feature's brief by its briefId, in ticket-to-qa and in any workflow keyed the same way"
---
# A brief is named the way its feature is

The adapter named one Linear issue two ways — the uuid as a ticket's parent, the identifier as a feature — so every lookup of a brief by `ticket.briefId` missed, and missed quietly.
