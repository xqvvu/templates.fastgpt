---
name: fastgpt-template-maintainer
description: Maintain the FastGPT Sealos app-store templates from the FastGPT production deployment sources. Use when updating templates/template/fastgpt, templates/template/fastgpt-pro, or templates/template/fastgpt-milvus, or when comparing FastGPT Docker Compose deployment files with Sealos templates.
---

# FastGPT Sealos Template Maintainer

## Purpose

Maintain the FastGPT template family in `templates/template/`:

- `fastgpt`
- `fastgpt-pro`
- `fastgpt-milvus`

This skill updates existing Sealos app-store templates from FastGPT production deployment sources. It is not a blind Docker Compose to Kubernetes conversion. Preserve the app-store product shape and Sealos-managed platform resources while bringing images, runtime env, services, and integration wiring up to date.

## Required Companion Skill

Before editing FastGPT templates, also read `.agents/skills/docker-to-sealos/SKILL.md`.

Use `docker-to-sealos` as the baseline for generic Sealos template rules:

- Template CR metadata, readme/icon URL conventions, categories, and App resource conventions.
- Resource ordering.
- KubeBlocks database strategy.
- Object storage strategy.
- Workload labels, Service/Ingress labels, and `originImageName` matching.
- Resource ladder and `imagePullPolicy`.
- ConfigMap vn naming and mount conventions.
- Database secret naming and env ordering.

FastGPT-specific rules in this skill override generic Docker-to-Sealos conversion when they intentionally replace Docker services with Sealos platform resources.

## Source Of Truth

Use these files from the `fastgpt` submodule:

- `fastgpt/deploy/version/main/args.json`: primary image repository and tag source.
- `fastgpt/deploy/version/main/docker-compose.template.yml`: production compose template source.
- `fastgpt/document/public/deploy/docker/main/cn/docker-compose.pg.yml`: generated production PG compose source for `fastgpt` and `fastgpt-pro`.
- `fastgpt/document/public/deploy/docker/main/cn/docker-compose.milvus.yml`: generated production Milvus compose source for `fastgpt-milvus`.
- `fastgpt/deploy/README.md`: upstream deployment generation rules.

Do not use `fastgpt/deploy/dev/docker-compose.cn.yml` as a production source. It may be useful only as a service inventory reference for local development-only services.

## Template Family Rules

### `fastgpt`

Use the production PG compose shape.

Expected core components:

- FastGPT app Deployment, Service, Ingress, and App resource.
- KubeBlocks MongoDB.
- KubeBlocks PostgreSQL, used as the FastGPT vector database through `PG_URL`.
- KubeBlocks Redis.
- Sealos ObjectStorage buckets for public/private storage.
- FastGPT plugin Deployment/Service.
- FastGPT code sandbox Deployment/Service.
- FastGPT MCP server Deployment/Service/Ingress.
- AIProxy Deployment/Service.
- PostgreSQL init Job for the AIProxy database when AIProxy uses the shared PostgreSQL cluster.

### `fastgpt-pro`

Use the production PG compose shape plus the FastGPT Pro service.

It must include everything required by `fastgpt`, plus:

- FastGPT Pro Deployment and Service.
- Main FastGPT app env `PRO_URL` pointing to the Pro service.
- Pro service env wiring for MongoDB, PostgreSQL, Redis, plugin, AIProxy, and code sandbox.

### `fastgpt-milvus`

Use the production Milvus compose shape.

Expected core components:

- FastGPT app Deployment, Service, Ingress, and App resource.
- KubeBlocks MongoDB.
- KubeBlocks Redis.
- KubeBlocks Milvus for vector storage.
- AIProxy Deployment/Service and its PostgreSQL database wiring.
- Sealos ObjectStorage buckets where upstream compose uses MinIO for object storage.
- FastGPT plugin Deployment/Service.
- FastGPT code sandbox Deployment/Service.
- FastGPT MCP server Deployment/Service/Ingress.

Only `fastgpt-milvus` should use `MILVUS_ADDRESS`/Milvus vector envs. `fastgpt` and `fastgpt-pro` should use `PG_URL`.

## FastGPT-Specific Conversion Overrides

Apply these overrides even when a production Docker Compose file suggests raw container services:

