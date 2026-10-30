import type { Json } from "./json.js";
import { element, type Children, type Intent, type Node } from "./tree.js";
import type { Primitive, TONES } from "./vocabulary.js";

type Tone = (typeof TONES)[number];

export interface Column {
  readonly label?: string;
  readonly width?: number;
  /** A column a row may leave blank: from the first one on, a text line is not padded past its last word. */
  readonly optional?: boolean;
}

export interface TimelineEntry {
  readonly at: string;
  readonly label: string;
}

export interface Transition {
  readonly from: string;
  readonly to: string;
}

interface Holds {
  readonly children?: Children;
}

export interface StackProps extends Holds { readonly gap?: number }
export interface RowProps extends Holds { readonly gap?: number }
export interface SectionProps extends Holds { readonly title?: string }
export interface TextProps extends Holds { readonly tone?: Tone }
export interface BadgeProps extends Holds { readonly tone?: Tone }
export interface ListProps extends Holds { readonly ordered?: boolean }
export interface TableProps { readonly columns: readonly Column[]; readonly rows: readonly (readonly string[])[] }
export type TabsProps = Holds;
export interface ButtonProps extends Holds { readonly intent: Intent }
export interface LinkProps extends Holds { readonly href: string }
export interface InputProps { readonly name: string; readonly value?: string; readonly placeholder?: string; readonly intent?: Intent }
export interface TimelineProps { readonly entries: readonly TimelineEntry[] }
/**
 * A workflow's states, and, when the workflow has one, the Mermaid diagram
 * they were read from. A renderer that draws in a webview hands `diagram` to
 * a Mermaid renderer; one that draws characters draws `states` and
 * `transitions`, which the server read out of the same text. Neither parses
 * Mermaid itself. A workflow without a diagram carries its states alone.
 */
export interface StateMachineProps {
  readonly states: readonly string[];
  readonly current?: string;
  readonly transitions?: readonly Transition[];
  readonly diagram?: string;
}
export interface LogProps { readonly lines: readonly string[] }
export interface CodeProps extends Holds { readonly language?: string }
export type DiffProps = Holds;
export type EmptyProps = Holds;

/** A primitive as a function a JSX tag can name. Calling it builds the node. */
function primitive<P extends object>(type: Primitive): (props: P) => Node {
  return (props) => {
    const { children, ...rest } = props as P & Holds;
    return element(type, rest as Record<string, Json | undefined>, children);
  };
}

export const Stack = primitive<StackProps>("Stack");
export const Row = primitive<RowProps>("Row");
export const Section = primitive<SectionProps>("Section");
export const Text = primitive<TextProps>("Text");
export const Badge = primitive<BadgeProps>("Badge");
export const List = primitive<ListProps>("List");
export const Table = primitive<TableProps>("Table");
export const Tabs = primitive<TabsProps>("Tabs");
export const Button = primitive<ButtonProps>("Button");
export const Link = primitive<LinkProps>("Link");
export const Input = primitive<InputProps>("Input");
export const Timeline = primitive<TimelineProps>("Timeline");
export const StateMachine = primitive<StateMachineProps>("StateMachine");
export const Log = primitive<LogProps>("Log");
export const Code = primitive<CodeProps>("Code");
export const Diff = primitive<DiffProps>("Diff");
export const Empty = primitive<EmptyProps>("Empty");
