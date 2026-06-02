# 更新日志

本文件记录 FastGPT Sealos 模板的自动/半自动更新，由 `scripts/js/update-changelog.ts` 生成或维护。

## 2026-06-02

- FastGPT 子模块：`58254a475d`（main, v4.15.0-beta3-15-g58254a475）
- Templates 子模块：`65343698dc`（kb-0.9, 6534369-dirty）
- 部署源版本：`v4.14`
- 更新的模板：
  - `fastgpt`
  - `fastgpt-pro`
  - `fastgpt-milvus`
- 源版本：
  - `fastgpt`：`v4.14.22`
  - `fastgpt-code-sandbox`：`v4.14.22`
  - `fastgpt-mcp_server`：`v4.14.22`
  - `fastgpt-plugin`：`v0.6.2`
  - `aiproxy`：`v0.5.8`
  - `pg`：`0.8.0-pg15`
  - `mongo`：`5.0.32`
  - `redis`：`7.2-alpine`
  - `minio`：`RELEASE.2025-09-07T16-13-09Z`
  - `milvus-standalone`：`v2.4.3`
- 模板镜像：
  - `fastgpt`：`registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-plugin:v0.6.2`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-code-sandbox:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-mcp_server:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/labring/aiproxy:v0.5.8`
  - `fastgpt-pro`：`registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-pro:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-plugin:v0.6.2`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-code-sandbox:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-mcp_server:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/labring/aiproxy:v0.5.8`
  - `fastgpt-milvus`：`registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-plugin:v0.6.2`, `registry.cn-hangzhou.aliyuncs.com/labring/aiproxy:v0.5.8`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-code-sandbox:v4.14.22`, `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-mcp_server:v4.14.22`
- 备注：
  - 将三个 FastGPT 模板从 4.15.0 beta 线调整到 4.14.x 稳定线，主应用、代码沙箱、MCP Server 和 Pro 镜像使用 v4.14.22。
  - 按 FastGPT v4.14 生产部署源校准 code sandbox 环境变量，移除 4.15 beta 才出现的 sandbox 输出/请求体配置，并将内部 IP 检查恢复为 v4.14 默认值。
  - 保留 Sealos 原生对象存储、KubeBlocks 数据库、AIProxy PostgreSQL 初始化 Job、数据库资源提升，以及 Milvus 模板与标准模板的共享运行时设施对齐。
