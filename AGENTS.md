# Project Notes

- Scripts under `scripts/js/` are TypeScript files executed directly by Node.js 24. Keep them within Node's erasable TypeScript syntax: type annotations and `type`/`interface` declarations are fine, but avoid syntax that requires transpilation such as `enum`, `namespace`, decorators, parameter properties, and tsconfig path aliases.
