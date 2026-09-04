# @amy/plugin-notify-fanout

Sends one announcement down every configured channel.

Mounts the `notifier` port. It owns no channel of its own: channels come from
`@amy/plugin-notify-hermes`, `@amy/plugin-notify-inbox`, the tracker plugin,
or anything else implementing `Channel`.

## A channel that is down does not stop a ticket

Losing a notification must never stop work. A failing channel is logged and
the others still go.

It throws only when **every** channel failed, because at that point the
operator would otherwise never learn that the machine is stuck, and silence
would look exactly like nothing being wrong.

Being configured with no channel at all is refused for the same reason.
