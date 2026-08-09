import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
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
  // Decision F4. TypeScript files need their own parser, and they need to be in
  // the gate at all: a `.ts` file matches no config above, so ESLint reports
  // "File ignored because no matching configuration was supplied" and skips it
  // silently. Without this, every file the migration converts would quietly
  // leave the lint gate — `no-undef`, `rules-of-hooks` and `static-components`
  // would stop applying one file at a time, and the warning count would fall
  // for the wrong reason.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // The base rule does not understand TS types and reports false positives
      // on them; the TS-aware version replaces it with the same settings.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-undef': 'off', // tsc does this properly, and knows about types
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/static-components': 'error',

      // The same two downgrades the .js/.jsx block makes below, for the same
      // reasons — see the comments there. They live in both blocks because the
      // presets above default them to `error`, and a rule that means "warning"
      // in a .jsx file and "build failure" in the .tsx file it converts to is a
      // config accident, not a decision. This surfaced the moment the first
      // .tsx landed: the five contexts each export a provider, a hook and their
      // types from one file, which is the ordinary React idiom.
      'react-refresh/only-export-components': 'warn',

      // The same four React Compiler downgrades the .js/.jsx block makes below,
      // and for the same reason — see the longer note there. All four must be
      // mirrored, not a subset: the first version of this block carried only
      // `preserve-manual-memoization`, so converting a component that happened
      // to trip `set-state-in-effect` turned a warning into a build failure.
      // The rules describe a scheduled restructuring pass, and a file does not
      // acquire that debt by changing extension.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
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

      // Decision G7, first slice. The four violations were all one component,
      // `SubsectionHeader` in CodexBrowse.jsx, built with `useCallback(fn, [])`
      // and rendered as `<SubsectionHeader />`. Empty deps meant the identity
      // happened to be stable, so this was not the live state-reset bug the
      // audit described — but nothing enforced that. Adding a single dep, or
      // React discarding the hook cache (which it reserves the right to do),
      // remounts the whole subsection. Hoisting it to module scope took the
      // count to zero, so it is promoted to an error to keep it there.
      'react-hooks/static-components': 'error',

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
      // Do not mistake these for the unused-variable debt. `set-state-in-effect`
      // (14) is the cascading-render pattern; `preserve-manual-memoization` (10)
      // means a useMemo/useCallback the compiler had to skip, so the memoization
      // is not doing what it looks like. Both restructure render logic in files
      // with no test coverage, which is why they are a scheduled pass rather
      // than a cleanup. `static-components` is done and now errors, above.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
