// Diagrams the reader and the oracle are both held to.

/** The diagram the plan draws: two ways out of the first state, a check that can send work back, two ends. */
export const NOTE_TO_PLAN = `stateDiagram-v2
    classDef waiting stroke-dasharray: 4 4

    [*] --> NOTED
    NOTED --> DECLINED: not a repository I write into
    NOTED --> DRAFTED
    DRAFTED --> CHECKED
    DRAFTED --> DECLINED: no draft in the attempts allowed
    CHECKED --> DRAFTED: check is red
    CHECKED --> PR_OPEN
    PR_OPEN --> DONE
    DONE --> [*]
    DECLINED --> [*]

    class NOTED waiting
`;

/** Every class amy reads, beside the prose a reader elsewhere sees. */
export const ESCALATING = `---
title: escalating
---
stateDiagram-v2
    direction LR
    %% the owner is asked from anywhere, and the work resumes where it stopped
    accTitle: escalating
    accDescr {
      a workflow that hands work to its owner
    }
    [*] --> WORKING
    WORKING --> REVIEW : a pull request exists
    REVIEW --> DONE
    ASKED --> REVIEW
    DONE --> [*]
    note right of ASKED : reached from any state, returns where it was
    note left of REVIEW
      waits on the reviewer
    end note
    classDef attention fill:#fdd
    style WORKING stroke-width:2px
    class REVIEW waiting
    class ASKED anywhere
    class ASKED,REVIEW attention
    class ASKED returns
    class WORKING decorative
`;
