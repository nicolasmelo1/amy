# @amy/plugin-file-queue

The queue, as one file per item.

Mounts the `queue` role. There is **no interval anywhere in it**: a ticket's
next look is enqueued by the look that precedes it, so a step that takes a
minute and a step that takes an hour both chain the moment they finish.
Waiting states enqueue themselves with a delay, which is the only place a
duration appears.

## Claiming is a rename

Claiming moves the file into `running/`. Rename is atomic on one filesystem,
so two workers cannot take the same item even though the queue is only a
directory. That property is the one the engine cannot do without: handing an
item out twice runs the same ticket twice.

Items abandoned by a dead worker come back through `recover`, and finished
items are pruned on the way past so the directory does not grow forever.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `retentionDays` | 7 | how long a finished item is kept |
| `staleClaimMs` | 30 min | how long a claim may sit before it counts as abandoned |

## How it is proven

Beyond the unit tests, this package has an `sf` **gate**. Its scenario imports
`dist/index.js` from another process against a scratch directory and asserts
twelve things, six of which the plan's criteria name.

The gate declares `src/**` as its activation paths, so **changing this plugin
expires the proof** and `sf check` goes red until the run is repeated:

```sh
npm run e2e
sf seal plugin-file-queue
```
