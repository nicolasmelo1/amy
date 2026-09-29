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
  ([rate limits](https://docs.slack.dev/apis/web-api/rate-limits)), or a
  minute when it carries none, and gives up naming the URL after five.
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
```

The channel and the operator are refused at mount unless they look like ids,
and the token unless it says where it lives. The thread for a work item is
remembered in the state directory (`slack/threads.json`, `workId → thread_ts`),
written whole and renamed into place, so it survives restarts; a thread
remembered for another channel is not reused.

The state directory is machine-wide, so every daemon that mounts the plugin
shares that map. Opening a thread happens under `slack/threads.lock`, which
is linked into place already carrying the owner's pid and a claim for that one
acquisition, and is released only while it still carries that claim. A lock
whose owner is gone is broken by whichever waiter wins the breaker named after
its claim, and only if it still carries it, so a lock somebody took after the
dead one is never removed. Under the lock the map is read again, so a second
process adopts the thread the first one opened and no write loses another's
entry. Every root carries its work id in Slack's
[message metadata](https://docs.slack.dev/messaging/message-metadata)
(`amy_work_thread`). Before posting a root the map records when it was about
to, and a crash between Slack taking the root and the map remembering it is
recovered from `conversations.history` with `include_all_metadata`: the bot's
own root carrying this work id is adopted instead of posting a second — by
id, not title, because two items can share a title and a title can change.
Downloaded files are staged and renamed, so a path that exists is a whole
file.

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
