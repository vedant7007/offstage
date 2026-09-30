// pnpm sync: bring this branch up to date with main and show what the team needs from you.
// Calls git and gh directly (no shell), so it behaves the same in PowerShell and Git Bash.
// Usage: pnpm sync [--who vedant|abhinav|thanishka]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PEOPLE = ["vedant", "abhinav", "thanishka"] as const;
export type Person = (typeof PEOPLE)[number];

type Check = { status?: string | null; conclusion?: string | null; state?: string | null };
type Pr = {
  number: number;
  title: string;
  author: { login: string };
  headRefName: string;
  isDraft: boolean;
  mergeable: string;
  statusCheckRollup: Check[] | null;
  url: string;
};
type Issue = { number: number; title: string; labels: { name: string }[]; url: string };

function run(cmd: string, args: string[]): { ok: boolean; out: string } {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
    };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || err.message };
  }
}
const git = (...args: string[]) => run("git", args);

/** Person from --who, else from git config user.name. */
export function detectPerson(argv: string[], userName: string): Person | undefined {
  const i = argv.indexOf("--who");
  const raw = (i >= 0 ? argv[i + 1] : userName)?.toLowerCase() ?? "";
  return PEOPLE.find((p) => raw.includes(p));
}

/** COORDINATION.md entries ("## <date> | <name> | <area>" blocks), oldest first. */
export function parseEntries(md: string): { header: string; body: string }[] {
  return md
    .split(/^(?=## \d{4}-\d{2}-\d{2} )/m)
    .filter((b) => /^## \d{4}-\d{2}-\d{2} /.test(b))
    .map((b) => ({ header: b.split("\n")[0]!.trim(), body: b.trim() }));
}

/** Entries after the last one seen. With no marker (or a marker that no longer exists), the last 3. */
export function newEntries(entries: { header: string; body: string }[], lastSeen: string | undefined) {
  const at = lastSeen ? entries.findIndex((e) => e.header === lastSeen) : -1;
  return at >= 0 ? entries.slice(at + 1) : entries.slice(-3);
}

export function ciState(checks: Check[] | null): "passing" | "failing" | "pending" | "none" {
  if (!checks?.length) return "none";
  const states = checks.map((c) => (c.conclusion ?? c.state ?? c.status ?? "").toUpperCase());
  if (states.some((s) => ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(s)))
    return "failing";
  if (states.some((s) => !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(s))) return "pending";
  return "passing";
}

function main() {
  const action: string[] = [];
  const who = detectPerson(process.argv.slice(2), git("config", "user.name").out);
  if (!who)
    action.push(`Could not tell who you are from git user.name. Run: pnpm sync --who <${PEOPLE.join("|")}>`);

  // 1. Fetch and rebase.
  console.log("== Sync with main");
  const fetched = git("fetch", "origin", "--prune");
  if (!fetched.ok) {
    console.log(`git fetch failed: ${fetched.out}`);
    process.exit(1);
  }
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").out;
  const dirty = git("status", "--porcelain", "--untracked-files=no").out !== "";
  const behind = !git("merge-base", "--is-ancestor", "origin/main", "HEAD").ok;
  if (!behind) console.log(`${branch} already contains origin/main.`);
  else if (dirty) {
    console.log(`main moved, but ${branch} has uncommitted changes, so no rebase.`);
    action.push("Commit your work, then run pnpm sync again to rebase onto main.");
  } else if (branch === "main") {
    const ff = git("merge", "--ff-only", "origin/main");
    console.log(ff.ok ? "main fast-forwarded to origin/main." : `main cannot fast-forward: ${ff.out}`);
    if (!ff.ok) action.push("Local main has commits that are not on origin/main. Move them to a branch.");
  } else {
    const rb = git("rebase", "origin/main");
    if (rb.ok) console.log(`Rebased ${branch} onto origin/main. Rerun typecheck and tests before pushing.`);
    else {
      const files = git("diff", "--name-only", "--diff-filter=U").out;
      console.log(`Rebase stopped on conflicts in:\n${files || rb.out}`);
      console.log(
        "Resolve them (keep the owner's version of files outside your folders, add only your changes),",
      );
      console.log("then: git add <files> && git rebase --continue    or give up with: git rebase --abort");
      process.exit(1);
    }
  }

  // 2. New COORDINATION.md entries since the last sync.
  console.log("\n== New in COORDINATION.md");
  const marker = git("rev-parse", "--git-path", "offstage-sync").out;
  const lastSeen = existsSync(marker) ? readFileSync(marker, "utf8").trim() : undefined;
  const coordination = git("show", "origin/main:COORDINATION.md");
  if (coordination.ok) {
    const entries = parseEntries(coordination.out);
    const fresh = newEntries(entries, lastSeen);
    console.log(fresh.length ? fresh.map((e) => e.body).join("\n\n") : "Nothing new.");
    if (entries.length) writeFileSync(marker, entries.at(-1)!.header);
  } else console.log("Could not read COORDINATION.md from origin/main.");

  // 3. Open PRs.
  console.log("\n== Open PRs");
  const prs = run("gh", [
    "pr",
    "list",
    "--state",
    "open",
    "--json",
    "number,title,author,headRefName,isDraft,mergeable,statusCheckRollup,url",
  ]);
  if (!prs.ok) {
    console.log(`gh pr list failed (is gh installed and logged in?): ${prs.out}`);
    action.push("Install the GitHub CLI and run gh auth login, so sync can show PRs and issues.");
  } else {
    const list = JSON.parse(prs.out) as Pr[];
    if (!list.length) console.log("None.");
    for (const pr of list) {
      const ci = ciState(pr.statusCheckRollup);
      const mine = who !== undefined && pr.headRefName.startsWith(`${who}/`);
      console.log(
        `#${pr.number} ${pr.isDraft ? "[draft] " : ""}${pr.title}\n   ${pr.author.login} | ${pr.headRefName} | CI ${ci} | ${pr.mergeable.toLowerCase()} | ${pr.url}`,
      );
      if (!mine) continue;
      if (ci === "failing") action.push(`Your PR #${pr.number} has failing CI. Fix it.`);
      if (pr.mergeable === "CONFLICTING")
        action.push(`Your PR #${pr.number} conflicts with main. Run pnpm sync on that branch.`);
      if (ci === "passing" && pr.mergeable === "MERGEABLE" && !pr.isDraft)
        action.push(`Your PR #${pr.number} is green and mergeable. Merge it if the piece works.`);
    }
  }

  // 4. Issues for this person.
  console.log(`\n== Open issues for ${who ?? "(unknown)"}`);
  if (who) {
    const issues = run("gh", [
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      `for:${who}`,
      "--json",
      "number,title,labels,url",
    ]);
    if (!issues.ok) console.log(`gh issue list failed: ${issues.out}`);
    else {
      const list = (JSON.parse(issues.out) as Issue[]).sort(
        (a, b) =>
          Number(b.labels.some((l) => l.name === "blocking")) -
          Number(a.labels.some((l) => l.name === "blocking")),
      );
      if (!list.length) console.log("None.");
      for (const i of list) {
        const blocking = i.labels.some((l) => l.name === "blocking");
        console.log(`#${i.number} ${blocking ? "[blocking] " : ""}${i.title}\n   ${i.url}`);
        action.push(`${blocking ? "Someone is waiting on " : "Handle "}issue #${i.number}: ${i.title}`);
      }
    }
  }

  console.log("\n== Action needed");
  console.log(action.length ? action.map((a) => `- ${a}`).join("\n") : "- Nothing. Carry on.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
