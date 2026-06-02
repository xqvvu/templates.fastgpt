import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const root = process.cwd();
export const metadataPath = path.join(root, ".fastgpt-template-update.json");
export const changelogPath = path.join(root, "CHANGELOG.md");
export const prBodyPath = path.join(root, ".fastgpt-template-pr-body.md");
export const validationSummaryPath = path.join(
  root,
  ".fastgpt-template-validation-summary.md",
);
export const feishuPayloadPath = path.join(root, ".fastgpt-template-feishu.json");

export const templateNames = ["fastgpt", "fastgpt-pro", "fastgpt-milvus"] as const;

export type TemplateName = (typeof templateNames)[number];

export type UpdateMetadata = {
  source_version: string;
  fastgpt_ref: string;
  templates_branch?: string;
  updated_by?: string;
  created_at?: string;
};

export type RunMode = "success" | "failure";

export function relative(filePath: string) {
  return path.relative(root, filePath);
}

export async function readUpdateMetadata() {
  if (!existsSync(metadataPath)) {
    throw new Error(`Missing update metadata file: ${relative(metadataPath)}`);
  }

  const content = await readFile(metadataPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${relative(metadataPath)}: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${relative(metadataPath)} must contain a JSON object.`);
  }

  const metadata: UpdateMetadata = {
    source_version: readRequiredString(parsed, "source_version"),
    fastgpt_ref: readRequiredString(parsed, "fastgpt_ref"),
  };
  const templatesBranch = readOptionalString(parsed, "templates_branch");
  const updatedBy = readOptionalString(parsed, "updated_by");
  const createdAt = readOptionalString(parsed, "created_at");
  if (templatesBranch) {
    metadata.templates_branch = templatesBranch;
  }
  if (updatedBy) {
    metadata.updated_by = updatedBy;
  }
  if (createdAt) {
    metadata.created_at = createdAt;
  }

  validateRefLike(metadata.source_version, "source_version");
  validateRefLike(metadata.fastgpt_ref, "fastgpt_ref");
  if (metadata.templates_branch) {
    validateBranchLike(metadata.templates_branch, "templates_branch");
  }
  if (metadata.created_at && Number.isNaN(Date.parse(metadata.created_at))) {
    throw new Error("metadata.created_at must be an ISO-compatible date string.");
  }

  return metadata;
}

export async function readLatestChangelogEntry() {
  if (!existsSync(changelogPath)) {
    throw new Error(`Missing changelog file: ${relative(changelogPath)}`);
  }

  const content = await readFile(changelogPath, "utf8");
  const matches = [...content.matchAll(/^##\s+\d{4}-\d{2}-\d{2}\s*$/gm)];
  const latest = matches.at(-1);
  if (!latest || latest.index === undefined) {
    throw new Error("CHANGELOG.md does not contain a dated update entry.");
  }

  return content.slice(latest.index).trim();
}

export function changelogSourceVersion(entry: string) {
  return entry.match(/^- 部署源版本：`([^`]+)`\s*$/m)?.[1];
}

export function git(args: string[], options: { cwd?: string; allowFailure?: boolean } = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
  });

  if (result.status !== 0 && !options.allowFailure) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`git ${args.join(" ")} failed${output ? `\n\n${output}` : ""}`);
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 0,
  };
}

export function submoduleRef(pathName: string) {
  const cwd = path.join(root, pathName);
  const hash = git(["rev-parse", "HEAD"], { cwd }).stdout.trim();
  const branch = git(["branch", "--show-current"], { cwd, allowFailure: true }).stdout.trim();
  const describe = git(["describe", "--tags", "--always", "--dirty"], {
    cwd,
    allowFailure: true,
  }).stdout.trim();

  return {
    hash,
    short: hash.slice(0, 10),
    branch: branch || "detached",
    describe,
  };
}

export function currentBranch() {
  return (
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    git(["branch", "--show-current"], { allowFailure: true }).stdout.trim()
  );
}

export function githubRunUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!server || !repository || !runId) {
    return undefined;
  }

  return `${server}/${repository}/actions/runs/${runId}`;
}

export function githubRepositoryUrl() {
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repository = process.env.GITHUB_REPOSITORY;
  return repository ? `${server}/${repository}` : undefined;
}

function readRequiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`metadata.${key} must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`metadata.${key} must be a non-empty string when provided.`);
  }

  return value.trim();
}

function validateRefLike(value: string, key: string) {
  if (!/^[A-Za-z0-9._/-]+$/.test(value) || value.includes("..") || value.startsWith("/")) {
    throw new Error(`metadata.${key} contains unsafe characters: ${value}`);
  }
}

function validateBranchLike(value: string, key: string) {
  validateRefLike(value, key);
  if (value.endsWith("/") || value.endsWith(".lock")) {
    throw new Error(`metadata.${key} is not a valid branch-like value: ${value}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
