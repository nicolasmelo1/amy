// The official contracts the scripted doubles are held to, vendored.
//
//   tsx scripts/contracts.ts --check    red unless every vendored contract
//                                       is the one its publisher serves today
//   tsx scripts/contracts.ts --update   download them again and rewrite the
//                                       manifest
//
// A double held to a stale contract is how `reviewsRequestedOf` shipped
// broken, so the check runs in the gate. A contract that moved is a warning
// for STALE_AFTER_DAYS after it was vendored and red after that: GitHub
// republishes its REST description several times a day. The scheduled
// `contracts` workflow refreshes them inside the window.
//
// Nothing in the vendored directory is an authority on itself. The sources
// are the constants below, and every file is compared with what its source
// serves — including gh's, which is regenerated from the pinned release's
// own binary, downloaded and checked against that release's checksums.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { deriveBotApi } from "./bot-api-contract.js";
import { STALE_AFTER_DAYS, withinWindow } from "./contracts-window.js";

const repo = path.resolve(import.meta.dirname, "..");
const directory = path.join(repo, "packages/test-fixtures/contracts");
const manifestPath = path.join(directory, "manifest.json");

interface ContractDocument {
  name: string;
  file: string;
  gzip?: boolean;
  url: string;
  publisher: string;
}

/** What gh prints, by the part of the contract it is. */
interface GhContract {
  reference: string;
  prJsonFields: string;
}

type GhPart = keyof GhContract;

interface Vendored {
  file: string;
  sha256: string;
}

/** `manifest.json` in the vendored directory: what was downloaded, from where. */
interface ContractsManifest {
  /** When `--update` last wrote the set; a moved contract older than the window is red. */
  vendoredAt?: string;
  documents: (ContractDocument & { sha256: string })[];
  derived?: (typeof BOT_API & { version: string; sha256: string })[];
  gh: { version: string; releases: string } & Partial<Record<GhPart, Vendored>>;
}

/** The fields of a GitHub release this reads. */
interface GhRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

/** Downloaded as published; `gzip` is how a large one is kept in the repository. */
const DOCUMENTS: ContractDocument[] = [
  {
    name: "github-graphql",
    file: "github.graphql",
    url: "https://docs.github.com/public/fpt/schema.docs.graphql",
    publisher: "GitHub — the public GraphQL schema for github.com",
  },
  {
    name: "github-rest",
    file: "github-rest.json.gz",
    gzip: true,
    url: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    publisher: "GitHub — the OpenAPI description of the github.com REST API",
  },
  {
    name: "linear-graphql",
    file: "linear.graphql",
    url: "https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql",
    publisher: "Linear — the GraphQL schema its own SDK is generated from",
  },
  {
    name: "slack-web",
    file: "slack-web.json.gz",
    gzip: true,
    url: "https://api.slack.com/specs/openapi/v2/slack_web.json",
    publisher: "Slack — the OpenAPI description of the Web API, served by Slack",
  },
];

/**
 * Telegram publishes its Bot API as one HTML page and no schema, so its
 * contract is derived from that page (scripts/bot-api-contract.ts): fresh
 * means today's page derives to the same types, methods and version.
 */
const BOT_API = {
  name: "telegram-bot-api",
  file: "telegram-bot-api.json",
  url: "https://core.telegram.org/bots/api",
  publisher: "Telegram — the Bot API reference page, derived into its types and methods",
};

async function botApiContract(): Promise<string> {
  const { body } = await published(BOT_API);
  return `${JSON.stringify(deriveBotApi(body.toString("utf8")), null, 2)}\n`;
}

/**
 * The `gh` CLI publishes no machine-readable contract, so its contract is
 * what the release's own binary prints: `gh reference` for every command and
 * flag, and `gh pr list --json` for the fields that flag takes. Fresh means
 * that release is the latest one.
 */
const GH_RELEASES = "https://api.github.com/repos/cli/cli/releases";
const GH_FILES: Record<GhPart, string> = { reference: "gh-reference.md", prJsonFields: "gh-pr-json-fields.txt" };
/** `Object.entries` widens a key to string; these keys are the parts above. */
const GH_PARTS = Object.entries(GH_FILES) as [GhPart, string][];

const sha256 = (buffer: Buffer | string) => createHash("sha256").update(buffer).digest("hex");

