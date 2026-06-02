# FastGPT Sealos 模板维护仓库

这个仓库用于半自动维护 Sealos 应用商店里的 FastGPT 模板。它把 FastGPT 上游的生产部署配置转换并同步到 `templates` 子模块中的模板文件，同时保留 Sealos 应用商店需要的产品形态、KubeBlocks 数据库、对象存储和 App 元信息。

## 仓库结构

- `fastgpt`：FastGPT 上游源码子模块，用来读取生产部署文档、版本参数和 Docker Compose。
- `templates`：Sealos 应用商店模板子模块，FastGPT 模板位于 `templates/template/`。
- `.agents/skills/fastgpt-template-maintainer`：FastGPT 模板维护规则。
- `.agents/skills/docker-to-sealos`：Docker Compose 到 Sealos 模板的通用转换规则。
- `scripts/js/update-submodules.ts`：更新 `fastgpt` 和 `templates` 子模块到最新引用。
- `scripts/js/update-changelog.ts`：生成或追加 `CHANGELOG.md` 更新记录。

## 模板范围

- `templates/template/fastgpt/index.yaml`：标准 FastGPT 模板，使用 PostgreSQL/PGVector 作为向量数据库。
- `templates/template/fastgpt-pro/index.yaml`：FastGPT Pro 模板，在标准模板基础上增加 Pro 服务，仍使用 PostgreSQL/PGVector。
- `templates/template/fastgpt-milvus/index.yaml`：Milvus 向量库模板，除向量数据库改为 Milvus 外，运行时环境变量、对象存储、AIProxy、插件、代码沙箱和 MCP 服务应尽量与标准 FastGPT 模板保持一致。

## 信息来源

维护模板时应优先读取 `fastgpt` 子模块中的生产部署源。默认使用 `main`；如果要维护稳定版本线，例如 4.14.x，则使用对应的 `v4.14` 目录：

- `fastgpt/deploy/version/main/args.json`
- `fastgpt/deploy/version/main/docker-compose.template.yml`
- `fastgpt/document/public/deploy/docker/main/cn/docker-compose.pg.yml`
- `fastgpt/document/public/deploy/docker/main/cn/docker-compose.milvus.yml`
- `fastgpt/deploy/version/v4.14/args.json`
- `fastgpt/deploy/version/v4.14/docker-compose.template.yml`
- `fastgpt/document/public/deploy/docker/v4.14/cn/docker-compose.pg.yml`
- `fastgpt/document/public/deploy/docker/v4.14/cn/docker-compose.milvus.yml`
- `fastgpt/deploy/README.md`

不要把 `fastgpt/deploy/dev/docker-compose.cn.yml` 当作生产模板来源。它最多只能作为本地开发服务清单的辅助参考。

## 更新流程

1. 刷新子模块：

   ```sh
   node scripts/js/update-submodules.ts
   ```

2. 使用 `fastgpt-template-maintainer` skill 检查上游生产部署源和三个模板的差异，并按 Sealos 规则更新模板。

3. 如果模板发生变化，追加中文更新日志：

   ```sh
   node scripts/js/update-changelog.ts --source-version <main|v4.14|...> --note "<中文摘要>"
   ```

4. 运行本地校验：

   ```sh
   pnpm typecheck
   git -C templates diff --check
   ```

5. 检查父仓库和子模块状态，确认模板变更、脚本变更和 `CHANGELOG.md` 记录在同一轮提交里。

## CHANGELOG 规则

`CHANGELOG.md` 由 AGENT 在模板更新流程中自动维护，不需要每次手写。更新记录应包含：

- 本次使用的 `fastgpt` 子模块引用。
- 本次使用的 `templates` 子模块引用。
- 被更新的模板名称。
- 上游 `args.json` 中的关键镜像版本。
- 本次使用的部署源版本，例如 `main` 或 `v4.14`。
- 模板实际使用的 FastGPT/AIProxy 镜像。
- 中文备注，说明资源、环境变量、服务拓扑或高风险假设的变化。

只修改 skill、AGENTS、README 或辅助脚本时，不需要追加模板更新日志。
