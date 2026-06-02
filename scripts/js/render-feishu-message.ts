import { Command, InvalidArgumentError } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import type { UpdateMetadata } from "./fastgpt-template-pr/lib.ts";
import {
  currentBranch,
  feishuPayloadPath,
  githubRunUrl,
  readLatestChangelogEntry,
  readUpdateMetadata,
  relative,
  submoduleRef,
  validationSummaryPath,
} from "./fastgpt-template-pr/lib.ts";

type Options = {
  mode: "success" | "failure";
  prUrl?: string;
};

const program = new Command()
  .name("render-feishu-message")
  .description("Render a Feishu bot webhook payload for FastGPT template PR automation.")
  .requiredOption("--mode <mode>", "success or failure", parseMode)
  .option("--pr-url <url>", "GitHub pull request URL")
  .showHelpAfterError();

program.parse();
const options = program.opts<Options>();

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main() {
  const metadata = await readMetadataForNotification(options.mode);
  const changelogEntry = await readLatestChangelogEntry().catch(() => "未找到最新 CHANGELOG 条目。");
  const validationSummary = await readValidationSummary();
  const fastgpt = submoduleRefForNotification("fastgpt", options.mode);
  const templates = submoduleRefForNotification("templates", options.mode);
  const branch = currentBranch();
  const runUrl = githubRunUrl();
  const success = options.mode === "success";
  const title = success ? "FastGPT 模板 PR 已创建/更新" : "FastGPT 模板 PR 自动化失败";
  const status = success ? "成功" : "失败";
  const lines = [
    `**${title}**`,
    "",
    `- 状态：${status}`,
    `- 分支：${branch || "unknown"}`,
    `- 部署源版本：${metadata.source_version}`,
    `- FastGPT ref：${metadata.fastgpt_ref}`,
    `- FastGPT 子模块：${fastgpt.short} (${fastgpt.branch}, ${fastgpt.describe})`,
    `- Templates 子模块：${templates.short} (${templates.branch}, ${templates.describe})`,
    options.prUrl ? `- PR：${options.prUrl}` : undefined,
    runUrl ? `- Actions：${runUrl}` : undefined,
    "",
    validationSummary,
    "",
    "### 最新 CHANGELOG",
    "",
    changelogEntry,
  ].filter((line): line is string => line !== undefined);

  const payload = {
    msg_type: "interactive",
    card: {
      header: {
        title: {
          tag: "plain_text",
          content: title,
        },
        template: success ? "green" : "red",
      },
      elements: [
        {
          tag: "markdown",
          content: lines.join("\n"),
        },
      ],
    },
  };

  await writeFile(feishuPayloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${relative(feishuPayloadPath)}`);
}

function submoduleRefForNotification(pathName: string, mode: Options["mode"]) {
  try {
    return submoduleRef(pathName);
  } catch (error) {
    if (mode === "success") {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      short: "unknown",
      branch: "unknown",
      describe: `unavailable: ${message}`,
    };
  }
}

async function readMetadataForNotification(mode: Options["mode"]): Promise<UpdateMetadata> {
  try {
    return await readUpdateMetadata();
  } catch (error) {
    if (mode === "success") {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      source_version: "unknown",
      fastgpt_ref: "unknown",
      updated_by: `metadata unavailable: ${message}`,
    };
  }
}

function parseMode(value: string) {
  if (value !== "success" && value !== "failure") {
    throw new InvalidArgumentError("Expected success or failure.");
  }
  return value;
}

async function readValidationSummary() {
  try {
    return (await readFile(validationSummaryPath, "utf8")).trim();
  } catch {
    return "## Validation Summary\n\nValidation summary was not generated.";
  }
}
