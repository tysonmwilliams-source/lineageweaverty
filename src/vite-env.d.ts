/// <reference types="vite/client" />

/**
 * Vite's ambient types: `import.meta.env`, and the module declarations for
 * asset imports (`?url`, `?raw`, `.svg`, `.css`).
 *
 * Absent until the first `.tsx` file read `import.meta.env.DEV` — the services
 * that use it are still `.js`, and `checkJs` is off, so nothing had asked for
 * these declarations before. It is the file `npm create vite` would have put
 * here; this project predates its own TypeScript config.
 */
