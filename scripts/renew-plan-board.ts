// Renews plans/next-steps.md once a plan is delivered: the delivered plan's
// row leaves the board and every remaining row's number shifts up by one, so
// the board stays a 1..N list of the work still to do. Run from the
// repository root, naming the delivered plan by its file name, after the
// plan file itself has left plans/.
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const [delivered] = process.argv.slice(2);
if (!delivered || !delivered.endsWith(".md")) {
  console.error("usage: tsx scripts/renew-plan-board.ts <delivered-plan>.md");
  process.exit(1);
}
const board = path.join(repo, "plans", "next-steps.md");
const lines = fs.readFileSync(board, "utf8").split("\n");
const row = /^\| (\d+) \|/;

const kept: string[] = [];
let dropped = "";
for (const line of lines) {
  if (row.test(line) && line.includes(delivered) && delivered !== "") {
    dropped = line;
    continue;
  }
  const number = line.match(row)?.[1];
  kept.push(dropped && number ? line.replace(`| ${number} |`, `| ${Number(number) - 1} |`) : line);
}
if (dropped === "") {
  console.error(`no row of plans/next-steps.md names ${delivered}`);
  process.exit(1);
}
fs.writeFileSync(board, `${kept.join("\n")}`);

const numbers = kept.flatMap((line) => (row.test(line) ? [Number(line.match(row)?.[1])] : []));
const gaps = numbers.filter((number) => !numbers.includes(number - 1) && number !== 1);
console.log(`dropped: ${dropped}`);
console.log(`rows now: ${numbers.length}, first ${numbers[0]}, last ${numbers.at(-1)}, sequential: ${gaps.length === 0}`);