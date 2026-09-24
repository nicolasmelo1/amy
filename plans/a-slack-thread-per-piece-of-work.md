# A Slack thread per piece of work

Filed as #85.

The first adapter for the `conversation` port in
[an answer arrives where the question was asked](an-answer-arrives-where-the-question-was-asked.md):
a Slack plugin. One channel, one thread per piece of work, and the operator
answers inside the thread.

## What shapes it

- **Web API only, no Socket Mode.** Slack delivers each event to exactly one
  of an app's open connections, in no particular pattern
  ([Using Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/)),
  so a plugin that opened one would split events with anything else connected
  to the same app. It also does not need one: it posts with `chat.postMessage`
  (with `thread_ts`) and reads with `conversations.replies`, and only for work
  that is waiting on an answer. No app token, no public endpoint.
- **Rate limits.** Since 2025 `conversations.replies` is limited to one call a
  minute for apps distributed outside the Marketplace, while internal
  customer-built apps keep Tier 3
  ([changelog](https://docs.slack.dev/changelog/2025/06/03/rate-limits-clarity/)).
  The plugin backs off on `429` and `Retry-After` either way.
- **Files.** Reply attachments are fetched with the bot token (`files:read`)
  into the state directory, and their paths returned on the `Reply`.
- **Scopes.** `chat:write`, `groups:history` or `channels:history`,
  `files:read`. `amy doctor` checks them with `auth.test` and a
  `conversations.info` on the configured channel.
- **Only the operator answers.** Replies from anyone else, and the bot's own
  posts, are never returned — by author id, not by a marker in the text.

## Config

```yaml
plugins:
  "@amykit/plugin-slack":
    channel: C0XXXXXXX            # an id, not a name
    token: env:SLACK_BOT_TOKEN    # or file:<path>#<KEY> — never inline
    operator: U0XXXXXXX           # the only user whose replies are answers
```

`amy init` can walk somebody through creating the app from a manifest with
exactly these scopes. The thread for a work item is remembered in the state
directory (`workId → thread_ts`), so it survives restarts.

## The gate

`plugins/slack/tests/SlackConversation.test.ts` drives the adapter against a
scripted HTTP transport, the same way the tracker and forge adapters are proved
against recorded responses.

## Acceptance criteria

- [ ] The first post for a work item opens a thread and later posts land in it,
      across a restart (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [ ] A reply with an image is returned with a readable local path
      (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [ ] Replies from anyone but the operator, and the bot's own, are never
      returned (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [ ] A `429` waits the `Retry-After` it was given before trying again
      (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [ ] The token is refused when written inline in the config
      (proof: test:plugins/slack/tests/plugin.test.ts)

**Exit condition:** an operator answers amy inside a Slack thread that belongs
to one piece of work, with text or a picture, and the plugin never opened a
connection another process could lose events to.
