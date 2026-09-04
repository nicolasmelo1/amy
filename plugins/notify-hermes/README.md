# @amy/plugin-notify-hermes

Announcements over Hermes.

A `Channel` for `@amy/plugin-notify-fanout`. It holds no credential: Hermes
already owns the messaging credentials for Telegram, Discord, Slack, Signal
and the rest, so this pipes text to `hermes send` and lets it deliver.

Named for Hermes rather than for any one platform, because the platform is a
setting and Hermes is the dependency.

## Checking a target properly

`hermesTargetIsKnown` reads `hermes send --list --json`, not the human-readable
listing. That listing ends with a usage line naming a platform as an example,
so matching on the text passes for a platform that was never configured. That
was a real false pass before it was a test.

A target is `platform`, `platform:chat_id`, `platform:chat_id:thread_id`, or
`platform:#channel-name`. A bare platform name sends to its home channel.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `target` | required | a Hermes delivery target |
