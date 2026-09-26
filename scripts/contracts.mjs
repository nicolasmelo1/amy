// The official contracts the scripted doubles are held to, vendored.
//
//   node scripts/contracts.mjs --check    red unless every vendored contract
//                                         is the one its publisher serves today
//   node scripts/contracts.mjs --update   download them again and rewrite the
//                                         manifest
//
// A double that answers what the real tool would refuse is how
// `reviewsRequestedOf` shipped broken; a double held to a stale contract is
// the same defect a release later. So the check runs in the gate, and a
// contract that moved turns it red until somebody updates and the suite runs
// against the new one.
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
import { gunzipSync, gzipSync } from "node:zlib";

const repo = path.resolve(import.meta.dirname, "..");
const directory = path.join(repo, "packages/test-fixtures/contracts");
const manifestPath = path.join(directory, "manifest.json");

/** Downloaded as published; `gzip` is how a large one is kept in the repository. */
const DOCUMENTS = [
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
];

/**
 * The `gh` CLI publishes no machine-readable contract, so its contract is
 * what the release's own binary prints: `gh reference` for every command and
 * flag, and `gh pr list --json` for the fields that flag takes. Fresh means
 * that release is the latest one.
 */
const GH_RELEASES = "https://api.github.com/repos/cli/cli/releases";
const GH_FILES = { reference: "gh-reference.md", prJsonFields: "gh-pr-json-fields.txt" };

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function download(url, headers = {}) {
  const response = await fetch(url, { headers: { "user-agent": "amy-contracts", ...headers } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function release(which) {
  const body = await download(`${GH_RELEASES}/${which}`, {
    accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  });
  return JSON.parse(body.toString("utf8"));
}

/** The asset of one release that runs here, by gh's own naming. */
function assetName(version) {
  const arch = { x64: "amd64", arm64: "arm64", ia32: "386" }[process.arch];
  if (process.platform === "darwin") return `gh_${version}_macOS_${arch}.zip`;
  if (process.platform === "linux") return `gh_${version}_linux_${arch}.tar.gz`;
  throw new Error(`no gh release asset is known for ${process.platform}/${process.arch}`);
}

/**
 * What one gh release prints, from that release's binary: downloaded,
 * checked against the release's published checksums, and run in a scratch
 * directory with a scratch config, so nothing on this machine answers for it.
 */
async function ghContract(version) {
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

    const run = (args) => {
      try {
        return execFileSync(binary, args, {
          cwd: scratch,
          encoding: "utf8",
          env: { ...process.env, GH_CONFIG_DIR: scratch, GH_NO_UPDATE_NOTIFIER: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        // `gh pr list --json` with no fields lists them on stderr and exits 1.
        if (typeof error.stderr === "string" && error.stderr.length > 0) return error.stderr;
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
async function update() {
  const bodies = [];
  for (const document of DOCUMENTS) bodies.push({ document, body: await download(document.url) });
  const version = await latestGh();
  const gh = await ghContract(version);

  fs.mkdirSync(directory, { recursive: true });
  const manifest = { documents: [], gh: { version, releases: GH_RELEASES } };
  for (const { document, body } of bodies) {
    fs.writeFileSync(path.join(directory, document.file), document.gzip ? gzipSync(body, { level: 9 }) : body);
    manifest.documents.push({ ...document, gzip: undefined, sha256: sha256(body) });
    console.log(`${document.name}: ${body.length} bytes from ${document.url}`);
  }
  for (const [part, file] of Object.entries(GH_FILES)) {
    fs.writeFileSync(path.join(directory, file), gh[part]);
    manifest.gh[part] = { file, sha256: sha256(gh[part]) };
  }
  console.log(`gh: ${version}`);

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function check() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const problems = [];

  for (const document of DOCUMENTS) {
    const recorded = manifest.documents.find((entry) => entry.name === document.name);
    if (recorded?.url !== document.url || recorded?.file !== document.file) {
      problems.push(`${document.name} is recorded from somewhere other than ${document.url}`);
    }
    const stored = fs.readFileSync(path.join(directory, document.file));
    const vendored = document.gzip ? gunzipSync(stored) : stored;
    const published = await download(document.url);
    if (sha256(published) !== sha256(vendored)) {
      problems.push(`${document.name} moved: ${document.url} no longer serves the vendored copy`);
    }
  }

  const latest = await latestGh();
  if (latest !== manifest.gh.version) {
    problems.push(`gh moved: ${latest} is the latest release, and the vendored contract is ${manifest.gh.version}'s`);
  } else {
    const gh = await ghContract(latest);
    for (const [part, file] of Object.entries(GH_FILES)) {
      if (fs.readFileSync(path.join(directory, file), "utf8") !== gh[part]) {
        problems.push(`${file} is not what gh ${latest} prints`);
      }
    }
  }

  if (problems.length > 0) {
    console.error("The doubles are held to contracts their publishers no longer serve:\n");
    for (const problem of problems) console.error(`  ${problem}`);
    console.error("\nRun `npm run contracts:update`, then `npm test` against what changed.");
    process.exit(1);
  }
  console.log("contracts: every vendored contract is the one its publisher serves today");
}

const mode = process.argv[2];
if (mode === "--update") await update();
else if (mode === "--check") await check();
else {
  console.error("usage: node scripts/contracts.mjs --check | --update");
  process.exit(2);
}
