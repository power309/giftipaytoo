// Test-only stub. The real `server-only` package throws unconditionally when
// imported outside a Next.js server bundle (it has no way to detect a plain
// Node/Vitest process as "server"). Every module under src/server and
// src/lib starts with `import 'server-only'`, so without this alias no
// server module could be imported directly in a test at all.
// Aliased in vitest.config.ts — production builds still use the real package.
export {};