- Do not convert FastGPT object-storage MinIO into a normal workload. Use Sealos `ObjectStorageBucket` resources and object-storage secrets.
- Do not convert MongoDB, Redis, PostgreSQL, or Milvus compose database services into normal workloads. Use KubeBlocks `Cluster` resources.
- For `fastgpt` and `fastgpt-pro`, use the Sealos PostgreSQL cluster for `PG_URL`; do not create a separate pgvector workload.
- For `fastgpt-milvus`, use the Sealos/KubeBlocks Milvus cluster for `MILVUS_ADDRESS`; do not create Milvus MinIO/etcd/standalone workloads from compose.
- Prefer the China registry image references from `args.json.images.cn` because these templates are in the `labring-actions/templates` app-store repo.
- Keep existing template metadata, README URLs, icon URLs, screenshots, and App resource product naming unless they are clearly stale or invalid.
- Preserve user-facing `inputs` unless a new required runtime value is proven necessary.
- Generated secrets and tokens belong in `defaults`; true user-provided operational values belong in `inputs`.

## Automatic Update Scope

When the user asks to update or fix the FastGPT templates, update all three template files unless they explicitly scope the request:

- `templates/template/fastgpt/index.yaml`
- `templates/template/fastgpt-pro/index.yaml`
- `templates/template/fastgpt-milvus/index.yaml`

Automatically update:

- Container images and matching `originImageName` annotations.
- Existing service env vars that changed in production compose.
- Required new env vars from production compose when they map cleanly to existing Sealos resources.
- Service URLs and internal DNS names.
- Required Deployment/Service/Ingress resources for current FastGPT core services.
- ConfigMap content that maps to FastGPT runtime config.
- README/icon/screenshot URLs only when the template folder/name changed or an existing URL is wrong.

Report clearly in the final response when the update includes high-risk structural changes:

- New core service added upstream.
- Existing service removed upstream.
- New persistent storage requirement.
- New Kubernetes API access or service account token requirement.
- New required user input or secret.
- Changes to public Ingress, MCP endpoint, object storage public URL, or database topology.

If the high-risk change can be mapped with confidence using these rules, implement it and call it out. If the mapping is ambiguous, implement the closest safe Sealos-native equivalent and call out the assumption.

## Workflow

1. Read `.agents/skills/docker-to-sealos/SKILL.md`.
2. Read this skill.
3. Inspect current `git status --short`; do not revert unrelated user or submodule changes.
4. Read the FastGPT source-of-truth files listed above.
5. Read the three current template `index.yaml` files.
6. Compare each template against its source:
   - `fastgpt` and `fastgpt-pro` vs `docker-compose.pg.yml`.
   - `fastgpt-milvus` vs `docker-compose.milvus.yml`.
   - all templates vs `args.json` image repositories and tags.
7. Apply FastGPT-specific conversion overrides before editing.
8. Edit only the necessary template files and supporting docs/scripts.
9. Validate YAML shape and template conventions as much as local tooling allows.
10. Summarize changed files, high-risk assumptions, and validation results.

## Validation Checklist

At minimum, verify:

- No updated container image uses `:latest`.
- Every managed workload has `originImageName` matching its primary container `image`.
- `fastgpt` and `fastgpt-pro` use `PG_URL` and do not use `MILVUS_ADDRESS`.
- `fastgpt-milvus` uses `MILVUS_ADDRESS` and has a KubeBlocks Milvus cluster.
- Database services are KubeBlocks resources, not app workloads.
- Object storage is represented by `ObjectStorageBucket`, not a MinIO workload, unless the bucket belongs to Milvus internals managed by KubeBlocks.
- Main app env includes correct internal URLs for plugin, code sandbox, MCP, and AIProxy.
- `fastgpt-pro` main app includes `PRO_URL`.
- MCP server has its own public Ingress host when the template exposes MCP externally.
- App resource appears last.
- Template expressions such as `${{ defaults.app_name }}` and `${{ if(...) }}` remain intact.

## Notes For Scripts

If adding helper scripts under `scripts/js/`, keep them compatible with Node.js 24 erasable TypeScript syntax:

- Type annotations and `type`/`interface` declarations are allowed.
- Avoid `enum`, `namespace`, decorators, parameter properties, and tsconfig path aliases.
