---
title: Events
description: Every event kind and the exact shape of its detail — from the contract the log is validated against.
group: Reference
order: 5
---

# Event reference

Read out of `packages/core/events.json`, which is the contract a validator
checks the log against and which is hash-locked so a rename cannot happen
without a reviewer seeing it.

Every line also carries `at`, `kind` and `build`. See
[Events](../concepts/events.md).

## Every kind

<!-- amy:generated event-kinds -->

| Kind | Written when | Always carries |
| :-- | :-- | :-- |
| `action.failed` | One action threw, and what it said. | `workId` |
| `action.finished` | One action finished without throwing. | `workId` |
| `action.started` | One action began. | `workId` |
| `agent.handoff` | An agent was handed over to another one, and which axis moved. | `workId` |
| `agent.run` | An agent ran: which harness, which model, what it cost. | `workId`, `state` |
| `budget.parked` | Work was parked because a budget window is nearly spent. | `workId`, `state` |
| `notify.failed` | An announcement could not be delivered, and what it said. | `workId`, `state` |
| `run.claimed` | The engine took an item off the queue, and why it was there. | `workId` |
| `run.idle` | Nothing was due, so the engine did nothing. | _nothing beyond `at` and `kind`_ |
| `stop.enforced` | The engine obeyed the handbrake, and what it did not start. | _nothing beyond `at` and `kind`_ |
| `stop.requested` | The operator pulled the handbrake. | _nothing beyond `at` and `kind`_ |
| `work.advanced` | The work moved to another state. | `workId`, `state` |
| `work.degraded` | This work started failing, and the engine is still retrying underneath. | `workId`, `state` |
| `work.failed` | One attempt at this work threw, and which attempt it was. | `workId`, `state` |
| `work.planned` | A workflow decided what to do next, and said why. | `workId`, `state` |
| `work.recovered` | This work is moving again, after however many attempts had failed. | `workId`, `state` |
| `work.settled` | The work reached a terminal state and left the queue. | `workId`, `state` |
| `work.waiting` | The work stayed where it was, to be looked at again later. | `workId`, `state` |

<!-- amy:end event-kinds -->

## What each `detail` holds

<!-- amy:generated event-detail -->

**`action.failed`**

| Field | Type |
| :-- | :-- |
| `action` | `string` |
| `error` | `string` |

**`action.finished`**

| Field | Type |
| :-- | :-- |
| `action` | `string` |

**`action.started`**

| Field | Type |
| :-- | :-- |
| `action` | `string` |

**`agent.handoff`**

| Field | Type |
| :-- | :-- |
| `action` | `string` |
| `cause` | `string` |
| `from` | `object` |
| `to` | `object` |
| `moved` | `string` |

**`agent.run`**

| Field | Type |
| :-- | :-- |
| `harness` | `string` |
| `model` | `string?` |
| `outcome` | `string` |
| `durationMs` | `number` |
| `costSource` | `string` |
| `costUsd` | `number?` |
| `tokens` | `object?` |

**`budget.parked`**

| Field | Type |
| :-- | :-- |
| `window` | `string` |
| `measure` | `string` |
| `used` | `number` |
| `limit` | `number` |
| `stopAt` | `number` |
| `retryAfterMs` | `number` |
| `pending` | `array` |

**`notify.failed`**

| Field | Type |
| :-- | :-- |
| `error` | `string` |
| `text` | `string` |

**`run.claimed`**

| Field | Type |
| :-- | :-- |
| `reason` | `string` |

**`stop.enforced`**

| Field | Type |
| :-- | :-- |
| `reason` | `string?` |
| `pending` | `string?` |

**`stop.requested`**

| Field | Type |
| :-- | :-- |
| `reason` | `string` |

**`work.advanced`**

| Field | Type |
| :-- | :-- |
| `from` | `string` |
| `why` | `string` |

**`work.degraded`**

| Field | Type |
| :-- | :-- |
| `attempt` | `number` |
| `error` | `string` |

**`work.failed`**

| Field | Type |
| :-- | :-- |
| `attempt` | `number` |
| `error` | `string` |

**`work.planned`**

| Field | Type |
| :-- | :-- |
| `plan` | `string` |
| `why` | `string` |

**`work.recovered`**

| Field | Type |
| :-- | :-- |
| `afterAttempts` | `number` |

**`work.waiting`**

| Field | Type |
| :-- | :-- |
| `from` | `string` |
| `why` | `string` |

<!-- amy:end event-detail -->
