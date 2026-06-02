# Project Notes

- Scripts under `scripts/js/` are TypeScript files executed directly by Node.js 24. Keep them within Node's erasable TypeScript syntax: type annotations and `type`/`interface` declarations are fine, but avoid syntax that requires transpilation such as `enum`, `namespace`, decorators, parameter properties, and tsconfig path aliases.
- When maintaining FastGPT Sealos app-store templates under `templates/template/fastgpt`, `templates/template/fastgpt-pro`, or `templates/template/fastgpt-milvus`, use `.agents/skills/fastgpt-template-maintainer/SKILL.md`.
- The FastGPT template maintainer skill depends on `.agents/skills/docker-to-sealos/SKILL.md` for generic Sealos template conventions. FastGPT-specific rules override generic Docker Compose conversion when replacing compose services with Sealos-managed ObjectStorage or KubeBlocks resources.
- Before reading FastGPT deployment sources or editing FastGPT templates, refresh the submodules with `node scripts/js/update-submodules.ts` unless the user explicitly asks not to. If only checking, run `node scripts/js/update-submodules.ts --dry-run`.
- FastGPT template maintenance must use production deployment sources from the `fastgpt` submodule, not `fastgpt/deploy/dev/docker-compose.cn.yml`. Update all three FastGPT templates together unless the user scopes the task.
