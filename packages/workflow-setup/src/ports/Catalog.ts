/**
 * One workflow the host offers to drive, as the ask reads it.
 */
export interface WorkflowChoice {
  /** The name the ask offers. */
  readonly name: string;
  /** The package that contributes the workflow. */
  readonly plugin: string;
  /** Whether the machine already drives it, so the ask offers it first. */
  readonly current: boolean;
}

/**
 * One channel plugin the catalog offers: how the machine reaches the person.
 *
 * The kind travels into the ask's answer labels, so the person chooses
 * between a conversation and a notifier knowing which is which.
 */
export interface ChannelChoice {
  /** The name the ask offers. */
  readonly name: string;
  /** The package that mounts it. */
  readonly plugin: string;
  readonly kind: "conversation" | "notifier";
}

/**
 * What the host offers the walk to choose from.
 *
 * Plain listings, not results: the host is up — setup is running on it — so
 * what it offers is a fact, and a host that cannot say is a host that cannot
 * mount the walk either.
 */
export interface Catalog {
  /** The workflows this machine could drive, the current one first. */
  workflows(): Promise<readonly WorkflowChoice[]>;
  /** The channel plugins, conversation and notifier, in the catalog's order. */
  channels(): Promise<readonly ChannelChoice[]>;
}
