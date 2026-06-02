import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseAllDocuments } from "yaml";
import {
  changelogSourceVersion,
  readLatestChangelogEntry,
  readUpdateMetadata,
  relative,
  root,
  templateNames,
  validationSummaryPath,
} from "./fastgpt-template-pr/lib.ts";

type Finding = {
  level: "error" | "warning";
  message: string;
};

type Workload = {
  kind: string;
  name: string;
  originImageName: string | undefined;
  images: string[];
};

const findings: Finding[] = [];

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  findings.push({ level: "error", message });
  await writeSummary();
  console.error(message);
  process.exitCode = 1;
});

async function main() {
  const metadata = await readUpdateMetadata();
  const changelogEntry = await readLatestChangelogEntry();
  const sourceVersion = changelogSourceVersion(changelogEntry);

  if (!sourceVersion) {
    error("Latest changelog entry is missing the deployment source version line.");
  } else if (sourceVersion !== metadata.source_version) {
    error(
      `Latest changelog source version (${sourceVersion}) does not match metadata.source_version (${metadata.source_version}).`,
    );
  }

  for (const templateName of templateNames) {
    await validateTemplate(templateName);
  }

  await writeSummary();

  const errorCount = findings.filter((finding) => finding.level === "error").length;
  const warningCount = findings.filter((finding) => finding.level === "warning").length;
  console.log(`FastGPT template PR validation: ${errorCount} error(s), ${warningCount} warning(s).`);
  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

async function validateTemplate(templateName: string) {
  const filePath = path.join(root, "templates/template", templateName, "index.yaml");
  const content = await readFile(filePath, "utf8");
  const documents = parseAllDocuments(preprocessSealosTemplate(content), {
    prettyErrors: false,
  });
  const parsedDocuments = documents.map((document, index) => {
    const errors = document.errors.map((item) => item.message);
    for (const parseError of errors) {
      error(`${relative(filePath)} document ${index + 1} failed to parse: ${parseError}`);
    }
    return document.toJSON();
  });

  checkNoLatestImages(filePath, content);
  checkVectorEnv(templateName, filePath, content);

  const workloads = collectWorkloads(parsedDocuments);
  for (const workload of workloads) {
    if (!workload.originImageName) {
      error(`${relative(filePath)} ${workload.kind}/${workload.name} is missing originImageName.`);
      continue;
    }
    if (!workload.images.includes(workload.originImageName)) {
      error(
        `${relative(filePath)} ${workload.kind}/${workload.name} originImageName (${workload.originImageName}) does not match any container image.`,
      );
    }
  }

  if (templateName === "fastgpt-pro") {
    checkContains(content, "PRO_URL", `${relative(filePath)} fastgpt-pro should include PRO_URL.`);
  }
}

function preprocessSealosTemplate(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => !/^\s*\$\{\{\s*(?:if\(|endif\(\))/.test(line))
    .join("\n")
    .replace(/\$\{\{[^}]*\}\}/g, "template_expr");
}

function checkNoLatestImages(filePath: string, content: string) {
  const latestPattern = /^\s*(?:image|originImageName):\s*['"]?[^#\s'"]*:latest(?:['"])?\s*$/gm;
  for (const match of content.matchAll(latestPattern)) {
    error(`${relative(filePath)} uses a :latest image: ${match[0].trim()}`);
  }
}

function checkVectorEnv(templateName: string, filePath: string, content: string) {
  const hasMilvusAddress = /\bMILVUS_ADDRESS\b/.test(content);
  if (templateName === "fastgpt-milvus") {
    if (!hasMilvusAddress) {
      error(`${relative(filePath)} must include MILVUS_ADDRESS.`);
    }
    checkContains(content, "kind: Cluster", `${relative(filePath)} should include a KubeBlocks Cluster.`);
    checkContains(content, "milvus", `${relative(filePath)} should include a Milvus resource reference.`);
    return;
  }

  if (hasMilvusAddress) {
    error(`${relative(filePath)} must not include MILVUS_ADDRESS.`);
  }
  checkContains(content, "PG_URL", `${relative(filePath)} should include PG_URL.`);
}

function collectWorkloads(documents: unknown[]) {
  const workloads: Workload[] = [];
  for (const document of documents) {
    if (!isRecord(document)) {
      continue;
    }

    const kind = stringValue(document.kind);
    if (!kind || !["Deployment", "StatefulSet", "DaemonSet"].includes(kind)) {
      continue;
    }

    const metadata = isRecord(document.metadata) ? document.metadata : {};
    const annotations = isRecord(metadata.annotations) ? metadata.annotations : {};
    const name = stringValue(metadata.name) ?? "(unnamed)";
    const originImageName = stringValue(annotations.originImageName);
    const images = collectImages(document);
    workloads.push({ kind, name, originImageName, images });
  }

  return workloads;
}

function collectImages(document: Record<string, unknown>) {
  const containers = [
    ...readArray(document, ["spec", "template", "spec", "initContainers"]),
    ...readArray(document, ["spec", "template", "spec", "containers"]),
  ];
  const images: string[] = [];
  for (const container of containers) {
    if (!isRecord(container)) {
      continue;
    }
    const image = stringValue(container.image);
    if (image) {
      images.push(image);
    }
  }
  return images;
}

function readArray(record: Record<string, unknown>, keys: string[]) {
  let value: unknown = record;
  for (const key of keys) {
    if (!isRecord(value)) {
      return [];
    }
    value = value[key];
  }

  return Array.isArray(value) ? value : [];
}

function checkContains(content: string, token: string, message: string) {
  if (!content.includes(token)) {
    error(message);
  }
}

function error(message: string) {
  findings.push({ level: "error", message });
}

async function writeSummary() {
  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warning");
  const lines = [
    "## Validation Summary",
    "",
    `- Errors: ${errors.length}`,
    `- Warnings: ${warnings.length}`,
    "",
  ];

  if (findings.length === 0) {
    lines.push("All FastGPT template PR checks passed.", "");
  } else {
    lines.push(
      ...findings.map((finding) => `- ${finding.level === "error" ? "ERROR" : "WARN"}: ${finding.message}`),
      "",
    );
  }

  await writeFile(validationSummaryPath, lines.join("\n"), "utf8");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
