import { Announcement, Notifier } from "@amykit/core";

export interface Channel {
  name: string;
  deliver(announcement: Announcement): Promise<void>;
}

/**
 * Sends one announcement down every configured channel.
 *
 * A channel that fails does not stop the others, because losing a
 * notification must never stop a ticket.
 *
 * It still throws when *every* channel failed, and that throw now does one
 * job rather than two. "Do not let a lost notification pass unnoticed" is
 * kept, and better, by the `notify.failed` line the sink writes. "Make the
 * operator know the machine is stuck" was never something a notifier with no
 * working channel could deliver, so the engine catches it instead.
 */
export class FanOutNotifier implements Notifier {
  constructor(
    private readonly channels: readonly Channel[],
    private readonly log: (message: string) => void = console.error,
  ) {}

  async announce(announcement: Announcement): Promise<void> {
    if (this.channels.length === 0) {
      throw new Error("no notification channel is configured, so nothing can reach you");
    }

    const failures: string[] = [];

    for (const channel of this.channels) {
      try {
        await channel.deliver(announcement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${channel.name}: ${message}`);
        this.log(`amy could not reach you over ${channel.name}: ${message}`);
      }
    }

    if (failures.length === this.channels.length) {
      throw new Error(`every notification channel failed: ${failures.join("; ")}`);
    }
  }
}
