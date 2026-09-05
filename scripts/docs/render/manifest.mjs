import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { DOCS, docFiles, readIfPresent } from "../lib/repo.mjs";
import { frontmatter, headings } from "../lib/markdown.mjs";

const REPOSITORY = "https://github.com/nicolasmelo1/amy";

/**
 * One file the site reads instead of the repository.
 *
 * The point of it is that a website is not allowed to become a second place
 * where the truth lives. Everything a renderer needs — the navigation, what
 * each page is about, the catalogue, the reference data, the news — is
 * derived here, from the same facts the pages themselves are, so a site can
 * be rebuilt from this file alone and cannot disagree with the docs.
 *
 * No timestamp anywhere in it, deliberately: a generated file that changes
 * every time it is generated cannot be checked for drift.
 */
export function manifestFrom(facts, blocks, spliced = new Map()) {
  const pages = pagesFrom(spliced);

  return `${JSON.stringify(
    {
      version: 1,
      product: {
        name: "amy",
        tagline: "Leave it running.",
        expansion: "Automate MY work",
        description:
          "A state machine you leave running. Everything in it is a plugin, and the workflow is yours.",
        repository: REPOSITORY,
        license: "MIT",
        node: ">=24",
      },
      nav: navFrom(pages),
      pages,
      reference: {
        actions: facts.core.actions,
        contracts: facts.core.ports,
        plans: facts.core.plans,
        events: facts.core.events,
        cli: facts.cli,
        skills: facts.skills,
        ports: portKinds(facts),
        collections: collectionsFrom(facts.packages),
        environment: environmentFrom(facts.packages),
      },
      catalog: catalogFrom(facts.packages),
      workflows: facts.packages
        .filter((entry) => entry.kind === "workflow" && entry.workflow)
        .map((entry) => ({
          package: entry.name,
          description: entry.description,
          ...entry.workflow,
        })),
      factory: facts.factory,
      changelog: {
        releases: facts.releases.releases,
        unreleased: facts.releases.unreleased,
        changelogs: facts.releases.packages,
      },
      generatedBlocks: Object.keys(blocks).sort(),
    },
    null,
    2,
  )}\n`;
}

/**
 * Every page, with the front matter it declares and the headings it holds.
 *
 * A page that carries generated blocks is read from what was just generated
 * rather than from disk. Reading disk would describe the page as it was before
 * this run, so the headings a reference table contributes would appear one run
 * late — and a manifest that is always one run behind can never be checked.
 */
function pagesFrom(spliced) {
  const pages = [];

  for (const relative of docFiles()) {
    const text = spliced.get(`docs/${relative}`) ?? fs.readFileSync(path.join(DOCS, relative), "utf8");
    const { data, body } = frontmatter(text);
    const route = relative.replace(/\.md$/, "").replace(/\/index$/, "");

    pages.push({
      path: route === "index" ? "/" : `/${route}`,
      file: `docs/${relative}`,
      edit: `${REPOSITORY}/blob/main/docs/${relative}`,
      title: data.title ?? firstHeading(body) ?? route,
      description: data.description ?? "",
      group: data.group ?? "",
      order: data.order ?? 999,
      generated: /<!-- amy:generated /.test(text),
      headings: headings(body),
    });
  }

  return pages.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The sidebar, from a file an editor can reorder without touching a renderer.
 *
 * `docs/nav.yaml` says which groups exist and in what order; the pages inside
 * one come from the directory, ordered by the `order` in their front matter.
 * So adding a page puts it in the sidebar, and nobody edits two things.
 */
function navFrom(pages) {
  const declared = yaml.parse(readIfPresent("docs/nav.yaml") ?? "[]") ?? [];

  return declared.map((group) => ({
    group: group.group,
    directory: group.dir,
    description: group.description ?? "",
    items: pages
      .filter((page) => page.file.startsWith(`docs/${group.dir}/`))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .map((page) => ({ title: page.title, path: page.path, description: page.description })),
  }));
}

function firstHeading(body) {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : null;
}

function portKinds(facts) {
  const kinds = new Map();

  const note = (kind) => {
    if (!kinds.has(kind)) kinds.set(kind, { kind, actions: [], mountedBy: [] });
    return kinds.get(kind);
  };

  for (const action of facts.core.actions) note(action.port).actions.push(action.name);

  for (const entry of facts.packages) {
    for (const kind of entry.mounts ?? []) note(kind).mountedBy.push(entry.name);
    for (const action of entry.addsActions ?? []) note(action.port).actions.push(action.name);
  }

  return [...kinds.values()]
    .map((held) => ({
      kind: held.kind,
      actions: [...new Set(held.actions)].sort(),
      mountedBy: [...new Set(held.mountedBy)].sort(),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

function collectionsFrom(packages) {
  const found = new Map();

  for (const entry of packages) {
    for (const contribution of entry.contributes ?? []) {
      const held = found.get(contribution.collection) ?? [];
      held.push({ name: contribution.name, package: entry.name });
      found.set(contribution.collection, held);
    }
  }

  return [...found.entries()]
    .map(([collection, contributors]) => ({
      collection,
      contributors: contributors.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.collection.localeCompare(b.collection));
}

function environmentFrom(packages) {
  return packages
    .filter((entry) => (entry.environment ?? []).length > 0)
    .flatMap((entry) => entry.environment.map((name) => ({ variable: name, package: entry.name })))
    .sort((a, b) => a.variable.localeCompare(b.variable));
}

/**
 * The catalogue entry for everything this workspace publishes.
 *
 * Third-party entries are not invented here. A site that wants them asks the
 * registry for the scope and the code host for the topic, at request time,
 * because a list of other people's packages baked into this repository would
 * be stale the day somebody publishes one.
 */
function catalogFrom(packages) {
  return {
    discovery: {
      npmKeyword: "amy-plugin",
      githubTopic: "amy-plugin",
      note: "A package outside this workspace is found by the keyword on npm and the topic on GitHub, at request time.",
    },
    shipped: packages
      .filter((entry) => !entry.private)
      .map((entry) => ({
        name: entry.name,
        version: entry.version,
        kind: entry.kind,
        description: entry.description,
        directory: entry.directory,
        npm: `https://www.npmjs.com/package/${entry.name}`,
        source: `${REPOSITORY}/tree/main/${entry.directory}`,
        readme: `${entry.directory}/README.md`,
        mounts: entry.mounts ?? [],
        contributes: entry.contributes ?? [],
        settings: entry.settings ?? [],
        environment: entry.environment ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
