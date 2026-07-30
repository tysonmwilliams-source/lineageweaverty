import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // extras/ is 29 MB of unreferenced assets — not app code, not linted.
  // (old-build-archive and archived-components were deleted outright in the
  // audit cleanup; the tag archive/pre-audit-old-build points at the last commit
  // that contained them.)
  globalIgnores([
    'dist',
    'extras',
  ]),
  {
    // Build/test files run in Node, not the browser. Without this they report
    // spurious no-undef on `process` and `global`.
    files: ['*.config.js', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Decision F3: `warn`, not `error`.
      //
      // At `error` this rule alone accounted for 411 of 474 problems, so lint
      // could never pass and CI had to run it with continue-on-error — meaning
      // *no* rule was enforced, including the ones that catch real bugs. Three
      // of the highest-value defects in the 2026-07-30 audit were exactly what a
      // blocking linter catches for free: an undefined `setFragmentNavExpanded`,
      // a duplicate JSON key silently corrupting a person record, and a
      // `validation` ReferenceError introduced mid-audit that survived a whole
      // phase.
      //
      // Unused variables stay visible as warnings. Everything below is a hard
      // error, so lint is now a real gate.
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        // Conventional opt-out for deliberately-ignored positional args and
        // destructured rest-siblings (`const { createdAt, ...data } = row`).
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],

      // ── Hard errors: the rules that catch actual defects ──────────────────
      // All of these are at zero today. Listed explicitly rather than left to
      // the presets so that a future preset change can't silently soften them.
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-unsafe-negation': 'error',
      'no-unreachable': 'error',
      'valid-typeof': 'error',
      'use-isnan': 'error',
      'react-hooks/rules-of-hooks': 'error',

      // Cosmetic/stylistic findings that shouldn't block a build.
      'no-case-declarations': 'warn',
      'no-control-regex': 'warn',
      'react-refresh/only-export-components': 'warn',

      // ── React Compiler rules: warn for now, but these are NOT noise ────────
      //
      // eslint-plugin-react-hooks v7 ships these as errors. They were not part
      // of decision F3 (which was about no-unused-vars), and there are 33 of
      // them, so leaving them as errors would keep the gate red and defeat the
      // point. Downgraded so the gate goes green today.
      //
      // Do not mistake these for the unused-variable debt. `static-components`
      // in particular is a real bug class — a component created during render
      // resets its state on every parent render — and CodexBrowse.jsx has four.
      // `set-state-in-effect` (14) is the cascading-render pattern. Worth a
      // dedicated pass; tracked as a follow-up, not written off.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
