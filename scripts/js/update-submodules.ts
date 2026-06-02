import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Command, InvalidArgumentError } from "commander";
import pc from "picocolors";

type Submodule = {
  name: string;
  path: string;
  branch?: string;
};

type Options = {
  status?: boolean;
  dryRun?: boolean;
  stage?: boolean;
  force?: boolean;
  ref?: string[];
};

type RefPlan = {
  ref: string;
  source: "branch" | "manual";
};

type Row = {
  name: string;
  state: string;
  target: string;
  before: string;
  after: string;
  delta: string;
  detail?: string;
};

const root = process.cwd();

const program = new Command()
  .name("update-submodules")
  .description("Update and inspect git submodules declared in .gitmodules.")
  .argument("[names...]", "submodule names to update")
  .option("--status", "show submodule status without changing anything")
  .option("--dry-run", "show what would change without checkout, pull, or stage")
  .option("--stage", "stage updated submodule pointers in the parent repository")
  .option("--force", "continue when a submodule has local changes")
  .option("--ref <ref>", "manual ref, or name=ref for multiple submodules", collect, [])
  .showHelpAfterError();

program.parse();

const names = program.args;
const options = program.opts<Options>();

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${pc.red("error")} ${message}`);
  process.exitCode = 1;
});

async function main() {
  const submodules = await readGitmodules();
  const selected = selectSubmodules(submodules, names);
  const refPlans = buildRefPlans(selected, options.ref ?? []);

  if (options.status) {
    printTitle("Submodule status");
    printRows(statusRows(selected, refPlans));
    return;
  }

  if (options.dryRun) {
    printTitle("Submodule update dry run");
    runGit(["submodule", "sync", "--recursive"]);
    printRows(dryRunRows(selected, refPlans));
    return;
  }

  printTitle("Updating submodules");
  runGit(["submodule", "sync", "--recursive"]);
  runGit([
    "submodule",
    "update",
    "--init",
    "--recursive",
    "--",
    ...selected.map((item) => item.path),
  ]);
  for (const submodule of selected) {
    syncNestedSubmodules(submodule);
  }
  for (const submodule of selected) {
    assertClean(submodule, Boolean(options.force));
  }

  const rows: Row[] = [];
  for (const submodule of selected) {
    const plan = refPlans.get(submodule.name);
    if (!plan) {
      throw new Error(`Missing update plan for submodule: ${submodule.name}`);
    }

    rows.push(updateSubmodule(submodule, plan));
  }

  if (options.stage) {
    runGit(["add", "--", ...selected.map((item) => item.path)]);
  }

  printRows(rows);
  printCommitMessage(rows);
}

function collect(value: string, previous: string[]) {
  previous.push(value);
  return previous;
}

async function readGitmodules() {
  const content = await readFile(path.join(root, ".gitmodules"), "utf8");
  const submodules: Submodule[] = [];
  let current: Submodule | undefined;

  for (const line of content.split(/\r?\n/)) {
    const section = line.match(/^\s*\[submodule\s+"(.+)"\]\s*$/);
    const sectionName = section?.[1];
    if (sectionName) {
      current = { name: sectionName, path: "" };
      submodules.push(current);
      continue;
    }

    const property = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/);
    const key = property?.[1];
    const value = property?.[2];
    if (!key || value === undefined || !current) {
      continue;
    }

    if (key === "path") {
      current.path = value;
    }
    if (key === "branch") {
      current.branch = value;
    }
  }

  const invalid = submodules.find((item) => !item.path);
  if (invalid) {
    throw new Error(`Missing path for submodule: ${invalid.name}`);
  }

  return submodules;
}

function selectSubmodules(submodules: Submodule[], selectedNames: string[]) {
  if (selectedNames.length === 0) {
    return submodules;
  }

  const byName = new Map(submodules.map((item) => [item.name, item]));
  const unknown = selectedNames.filter((name) => !byName.has(name));
  if (unknown.length > 0) {
    throw new InvalidArgumentError(
      `Unknown submodule: ${unknown.join(", ")}. Available: ${submodules.map((item) => item.name).join(", ")}`,
    );
  }

  return selectedNames.map((name) => {
    const submodule = byName.get(name);
    if (!submodule) {
      throw new Error(`Unknown submodule: ${name}`);
    }
    return submodule;
  });
}

function buildRefPlans(selected: Submodule[], refs: string[]) {
  const selectedNames = new Set(selected.map((item) => item.name));
  const plans = new Map<string, RefPlan>();

  for (const item of selected) {
    if (item.branch) {
      plans.set(item.name, { ref: item.branch, source: "branch" });
    }
  }

  for (const value of refs) {
    const separator = value.indexOf("=");
    if (separator === -1) {
      if (selected.length !== 1) {
        throw new Error(
          `Bare --ref requires exactly one selected submodule. Use --ref name=ref instead.`,
        );
      }
      const onlySubmodule = selected[0];
      if (!onlySubmodule) {
        throw new Error("Bare --ref requires a selected submodule.");
      }
      plans.set(onlySubmodule.name, { ref: value, source: "manual" });
      continue;
    }

    const name = value.slice(0, separator);
    const ref = value.slice(separator + 1);
    if (!selectedNames.has(name)) {
      throw new Error(`--ref targets unselected or unknown submodule: ${name}`);
    }
    if (!ref) {
      throw new Error(`Missing ref for submodule: ${name}`);
    }
    plans.set(name, { ref, source: "manual" });
  }

  for (const item of selected) {
    if (!plans.has(item.name)) {
      throw new Error(
        `Missing branch for submodule: ${item.name}. Add branch to .gitmodules, or pass --ref ${item.name}=<ref>.`,
      );
    }
  }

  return plans;
}

function statusRows(submodules: Submodule[], plans: Map<string, RefPlan>) {
  return submodules.map((submodule) => {
    const initialized = isInitialized(submodule);
    const before = initialized ? short(revParse(submodule, "HEAD")) : "-";
    const plan = plans.get(submodule.name);
    const dirty = initialized && getSubmoduleStatus(submodule).length > 0;
    const parent = parentPointerChanged(submodule);
    const state = !initialized ? "missing" : dirty ? "dirty" : parent ? "changed" : "clean";

    return {
      name: submodule.name,
      state,
      target: plan?.ref ?? "-",
      before,
      after: before,
      delta: "0",
      detail: initialized ? currentBranch(submodule) : "not initialized",
    };
  });
}

function dryRunRows(submodules: Submodule[], plans: Map<string, RefPlan>) {
  const rows: Row[] = [];

  for (const submodule of submodules) {
    if (!isInitialized(submodule)) {
      rows.push({
        name: submodule.name,
        state: "missing",
        target: plans.get(submodule.name)?.ref ?? "-",
        before: "-",
        after: "-",
        delta: "n/a",
        detail: "not initialized",
      });
      continue;
    }

    assertClean(submodule, Boolean(options.force));
    const plan = requiredPlan(plans, submodule);
    fetchSubmodule(submodule, plan);
    const before = revParse(submodule, "HEAD");
    const after = resolveTarget(submodule, plan);
    rows.push({
      name: submodule.name,
      state: before === after ? "unchanged" : "would update",
      target: plan.ref,
      before: short(before),
      after: short(after),
      delta: commitDelta(submodule, before, after),
      detail: plan.source,
    });
  }

  return rows;
}

function updateSubmodule(submodule: Submodule, plan: RefPlan) {
  const before = revParse(submodule, "HEAD");
  fetchSubmodule(submodule, plan);

  if (plan.source === "branch") {
    runGit(["-C", submodule.path, "checkout", plan.ref]);
    runGit(["-C", submodule.path, "pull", "--ff-only", "origin", plan.ref]);
  } else {
    runGit(["-C", submodule.path, "checkout", plan.ref]);
  }

  const after = revParse(submodule, "HEAD");
  syncNestedSubmodules(submodule);
  return {
    name: submodule.name,
    state: before === after ? "unchanged" : "updated",
    target: plan.ref,
    before: short(before),
    after: short(after),
    delta: commitDelta(submodule, before, after),
    detail: plan.source,
  };
}

function fetchSubmodule(submodule: Submodule, plan: RefPlan) {
  if (plan.source === "branch") {
    runGit(["-C", submodule.path, "fetch", "origin", plan.ref]);
  } else {
    runGit(["-C", submodule.path, "fetch", "--tags", "origin"]);
  }
}

function syncNestedSubmodules(submodule: Submodule) {
  runGit(["-C", submodule.path, "submodule", "sync", "--recursive"]);
  runGit(["-C", submodule.path, "submodule", "update", "--init", "--recursive"]);
}

function resolveTarget(submodule: Submodule, plan: RefPlan) {
  if (plan.source === "branch") {
    return revParse(submodule, `origin/${plan.ref}`);
  }
  return revParse(submodule, plan.ref);
}

function requiredPlan(plans: Map<string, RefPlan>, submodule: Submodule) {
  const plan = plans.get(submodule.name);
  if (!plan) {
    throw new Error(`Missing update plan for submodule: ${submodule.name}`);
  }
  return plan;
}

function assertClean(submodule: Submodule, force: boolean) {
  if (force) {
    return;
  }

  const status = getSubmoduleStatus(submodule);
  if (status.length > 0) {
    throw new Error(
      `Cannot update ${submodule.name}: local changes detected.\n\n${status.join("\n")}\n\nCommit, stash, or rerun with --force.`,
    );
  }
}

function isInitialized(submodule: Submodule) {
  return existsSync(path.join(root, submodule.path, ".git"));
}

function getSubmoduleStatus(submodule: Submodule) {
  return runGit(["-C", submodule.path, "status", "--short"], { allowFailure: true })
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
}

function parentPointerChanged(submodule: Submodule) {
  const output = runGit(["status", "--short", "--", submodule.path], {
    allowFailure: true,
  }).stdout.trim();
  return output.length > 0;
}

function currentBranch(submodule: Submodule) {
  const branch = runGit(["-C", submodule.path, "branch", "--show-current"], {
    allowFailure: true,
  }).stdout.trim();
  return branch || "detached";
}

function revParse(submodule: Submodule, ref: string) {
  return runGit(["-C", submodule.path, "rev-parse", ref]).stdout.trim();
}

function commitDelta(submodule: Submodule, before: string, after: string) {
  if (!before || !after || before === "-" || after === "-") {
    return "n/a";
  }

  const ahead = runGit(["-C", submodule.path, "rev-list", "--count", `${before}..${after}`], {
    allowFailure: true,
  }).stdout.trim();
  const behind = runGit(["-C", submodule.path, "rev-list", "--count", `${after}..${before}`], {
    allowFailure: true,
  }).stdout.trim();
  if (!/^\d+$/.test(ahead) || !/^\d+$/.test(behind)) {
    return "n/a";
  }

  if (behind === "0") {
    return `+${ahead}`;
  }
  if (ahead === "0") {
    return `-${behind}`;
  }
  return `+${ahead} -${behind}`;
}

function short(hash: string) {
  return hash ? hash.slice(0, 10) : "-";
}

function runGit(args: string[], settings: { allowFailure?: boolean } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0 && !settings.allowFailure) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`git ${args.join(" ")} failed${output ? `\n\n${output}` : ""}`);
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 0,
  };
}

function printTitle(title: string) {
  console.log(pc.bold(title));
  console.log("");
}

function printRows(rows: Row[]) {
  const widths = {
    name: maxWidth(
      rows.map((row) => row.name),
      "submodule",
    ),
    state: maxWidth(
      rows.map((row) => row.state),
      "state",
    ),
    target: maxWidth(
      rows.map((row) => row.target),
      "target",
    ),
    before: maxWidth(
      rows.map((row) => row.before),
      "before",
    ),
    after: maxWidth(
      rows.map((row) => row.after),
      "after",
    ),
    delta: maxWidth(
      rows.map((row) => row.delta),
      "delta",
    ),
  };

  console.log(
    [
      pc.dim(pad("submodule", widths.name)),
      pc.dim(pad("state", widths.state)),
      pc.dim(pad("target", widths.target)),
      pc.dim(pad("before", widths.before)),
      pc.dim(pad("after", widths.after)),
      pc.dim(pad("delta", widths.delta)),
      pc.dim("detail"),
    ].join("  "),
  );

  for (const row of rows) {
    console.log(
      [
        pc.cyan(pad(row.name, widths.name)),
        colorState(pad(row.state, widths.state), row.state),
        pad(row.target, widths.target),
        pc.dim(pad(row.before, widths.before)),
        pc.dim(pad(row.after, widths.after)),
        pc.green(pad(row.delta, widths.delta)),
        pc.dim(row.detail ?? ""),
      ].join("  "),
    );
  }
}

function printCommitMessage(rows: Row[]) {
  const changed = rows.filter((row) => row.before !== row.after);
  if (changed.length === 0) {
    return;
  }

  console.log("");
  console.log(pc.bold("Suggested commit message"));
  console.log("");
  console.log("chore: update submodules");
  console.log("");
  for (const row of changed) {
    console.log(`- ${row.name}: ${row.before} -> ${row.after}`);
  }
}

function colorState(value: string, state: string) {
  if (state.includes("updated") || state.includes("clean")) {
    return pc.green(value);
  }
  if (state.includes("dirty") || state.includes("missing")) {
    return pc.yellow(value);
  }
  if (state.includes("would")) {
    return pc.blue(value);
  }
  return pc.dim(value);
}

function maxWidth(values: string[], fallback: string) {
  return Math.max(fallback.length, ...values.map((value) => value.length));
}

function pad(value: string, width: number) {
  return value.padEnd(width, " ");
}
