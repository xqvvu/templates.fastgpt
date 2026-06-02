import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Command, InvalidArgumentError } from "commander";
import pc from "picocolors";

type ArgsJson = {
  tags?: Record<string, string>;
};

type Options = {
  note?: string[];
  template?: string[];
  sourceVersion?: string;
  allowEmpty?: boolean;
  dryRun?: boolean;
};

const root = process.cwd();
const changelogPath = path.join(root, "CHANGELOG.md");
const templateNames = ["fastgpt", "fastgpt-pro", "fastgpt-milvus"] as const;
const sourceTagNames = [
  "fastgpt",
  "fastgpt-code-sandbox",
  "fastgpt-mcp_server",
  "fastgpt-plugin",
  "aiproxy",
  "pg",
  "mongo",
  "redis",
  "minio",
  "milvus-standalone",
] as const;

const program = new Command()
  .name("update-changelog")
  .description("Append a generated Chinese FastGPT template changelog entry.")
  .option("--note <text>", "Chinese note to append to the changelog entry", collect, [])
  .option(
    "--template <name>",
    "template name to include when no template diff is present",
    collect,
    [],
  )
  .option(
    "--source-version <version>",
    "FastGPT deployment version directory to read, such as main or v4.14",
    "main",
  )
  .option("--allow-empty", "allow writing an entry when no template diff is detected")
  .option("--dry-run", "print the generated entry without writing")
  .showHelpAfterError();

program.parse();

const options = program.opts<Options>();

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${pc.red("error")} ${message}`);
  process.exitCode = 1;
});

async function main() {
  const templates = resolveTemplates(options.template ?? []);
  if (templates.length === 0 && !options.allowEmpty) {
    throw new Error(
      "No FastGPT template changes detected. Pass --template <name> or --allow-empty to force an entry.",
    );
  }

  const entry = await buildEntry(templates, options.note ?? []);

  if (options.dryRun) {
    console.log(entry);
    return;
  }

  await appendEntry(entry);
  console.log(`${pc.green("wrote")} ${path.relative(root, changelogPath)}`);
}

function collect(value: string, previous: string[]) {
  previous.push(value);
  return previous;
}

function resolveTemplates(manualTemplates: string[]) {
  const changed = changedFastgptTemplates();
  const merged = new Set([...changed, ...manualTemplates]);
  const invalid = [...merged].filter(
    (name) => !templateNames.includes(name as (typeof templateNames)[number]),
  );
  if (invalid.length > 0) {
    throw new InvalidArgumentError(
      `Unknown template: ${invalid.join(", ")}. Expected one of: ${templateNames.join(", ")}`,
    );
  }

  return templateNames.filter((name) => merged.has(name));
}

function changedFastgptTemplates() {
  const output = [
    runGit(["status", "--short", "--", "templates/template"], {
      allowFailure: true,
    }).stdout,
    runGit(["-C", "templates", "status", "--short", "--", "template"], {
      allowFailure: true,
    }).stdout,
  ].join("\n");
  const changed = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(
      /(?:templates\/)?template\/(fastgpt|fastgpt-pro|fastgpt-milvus)\/index\.yaml$/,
    );
    if (match?.[1]) {
      changed.add(match[1]);
    }
  }

  return changed;
}

async function buildEntry(templates: readonly string[], notes: readonly string[]) {
  const sourceVersion = options.sourceVersion ?? "main";
  const argsJson = await readArgsJson(sourceVersion);
  const sourceTags = sourceTagNames
    .map((name) => {
      const tag = argsJson.tags?.[name];
      return tag ? `  - \`${name}\`：\`${tag}\`` : undefined;
    })
    .filter((line): line is string => Boolean(line));

  const updatedTemplateLines =
    templates.length > 0 ? templates.map((name) => `  - \`${name}\``) : ["  - 无"];
  const templateImageLines = await templateImageSummary(templates);
  const noteLines = notes.length > 0 ? notes : ["由脚本生成更新记录。"];
  const date = new Date().toISOString().slice(0, 10);
  const fastgptRef = submoduleRef("fastgpt");
  const templatesRef = submoduleRef("templates");

  return [
    `## ${date}`,
    "",
    `- FastGPT 子模块：\`${fastgptRef.short}\`（${fastgptRef.detail}）`,
    `- Templates 子模块：\`${templatesRef.short}\`（${templatesRef.detail}）`,
    `- 部署源版本：\`${sourceVersion}\``,
    "- 更新的模板：",
    ...updatedTemplateLines,
    "- 源版本：",
    ...sourceTags,
    "- 模板镜像：",
    ...templateImageLines,
    "- 备注：",
    ...noteLines.map((note) => `  - ${note}`),
    "",
  ].join("\n");
}

async function readArgsJson(sourceVersion: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(sourceVersion)) {
    throw new InvalidArgumentError(`Invalid source version: ${sourceVersion}`);
  }

  const argsPath = path.join(root, "fastgpt/deploy/version", sourceVersion, "args.json");
  const content = await readFile(argsPath, "utf8");
  return JSON.parse(content) as ArgsJson;
}

async function templateImageSummary(templates: readonly string[]) {
  if (templates.length === 0) {
    return ["  - 无"];
  }

  const lines: string[] = [];
  for (const template of templates) {
    const filePath = path.join(root, "templates/template", template, "index.yaml");
    const content = await readFile(filePath, "utf8");
    const images = unique(
      [...content.matchAll(/^\s+image:\s+(.+?)\s*$/gm)]
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value))
        .filter((value) => value.includes("fastgpt") || value.includes("aiproxy")),
    );

    lines.push(
      `  - \`${template}\`：${images.length > 0 ? images.map((image) => `\`${image}\``).join(", ") : "无"}`,
    );
  }
  return lines;
}

function submoduleRef(pathName: string) {
  const hash = runGit(["-C", pathName, "rev-parse", "HEAD"]).stdout.trim();
  const branch = runGit(["-C", pathName, "branch", "--show-current"], {
    allowFailure: true,
  }).stdout.trim();
  const describe = runGit(["-C", pathName, "describe", "--tags", "--always", "--dirty"], {
    allowFailure: true,
  }).stdout.trim();

  return {
    short: hash.slice(0, 10),
    detail: [branch || "detached", describe].filter(Boolean).join(", "),
  };
}

async function appendEntry(entry: string) {
  const existing = existsSync(changelogPath)
    ? await readFile(changelogPath, "utf8")
    : [
        "# 更新日志",
        "",
        "本文件记录 FastGPT Sealos 模板的自动/半自动更新，由 `scripts/js/update-changelog.ts` 生成或维护。",
        "",
      ].join("\n");
  const trimmed = existing.trimEnd();
  await writeFile(changelogPath, `${trimmed}\n\n${entry}`, "utf8");
}

function unique(values: string[]) {
  return [...new Set(values)];
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
