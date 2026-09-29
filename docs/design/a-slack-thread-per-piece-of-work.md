# A Slack thread per piece of work

Delivered, as `@amykit/plugin-slack`. Filed as #85.

The first adapter for the `conversation` port in
[an answer arrives where the question was asked](an-answer-arrives-where-the-question-was-asked.md):
one channel, one thread per piece of work, and the operator answers inside
the thread.

## What shapes it

- **Web API only, no Socket Mode.** Slack delivers each event to exactly one
  of an app's open connections, in no particular pattern
  ([Using Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/)),
  so a plugin that opened one would split events with anything else connected
  to the same app. It also does not need one: it posts with `chat.postMessage`
  (with `thread_ts`) and reads with `conversations.replies`, and only for work
  that is waiting on an answer. No app token, no public endpoint. Every call
  is form-encoded, which is the one body
  [every Web API method accepts](https://docs.slack.dev/apis/web-api/).
- **Rate limits.** Since 2025 `conversations.replies` is limited to one call a
  minute for apps distributed outside the Marketplace, while internal
  customer-built apps keep Tier 3
  ([changelog](https://docs.slack.dev/changelog/2025/06/03/rate-limits-clarity/)).
  A `429` waits the `Retry-After` it carries, in seconds
  ([rate limits](https://docs.slack.dev/apis/web-api/rate-limits)), or
  `defaultRetryAfterSeconds` (60) when it carries none, and gives up naming
  the URL after `maxRateLimitRetries` (5) retries; `0` fails on the first.
- **Files.** Reply attachments are fetched from `url_private_download` with the
  bot token (`files:read`) into `<state>/slack/files/<file id>/`, and their
  paths returned on the `Reply`. The token is only ever sent to an `https`
  Slack host: the URL comes out of a message. The plugin does not upload —
  that would need `files:write` — so a `post` carrying files is refused.
- **Scopes.** `chat:write`, `channels:read` and `channels:history` for a
  public channel or `groups:read` and `groups:history` for a private one, and
  `files:read`. A bot token reads channel threads with the history scope
  ([conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies)
  lists the same four for bot and user tokens); `conversations.info` needs the
  read scope ([conversations.info](https://docs.slack.dev/reference/methods/conversations.info)).
  `amy doctor` asks the mounted conversation for its own checks: `auth.test`
  for the token, its `x-oauth-scopes` header for the scopes, and
  `conversations.info` on the configured channel, which is also what says
  whether the public or the private pair is needed. A `missing_scope` refusal
  names the scope Slack said it needed.
- **Replies to the microsecond.** A reply's `at` is ISO 8601 with Slack's six
  fractional digits, and `since` is read back to the microsecond, so handing a
  reply's `at` back as the next `since` neither repeats it nor loses one that
  arrived a microsecond later.
- **Only the operator answers.** Replies from anyone else, the bot's own posts
  and anything posted through an integration (`bot_id`) are never returned —
  by author id, not by a marker in the text.

## Config

```yaml
plugins:
  "@amykit/plugin-slack":
    channel: C0XXXXXXX            # an id, not a name
    token: env:SLACK_BOT_TOKEN    # or file:<path>#<KEY> — never inline
    operator: U0XXXXXXX           # the only user whose replies are answers
    maxRateLimitRetries: 5        # 429s waited out before a call fails
    defaultRetryAfterSeconds: 60  # the wait when a 429 names none
    retentionDays: 30             # unused files and thread memory, then pruned; 0 keeps all
```

The channel and the operator are refused at mount unless they look like ids,
and the token unless it says where it lives.

The thread for a work item is remembered in the state directory, which is
machine-wide, so every daemon that mounts the plugin shares it. Each work item
is a chain of numbered generations, `slack/threads/<work id>/<n>.json`, each
created exclusively — written aside and linked into place — so exactly one
process wins each number. Everything that changes what a chain means claims
the next number first:

- **Posting a root.** Whoever wins posts it and writes its `ts` into its own
  generation; everybody else waits while that owner holds its claim, then
  reads it.
- **Taking over.** An owner that died is taken over by creating the next
  number. A claim is held by lease: the owner renews its generation's mtime
  while it works, so a claim whose lease ran out is dead even when some other
  process now has its pid.
- **Forgetting.** A forget or a prune leaves a tombstone as the next number,
  asks again under it whether the work should still go, and backs off —
  removing only its tombstone — if the thread was used in between. An open
  waits while a live tombstone stands, then starts a new chain. Forgetting
  work whose root is being posted right now is refused, so that post never
  lands with nowhere to be remembered.

Opening one work item never rewrites another's file, and a thread remembered
for another channel starts a new generation. An empty work id is refused: it
would name every thread.

Every root carries its work id in Slack's
[message metadata](https://docs.slack.dev/messaging/message-metadata)
(`amy_work_thread`), and a generation records when the first attempt of its
chain was about to post. An attempt that follows one which may have reached
Slack — its owner died, or the call failed — reads `conversations.history`
with `include_all_metadata` since then and adopts the bot's own root carrying
this work id instead of posting a second: by id, not title, because two items
can share a title and a title can change.

Downloaded files are staged under a random name and renamed, so a path that
exists is a whole file. An attachment over 25 MB is not downloaded: one Slack
declares that large is skipped unread, and one that proves that large while it
arrives is refused as the bytes are counted, so the daemon never holds it. The
reply names each skipped file in its text.

## What it keeps, and how it goes away

Everything lives under `<state>/slack/`: `threads/<work id>/` for each work
item's thread and `files/<thread ts>/<file id>/<name>` for what was downloaded
from it, so a thread's files sit under it.

- **Retention.** A downloaded file or a thread's memory nobody used within
  `retentionDays` is pruned. Using counts: reading a reply again, or opening
  the thread, reading its replies, or posting to it keeps it. The plugin prunes on its own while it is used, at most
  once an hour, and a prune never fails a call. An attempt whose owner is
  still posting is never pruned, however old.
- **One piece of work.** `forget(workId)` removes that thread's memory and
  every file downloaded from it, for whatever retires work by command. It
  leaves a `files/<thread ts>.forgotten` marker, and a download publishes
  before it reads the marker, so one still in flight cannot bring a forgotten
  thread's file back.
- **By hand.** Any of `files/` can be deleted at any time: a missing file is
  downloaded again the next time its reply is read. Deleting a work item's
  directory under `threads/`, or pruning it, only forgets the thread on this
  machine — it stays in Slack, and the next question for that work opens a new
  one.

The app is created from a manifest carrying exactly these scopes:

```yaml
display_information:
  name: amy
features:
  bot_user:
    display_name: amy
oauth_config:
  scopes:
    bot:
      - chat:write
      - channels:read
      - channels:history
      - groups:read
      - groups:history
      - files:read
settings:
  socket_mode_enabled: false
```

`amy init` does not walk through this yet; the manifest is here for whoever
does it by hand.

The docs generator describes a plugin by mounting it against empty settings,
which this one rightly refuses, so a schema field may now declare an
`example` the generator mounts with instead. It is never applied to a config.

## The gate

`plugins/slack/tests/SlackConversation.test.ts` drives the adapter against a
scripted HTTP transport, the same way the tracker and forge adapters are proved
against recorded responses, and `every-method-is-exercised.test.ts` holds it to
the guardrail the other two carry.

## Acceptance criteria

- [x] The first post for a work item opens a thread and later posts land in it,
      across a restart (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [x] Two processes sharing the state directory open one thread for one work
      item, and a root Slack took before a crash is adopted rather than posted
      again (proof: test:plugins/slack/tests/SlackConversation.sharing.test.ts)
- [x] An attachment over the limit is named in the reply and never held in
      memory, whether or not it declared its size
      (proof: test:plugins/slack/tests/fetchTransport.test.ts)
- [x] What nobody used within the retention is pruned on its own, a thread
      still in use and an attempt still posting are not, and one piece of
      work can be forgotten with its files
      (proof: test:plugins/slack/tests/SlackConversation.retention.test.ts)
- [x] How often and how long a `429` is waited out are settings
      (proof: test:plugins/slack/tests/plugin.test.ts)
- [x] A reply with an image is returned with a readable local path
      (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [x] Replies from anyone but the operator, and the bot's own, are never
      returned (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [x] A `429` waits the `Retry-After` it was given before trying again
      (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [x] The token is refused when written inline in the config
      (proof: test:plugins/slack/tests/plugin.test.ts)
- [x] `amy doctor` reports what a mounted conversation says about its own
      token, channel and scopes
      (proof: test:packages/cli/tests/doctor-conversation.test.ts)

**Exit condition:** an operator answers amy inside a Slack thread that belongs
to one piece of work, with text or a picture, and the plugin never opened a
connection another process could lose events to.
