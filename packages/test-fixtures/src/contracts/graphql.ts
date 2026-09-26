import { readFileSync } from "node:fs";
import {
  buildSchema,
  getNamedType,
  getNullableType,
  getVariableValues,
  GraphQLSchema,
  isAbstractType,
  isEnumType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  Kind,
  OperationDefinitionNode,
  parse,
  SelectionSetNode,
  validate,
  type DocumentNode,
  type FragmentDefinitionNode,
  type GraphQLObjectType,
  type GraphQLOutputType,
} from "graphql";
import { ContractViolation, contractFile } from "./violation.js";

/** The published schemas the doubles answer for, by who publishes them. */
export type GraphQLContract = "github" | "linear";

const FILES: Record<GraphQLContract, string> = {
  github: "github.graphql",
  linear: "linear.graphql",
};

const schemas = new Map<GraphQLContract, GraphQLSchema>();

function schemaFor(contract: GraphQLContract): GraphQLSchema {
  let schema = schemas.get(contract);
  if (!schema) {
    // Taken as published. GitHub's schema deprecates fields an interface it
    // implements does not, which graphql-js 17 refuses as a schema; the
    // schema is the service's, not ours to correct, and every document is
    // still validated against it.
    schema = buildSchema(readFileSync(contractFile(FILES[contract]), "utf8"), { assumeValid: true });
    schemas.set(contract, schema);
  }
  return schema;
}

/**
 * Refuses a request the service would refuse: a document the schema does
 * not validate, or variables that do not coerce to what the document
 * declared. Returns the parsed document, for the answer to be held to next.
 */
export function assertValidRequest(
  contract: GraphQLContract,
  query: string,
  variables: Record<string, unknown>,
): DocumentNode {
  const schema = schemaFor(contract);

  let document: DocumentNode;
  try {
    document = parse(query);
  } catch (error) {
    throw new ContractViolation(contract, `the document does not parse: ${(error as Error).message}`);
  }

  const errors = validate(schema, document);
  if (errors.length > 0) {
    throw new ContractViolation(contract, errors.map((error) => error.message).join("; "));
  }

  const operation = onlyOperation(contract, document);
  const coerced = getVariableValues(schema, operation.variableDefinitions ?? [], variables);
  if (coerced.errors?.length) {
    throw new ContractViolation(contract, coerced.errors.map((error) => error.message).join("; "));
  }

  const declared = new Set((operation.variableDefinitions ?? []).map((definition) => definition.variable.name.value));
  const undeclared = Object.keys(variables).filter((name) => !declared.has(name));
  if (undeclared.length > 0) {
    throw new ContractViolation(contract, `variables the document never declared: ${undeclared.join(", ")}`);
  }

  return document;
}

/**
 * Refuses a scripted answer the service could never send for this document.
 *
 * A GraphQL answer has exactly the fields the document selected — no more,
 * because the service sends nothing unasked, and no fewer, because it sends
 * every one it was asked for, as `null` where there is nothing. Each value
 * has the type the schema gives it. A fixture that leaves a selected field
 * out is a fixture of a response that cannot happen, and an adapter proven
 * against it is proven against nothing.
 */
export function assertValidResponse(contract: GraphQLContract, document: DocumentNode, data: unknown): void {
  const schema = schemaFor(contract);
  const operation = onlyOperation(contract, document);
  const root = operation.operation === "mutation" ? schema.getMutationType() : schema.getQueryType();
  if (!root) throw new ContractViolation(contract, `the schema has no ${operation.operation} type`);

  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
  }

  const walker = new ResponseWalker(contract, schema, fragments);
  walker.object(root, operation.selectionSet, data, "data");
}

