/**
 * The shapes the sources read out of the code and the renderers write from.
 *
 * Kept in one place because every renderer reads several sources, and a shape
 * declared beside its producer would have each renderer importing from all of
 * them.
 */

export interface CoreAction {
  name: string;
  port: string;
  method: string;
  doc: string;
}

interface PortMethod {
  name: string;
  signature: string;
  doc: string;
}

export interface CorePort {
  interface: string;
  file: string;
  doc: string;
  methods: PortMethod[];
}

interface EventField {
  field: string;
  type: string;
}

export interface CoreEvent {
  kind: string;
  says: string;
  requires: string[];
  detail: EventField[];
  summary: string;
}

export interface PlanKind {
  kind: string;
  fields: string[];
  doc: string;
}

export interface CoreFacts {
  actions: CoreAction[];
  ports: CorePort[];
  events: CoreEvent[];
  plans: PlanKind[];
}

export interface CliOption {
  flags: string;
  description: string;
  default: string | undefined;
}

interface CliArgument {
  name: string;
  required: boolean;
  description: string;
}

export interface CliCommand {
  path: string[];
  description: string;
  arguments: CliArgument[];
  options: CliOption[];
  isDefault: boolean;
}

export interface CliFacts {
  name: string;
  description: string;
  options: CliOption[];
  commands: CliCommand[];
}

/** The runtime requirement the published command declares to npm. */
export interface RuntimeFacts {
  node: string;
}

export interface Setting {
  name: string;
  type: string;
  required: boolean;
  default: unknown;
  description: string | undefined;
}

export interface Contribution {
  collection: string;
  name: string;
}

export interface AddedAction {
  name: string;
  port: string;
  method: string;
}

export interface WorkflowShape {
  name: string;
  states: string[];
  waitingStates: string[];
  terminalStates: string[];
  initialState: string;
  usesActions: string[];
}

type PackageKind = "unbuilt" | "cli" | "unloadable" | "library" | "plugin" | "workflow";

/** One workspace package, and whatever loading it could tell. */
export interface PackageFact {
  name: string;
  version: string;
  description: string;
  private: boolean;
  group: string;
  directory: string;
  dependencies: string[];
  amyDependencies: string[];
  environment: string[];
  kind: PackageKind;
  problem?: string;
  exports?: string[];
  settings?: Setting[];
  mounts?: string[];
  contributes?: Contribution[];
  addsActions?: AddedAction[];
  observes?: string[];
  mountsEngine?: boolean;
  mountsWorkflow?: string | null;
  registerProblem?: string;
  workflow?: WorkflowShape;
}

/** A plugin or a workflow: a package that registered, so all of it is known. */
export interface MountedFact extends PackageFact {
  kind: "plugin" | "workflow";
  exports: string[];
  settings: Setting[];
  mounts: string[];
  contributes: Contribution[];
  addsActions: AddedAction[];
  observes: string[];
  mountsEngine: boolean;
  mountsWorkflow: string | null;
}

export interface WorkflowFact extends MountedFact {
  workflow: WorkflowShape;
}

export function isMounted(entry: PackageFact): entry is MountedFact {
  return entry.kind === "plugin" || entry.kind === "workflow";
}

export interface Gate {
  name: string;
  activation: string[];
  evidence: string;
  plan: string;
  assertions: string[];
  scenario: string;
}

export interface Rule {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  title?: string;
  reason?: string;
}

export interface FactoryFacts {
  gates: Gate[];
  rules: Rule[];
  disabled: Rule[];
}

export interface ConfigField {
  name: string;
  type: string;
  optional: boolean;
  doc: string;
}

export interface ConfigFacts {
  fields: ConfigField[];
  profile: ConfigField[];
  defaults: Record<string, string>;
  example: string;
  exampleRoster: string;
}

export interface Release {
  tag: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  url: string;
  body: string;
}

interface Bump {
  package: string;
  level: string;
}

export interface PendingChange {
  id: string;
  title: string;
  body: string;
  bumps: Bump[];
  level: string;
}

export interface PackageChangelog {
  name: string;
  file: string;
}

export interface ReleaseFacts {
  releases: Release[];
  unreleased: PendingChange[];
  packages: PackageChangelog[];
}

export interface Skill {
  name: string;
  version: string;
  description: string;
  directory: string;
}

/** Everything the generator knows, which every block and file is drawn from. */
export interface Facts {
  core: CoreFacts;
  cli: CliFacts;
  runtime: RuntimeFacts;
  packages: PackageFact[];
  factory: FactoryFacts;
  config: ConfigFacts;
  releases: ReleaseFacts;
  skills: Skill[];
}

/** One file the generator owns, and what it should hold. */
export interface GeneratedFile {
  file: string;
  text: string;
}
