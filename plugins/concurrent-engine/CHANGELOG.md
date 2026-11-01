# @amykit/plugin-concurrent-engine

## 0.7.0

### Minor Changes

- 8b21570: **A workflow runs on lanes.** A diagram may draw `state X <<fork>>` and
  `state Y <<join>>`: every line out of the fork is a lane, every lane is a
  call, so a record of its own, and the caller moves to the join once every
  lane has ended, holding where each ended and what it returned, keyed by lane.
  There is no setting for how many: the number of lanes is the number of lines
  drawn. Before this, work that could run side by side ran one piece after the
  other, or was written by hand in a runtime the diagram never showed.
  
  A lane that escalates leaves its siblings running, and the fork says which
  lane needs the person — in its wait, in `callStanding`, and in `amy status`,
  which draws the lanes side by side. A lane takes a lease on the branch it
  writes before it checks it out, and a branch another lane holds is a wait that
  costs no attempt. A binding's `revision` lends a lane a tree detached at the
  caller's commit, read-only. Refused at boot, by name: a lane that is not a
  call, a lane that never reaches its join, a join no fork meets at, a decision
  written for a fork, and two lanes bound to the same literal branch.
  
  `@amykit/plugin-concurrent-engine` is the serial engine with the lanes of a
  fork moved at once, each asked of the budget before its call. The serial
  engine stays the default, and moves them in turn.
  
  **`ticket-to-qa` runs its gate and its self-review as two lanes.** `CHECKED`
  and `SELF_REVIEW` are gone: a finished implementation goes to `checks`, where
  the gate and the review both check the implementation's commit, and meet at
  `verdict`. A change either one refuses goes back to the implementation with
  what both said, in one round — before, a change the gate refused went back
  without what the review would have said, and the review never saw the rules
  the gate holds. The review now ends on a verdict: a line saying
  `CHANGES_ASKED` sends the work back, anything else approves. The rounds count
  toward `maxGateAttempts`. A record an older version saved in `CHECKED` or
  `SELF_REVIEW` goes straight to `checks` on its next look and is checked again
  in both lanes, without implementing again. A ticket that leaves its repository
  while it is being checked stops where it is, as it did in `CHECKED`.

### Patch Changes

- Updated dependencies [b761f29]
- Updated dependencies [2c7324c]
- Updated dependencies [1ad01d3]
- Updated dependencies [ebae48c]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [8b21570]
- Updated dependencies [3649573]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
  - @amykit/plugin-serial-engine@0.7.0