async function download(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const response = await fetch(url, { headers: { "user-agent": "amy-contracts", ...headers } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * What a publisher serves today, not what the nearest cache kept. The GitHub
 * docs host sits behind Fastly with a week's `max-age` and ignores a
 * request's `cache-control`, so two edges can serve two versions of the same
 * URL: the check passed here and failed on a CI runner against one vendored
 * file, twice in a day. A query string nobody else sends is a cache key no
 * edge holds, so the request reaches the origin; the publishers ignore it.
 */
async function published(document: ContractDocument): Promise<{ body: Buffer; servedAs: string }> {
  const url = new URL(document.url);
  url.searchParams.set("amy-contracts", String(Date.now()));
  const response = await fetch(url, { headers: { "user-agent": "amy-contracts" } });
  if (!response.ok) throw new Error(`${document.url} answered ${response.status}`);
  const servedAs = ["last-modified", "age", "x-cache"]
    .map((header) => response.headers.get(header) && `${header}: ${response.headers.get(header)}`)
    .filter(Boolean)
    .join(", ");
  return { body: Buffer.from(await response.arrayBuffer()), servedAs };
}

async function release(which: string): Promise<GhRelease> {
  const body = await download(`${GH_RELEASES}/${which}`, {
    accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  });
  return JSON.parse(body.toString("utf8"));
}

/** The asset of one release that runs here, by gh's own naming. */
function assetName(version: string): string {
  const arches: Partial<Record<NodeJS.Architecture, string>> = { x64: "amd64", arm64: "arm64", ia32: "386" };
  const arch = arches[process.arch];
  if (process.platform === "darwin") return `gh_${version}_macOS_${arch}.zip`;
  if (process.platform === "linux") return `gh_${version}_linux_${arch}.tar.gz`;
  throw new Error(`no gh release asset is known for ${process.platform}/${process.arch}`);
}

/**
 * What one gh release prints, from that release's binary: downloaded,
 * checked against the release's published checksums, and run in a scratch
 * directory with a scratch home, so nothing on this machine — no extension,
 * no config, no token — answers for it.
 */
async function ghContract(version: string): Promise<GhContract> {
  const published = await release(`tags/v${version}`);
  const name = assetName(version);
  const asset = published.assets.find((candidate) => candidate.name === name);
  const sums = published.assets.find((candidate) => candidate.name === `gh_${version}_checksums.txt`);
  if (!asset || !sums) throw new Error(`gh ${version} publishes no ${name} with checksums`);

  const archive = await download(asset.browser_download_url);
  const expected = (await download(sums.browser_download_url))
    .toString("utf8")
    .split("\n")
    .find((line) => line.endsWith(`  ${name}`))
    ?.split(" ")[0];
  if (sha256(archive) !== expected) throw new Error(`${name} does not match gh ${version}'s published checksum`);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "amy-gh-"));
  try {
    const file = path.join(scratch, name);
    fs.writeFileSync(file, archive);
    if (name.endsWith(".zip")) execFileSync("unzip", ["-q", file, "-d", scratch]);
    else execFileSync("tar", ["-xzf", file, "-C", scratch]);
    const binary = path.join(scratch, name.replace(/\.(zip|tar\.gz)$/, ""), "bin", "gh");

    const run = (args: string[]): string => {
      try {
        return execFileSync(binary, args, {
          cwd: scratch,
          encoding: "utf8",
          // Nothing of this machine's: gh reads extensions from its data
          // directory, not its config one, and an extension installed here
          // printed itself into the reference as if it were gh's own.
          env: {
            PATH: process.env.PATH,
            HOME: scratch,
            GH_CONFIG_DIR: path.join(scratch, "config"),
            XDG_CONFIG_HOME: path.join(scratch, "config"),
            XDG_DATA_HOME: path.join(scratch, "data"),
            XDG_STATE_HOME: path.join(scratch, "state"),
            XDG_CACHE_HOME: path.join(scratch, "cache"),
            GH_NO_UPDATE_NOTIFIER: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        // `gh pr list --json` with no fields lists them on stderr and exits 1.
        const stderr = error instanceof Error && "stderr" in error ? error.stderr : undefined;
        if (typeof stderr === "string" && stderr.length > 0) return stderr;
        throw error;
      }
    };

    const fields = run(["pr", "list", "--json"])
      .split("\n")
      .filter((line) => line.startsWith("  "))
      .map((line) => line.trim())
      .filter(Boolean);
    if (fields.length === 0) throw new Error(`gh ${version} listed no --json fields`);
    return { reference: run(["reference"]), prJsonFields: `${fields.join("\n")}\n` };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const latestGh = async () => String((await release("latest")).tag_name).replace(/^v/, "");

/**
 * Everything is downloaded before anything is written, so a failure halfway
 * leaves the vendored set as it was rather than half replaced.
 */
async function update(): Promise<void> {
  const bodies: { document: ContractDocument; body: Buffer }[] = [];
  for (const document of DOCUMENTS) bodies.push({ document, body: (await published(document)).body });
  const botApi = await botApiContract();
  const version = await latestGh();
  const gh = await ghContract(version);

  fs.mkdirSync(directory, { recursive: true });
  const manifest: ContractsManifest = { vendoredAt: new Date().toISOString(), documents: [], gh: { version, releases: GH_RELEASES } };
  for (const { document, body } of bodies) {
    fs.writeFileSync(path.join(directory, document.file), document.gzip ? gzipSync(body, { level: 9 }) : body);
    manifest.documents.push({ ...document, gzip: undefined, sha256: sha256(body) });
    console.log(`${document.name}: ${body.length} bytes from ${document.url}`);
  }
  for (const [part, file] of GH_PARTS) {
    fs.writeFileSync(path.join(directory, file), gh[part]);
    manifest.gh[part] = { file, sha256: sha256(gh[part]) };
  }
  console.log(`gh: ${version}`);

  fs.writeFileSync(path.join(directory, BOT_API.file), botApi);
  manifest.derived = [{ ...BOT_API, version: (JSON.parse(botApi) as { version: string }).version, sha256: sha256(botApi) }];
  console.log(`${BOT_API.name}: Bot API ${manifest.derived[0]!.version} from ${BOT_API.url}`);

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** What the vendored set says against its sources: a move is tolerated inside the window, a problem never. */
interface Findings {
  moved: string[];
  problems: string[];
}

/** A vendored file that is gone or no longer the bytes its manifest recorded: edited here, never a publisher's move. */
function tampered(file: string, bytes: Buffer | undefined, recorded: string | undefined): string | undefined {
  if (bytes === undefined) return `${file} is missing`;
  if (sha256(bytes) !== recorded) return `${file} is not the copy its manifest recorded; run \`npm run contracts:update\` rather than editing it`;
  return undefined;
}

function vendoredBytes(file: string, gzip?: boolean): Buffer | undefined {
  const at = path.join(directory, file);
  if (!fs.existsSync(at)) return undefined;
  const stored = fs.readFileSync(at);
  return gzip ? gunzipSync(stored) : stored;
}

async function documentFindings(manifest: ContractsManifest, found: Findings): Promise<void> {
  for (const document of DOCUMENTS) {
    const recorded = manifest.documents.find((entry) => entry.name === document.name);
    if (recorded?.url !== document.url || recorded?.file !== document.file) {
      found.problems.push(`${document.name} is recorded from somewhere other than ${document.url}`);
    }
    const problem = tampered(document.file, vendoredBytes(document.file, document.gzip), recorded?.sha256);
    if (problem) {
      found.problems.push(problem);
      continue;
    }
    const served = await published(document);
    if (sha256(served.body) !== recorded?.sha256) {
      found.moved.push(`${document.name} moved: ${document.url} no longer serves the vendored copy (${served.servedAs || "no cache headers"})`);
    }
  }
}

/** The Bot API derivation: the vendored file is checked against its manifest, and only today's page is a move. */
async function botApiFindings(manifest: ContractsManifest, found: Findings): Promise<void> {
  const problem = tampered(BOT_API.file, vendoredBytes(BOT_API.file), manifest.derived?.[0]?.sha256);
  if (problem) {
    found.problems.push(problem);
    return;
  }
  const botApi = await botApiContract();
  if (sha256(botApi) === manifest.derived?.[0]?.sha256) return;
  const now = (JSON.parse(botApi) as { version: string }).version;
  found.moved.push(`${BOT_API.name} moved: ${BOT_API.url} now describes Bot API ${now} differently from the vendored derivation`);
}

/** gh's files are always what the pinned release prints; only a newer release is a move. */
async function ghFindings(manifest: ContractsManifest, found: Findings): Promise<void> {
  const pinned = manifest.gh.version;
  const gh = await ghContract(pinned);
  for (const [part, file] of GH_PARTS) {
    if (vendoredBytes(file)?.toString("utf8") !== gh[part]) found.problems.push(`${file} is not what gh ${pinned} prints`);
  }
  const latest = await latestGh();
  if (latest !== pinned) found.moved.push(`gh moved: ${latest} is the latest release, and the vendored contract is ${pinned}'s`);
}

async function check(): Promise<void> {
  const manifest: ContractsManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const found: Findings = { moved: [], problems: [] };
  await documentFindings(manifest, found);
  await botApiFindings(manifest, found);
  await ghFindings(manifest, found);

  const window = withinWindow(manifest.vendoredAt, new Date());
  const age = window.days === undefined ? "with no recorded date" : `${window.days} day(s) ago`;
  if (found.problems.length > 0 || (found.moved.length > 0 && !window.ok)) {
    console.error(`The doubles are held to contracts their publishers no longer serve (vendored ${age}, window ${STALE_AFTER_DAYS} days):\n`);
    for (const problem of [...found.problems, ...found.moved]) console.error(`  ${problem}`);
    console.error("\nRun `npm run contracts:update`, then `npm test` against what changed.");
    process.exit(1);
  }
  if (found.moved.length > 0) {
    console.warn(`contracts: vendored ${age}, inside the ${STALE_AFTER_DAYS}-day window; the scheduled refresh takes these:`);
    for (const one of found.moved) console.warn(`  ${one}`);
    return;
  }
  console.log("contracts: every vendored contract is the one its publisher serves today");
}

const mode = process.argv[2];
if (mode === "--update") await update();
else if (mode === "--check") await check();
else {
  console.error("usage: tsx scripts/contracts.ts --check | --update");
  process.exit(2);
}
