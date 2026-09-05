import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import yaml from "yaml";
import { DOCS, ROOT, readIfPresent, workspaceDirectories } from "../lib/repo.mjs";

/** Where the answer from GitHub is kept, so generating stays offline. */
export const CACHE = path.join(DOCS, "changelog/releases.json");

const REPOSITORY = "https://github.com/nicolasmelo1/amy";

/**
 * The news, from three sources that answer different questions.
 *
 * What shipped comes from the releases GitHub holds, cached to a file so the
 * generator never needs a network — a documentation build that fails on an
 * aeroplane is one nobody runs. What each package changed comes from its own
 * changelog, which `changeset version` writes. What is *about* to ship comes
 * from the pending changesets, which is the only one of the three that exists
 * before a release does, and this repository has not cut one yet.
 */
export function releaseFacts() {
  return {
    releases: cached(),
    unreleased: pending(),
    packages: changelogs(),
  };
}

function cached() {
  if (!fs.existsSync(CACHE)) return [];

  const parsed = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  return parsed.releases ?? [];
}

/**
 * The releases GitHub knows about, fetched and written to the cache.
 *
 * Its own command rather than part of generating, because the two answer to
 * different masters: this one needs a network and a credential and changes
 * when somebody publishes, and generating has to be reproducible on any
 * machine at any time. Keeping them apart is what lets the drift check be
 * a check rather than a coin toss.
 */
export function refreshReleases() {
  const raw = execFileSync(
    "gh",
    [
      "release",
      "list",
      "--limit",
      "100",
      "--json",
      "tagName,name,publishedAt,isPrerelease,isDraft",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );

  const listed = JSON.parse(raw).filter((release) => !release.isDraft);

  const releases = listed
    .map((release) => ({
      tag: release.tagName,
      name: release.name || release.tagName,
      publishedAt: release.publishedAt,
      prerelease: release.isPrerelease === true,
      url: `${REPOSITORY}/releases/tag/${release.tagName}`,
      body: bodyOf(release.tagName),
    }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, `${JSON.stringify({ version: 1, releases }, null, 2)}\n`);

  return releases;
}

function bodyOf(tag) {
  try {
    return execFileSync("gh", ["release", "view", tag, "--json", "body", "-q", ".body"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * What is written down and not released yet.
 *
 * A changeset is markdown with a front matter naming the packages it bumps
 * and by how much, which is exactly the shape a "coming next" section wants.
 */
function pending() {
  const directory = path.join(ROOT, ".changeset");
  if (!fs.existsSync(directory)) return [];

  const found = [];

  for (const entry of fs.readdirSync(directory).sort()) {
    if (!entry.endsWith(".md") || entry === "README.md") continue;

    const text = fs.readFileSync(path.join(directory, entry), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    if (!match) continue;

    const bumps = yaml.parse(match[1]) ?? {};
    const body = match[2].trim();

    // The first paragraph, not the first line. A changeset is hard-wrapped, so
    // taking one line cuts the summary mid-sentence and leaves the remainder
    // stranded at the top of the body.
    const [summary, ...rest] = body.split(/\n\s*\n/);

    found.push({
      id: entry.replace(/\.md$/, ""),
      title: summary.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim(),
      body: rest.join("\n\n").trim(),
      bumps: Object.entries(bumps)
        .map(([name, level]) => ({ package: name, level }))
        .sort((a, b) => a.package.localeCompare(b.package)),
      level: highest(Object.values(bumps)),
    });
  }

  return found.sort((a, b) => a.id.localeCompare(b.id));
}

function highest(levels) {
  if (levels.includes("major")) return "major";
  if (levels.includes("minor")) return "minor";
  return levels.length > 0 ? "patch" : "";
}

/** Each package's own changelog, so the news can link to what a bump was. */
function changelogs() {
  const found = [];

  for (const { group, dir, entry } of workspaceDirectories()) {
    const relative = `${group}/${entry}/CHANGELOG.md`;
    if (readIfPresent(relative) === null) continue;

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    found.push({ name: manifest.name, file: relative });
  }

  return found;
}