function onlyOperation(contract: GraphQLContract, document: DocumentNode): OperationDefinitionNode {
  const operations = document.definitions.filter(
    (definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION,
  );
  if (operations.length !== 1) {
    throw new ContractViolation(contract, `a request carries one operation, and this document has ${operations.length}`);
  }
  return operations[0]!;
}

class ResponseWalker {
  constructor(
    private readonly contract: GraphQLContract,
    private readonly schema: GraphQLSchema,
    private readonly fragments: ReadonlyMap<string, FragmentDefinitionNode>,
  ) {}

  object(type: GraphQLObjectType, selection: SelectionSetNode, value: unknown, at: string): void {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      this.fail(at, `${type.name} is an object, and the answer holds ${describe(value)}`);
    }
    const record = value as Record<string, unknown>;
    const fields = this.collect(type, selection);

    for (const key of Object.keys(record)) {
      if (!fields.has(key)) this.fail(`${at}.${key}`, `the document never selected ${key} on ${type.name}`);
    }
    for (const [key, field] of fields) {
      if (!(key in record)) this.fail(`${at}.${key}`, `selected on ${type.name}, and missing from the answer`);
      if (key === "__typename") {
        if (record[key] !== type.name) this.fail(`${at}.${key}`, `is ${type.name}, and the answer says ${describe(record[key])}`);
        continue;
      }
      const definition = type.getFields()[field.name];
      if (!definition) this.fail(`${at}.${key}`, `${type.name} has no field ${field.name}`);
      this.value(definition.type, field.selectionSet, record[key], `${at}.${key}`);
    }
  }

  private value(type: GraphQLOutputType, selection: SelectionSetNode | undefined, value: unknown, at: string): void {
    if (value === null) {
      if (isNonNullType(type)) this.fail(at, `is ${String(type)}, and the answer holds null`);
      return;
    }
    const nullable = getNullableType(type);

    if (isListType(nullable)) {
      if (!Array.isArray(value)) this.fail(at, `is ${String(nullable)}, and the answer holds ${describe(value)}`);
      value.forEach((item, index) => this.value(nullable.ofType, selection, item, `${at}[${index}]`));
      return;
    }

    const named = getNamedType(nullable);
    if (isScalarType(named)) return this.scalar(named.name, value, at);
    if (isEnumType(named)) {
      if (typeof value !== "string" || !named.getValue(value)) {
        this.fail(at, `is the enum ${named.name}, and ${describe(value)} is not one of its values`);
      }
      return;
    }
    if (!selection) this.fail(at, `${named.name} needs a selection`);
    if (isObjectType(named)) return this.object(named, selection, value, at);
    if (isAbstractType(named)) return this.abstract(named.name, selection, value, at);
  }

  /**
   * An interface or a union answers as one of its members. The answer names
   * which with `__typename` when the document asked for it; otherwise the
   * member is the one whose selection the answer's keys are exactly, which
   * is also what the service does — a member none of the document's
   * fragments reach answers `{}`.
   */
  private abstract(name: string, selection: SelectionSetNode, value: unknown, at: string): void {
    const abstract = this.schema.getType(name);
    if (!abstract || !isAbstractType(abstract)) this.fail(at, `${name} is not abstract`);
    const members = this.schema.getPossibleTypes(abstract);

    if (typeof value === "object" && value !== null && "__typename" in value) {
      const member = members.find((candidate) => candidate.name === (value as { __typename: unknown }).__typename);
      if (!member) this.fail(at, `${describe((value as { __typename: unknown }).__typename)} is not a member of ${name}`);
      return this.object(member, selection, value, at);
    }

    const keys = typeof value === "object" && value !== null ? Object.keys(value).sort().join(",") : null;
    const member = members.find((candidate) => [...this.collect(candidate, selection).keys()].sort().join(",") === keys);
    if (!member) this.fail(at, `no member of ${name} answers with exactly ${keys === null ? describe(value) : `{${keys}}`}`);
    this.object(member, selection, value, at);
  }

  private scalar(name: string, value: unknown, at: string): void {
    const fits = SCALARS[name] ?? customScalar(name);
    if (!fits(value)) this.fail(at, `is ${name}, and the answer holds ${describe(value)}`);
  }

  /** The fields a selection asks of one concrete type, by the key they answer under. */
  private collect(
    type: GraphQLObjectType,
    selection: SelectionSetNode,
    into = new Map<string, { name: string; selectionSet?: SelectionSetNode }>(),
  ): Map<string, { name: string; selectionSet?: SelectionSetNode }> {
    for (const node of selection.selections) {
      if (node.kind === Kind.FIELD) {
        const key = node.alias?.value ?? node.name.value;
        const existing = into.get(key);
        into.set(key, { name: node.name.value, selectionSet: merge(existing?.selectionSet, node.selectionSet) });
      } else if (node.kind === Kind.INLINE_FRAGMENT) {
        if (!node.typeCondition || this.applies(node.typeCondition.name.value, type)) this.collect(type, node.selectionSet, into);
      } else {
        const fragment = this.fragments.get(node.name.value);
        if (fragment && this.applies(fragment.typeCondition.name.value, type)) this.collect(type, fragment.selectionSet, into);
      }
    }
    return into;
  }

  private applies(condition: string, type: GraphQLObjectType): boolean {
    if (condition === type.name) return true;
    const abstract = this.schema.getType(condition);
    return Boolean(abstract && isAbstractType(abstract) && this.schema.isSubType(abstract, type));
  }

  private fail(at: string, message: string): never {
    throw new ContractViolation(this.contract, `the scripted answer at ${at} ${message}`);
  }
}

const SCALARS: Record<string, (value: unknown) => boolean> = {
  Int: (value) => Number.isInteger(value),
  Float: (value) => typeof value === "number",
  Boolean: (value) => typeof value === "boolean",
  // An ID is always serialised as a String, whatever it was given as.
  ID: (value) => typeof value === "string",
  String: (value) => typeof value === "string",
};

/**
 * A JSON scalar is any JSON; every other custom scalar either service
 * publishes (DateTime, URI, GitObjectID, HTML, …) is serialised as a string.
 */
function customScalar(name: string): (value: unknown) => boolean {
  return name.startsWith("JSON") ? () => true : (value) => typeof value === "string";
}

function merge(left: SelectionSetNode | undefined, right: SelectionSetNode | undefined): SelectionSetNode | undefined {
  if (!left) return right;
  if (!right) return left;
  return { ...left, selections: [...left.selections, ...right.selections] };
}

function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  return JSON.stringify(value) ?? String(value);
}
