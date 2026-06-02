import { readFile, writeFile } from "node:fs/promises";
import {
  currentBranch,
  githubRepositoryUrl,
  prBodyPath,
  readLatestChangelogEntry,
  readUpdateMetadata,
  relative,
  submoduleRef,
  validationSummaryPath,
} from "./fastgpt-template-pr/lib.ts";

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main() {
  const metadata = await readUpdateMetadata();
  const changelogEntry = await readLatestChangelogEntry();
  const fastgpt = submoduleRef("fastgpt");
  const templates = submoduleRef("templates");
  const branch = currentBranch();
  const repositoryUrl = githubRepositoryUrl();
  const validationSummary = await readOptionalValidationSummary();

  const body = [
    "## Summary",
    "",
    "This PR was prepared by the local FastGPT template maintenance agent and opened automatically by CI.",
    "",
    "## Update Metadata",
    "",
    `- Source version: \`${metadata.source_version}\``,
    `- FastGPT ref: \`${metadata.fastgpt_ref}\``,
    `- Branch: \`${branch || "unknown"}\``,
    metadata.templates_branch ? `- Templates branch: \`${metadata.templates_branch}\`` : undefined,
    metadata.updated_by ? `- Updated by: \`${metadata.updated_by}\`` : undefined,
    metadata.created_at ? `- Created at: \`${metadata.created_at}\`` : undefined,
    "",
    "## Submodules",
    "",
    `- FastGPT: \`${fastgpt.short}\` (${fastgpt.branch}, ${fastgpt.describe})`,
    `- Templates: \`${templates.short}\` (${templates.branch}, ${templates.describe})`,
    repositoryUrl ? `- Repository: ${repositoryUrl}` : undefined,
    "",
    validationSummary,
    "",
    "## Latest Changelog Entry",
    "",
    changelogEntry,
    "",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  await writeFile(prBodyPath, body, "utf8");
  console.log(`wrote ${relative(prBodyPath)}`);
}

async function readOptionalValidationSummary() {
  try {
    return (await readFile(validationSummaryPath, "utf8")).trim();
  } catch {
    return "## Validation Summary\n\nValidation summary was not generated.";
  }
}
