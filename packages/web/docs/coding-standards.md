# DAM-Link Coding Standards

> **Status:** binding for all new code. Existing violations should be fixed when the file is touched.
> **Source of truth:** this document, `CLAUDE.md`, and `eslint.config.js` (in that order). When they conflict, fix the lower one.
> **Audience:** humans and AI subagents writing code in this repo.

---

## 0. How to read this

- The principles are **requirements**, not guidelines. New code that violates them is a defect.
- If a principle blocks you, leave a comment explaining the conflict and what would need to change to comply. Do not silently ignore.
- When a principle and a real-world constraint conflict (e.g. a third-party API), follow the constraint and document the deviation in a code comment.

---

## 1. Universal principles

| Principle | Application |
|-----------|-------------|
| **DRY** | Three similar lines is fine. Abstract on the **fourth** repetition, not before. |
| **KISS** | Prefer the smallest correct change. No "while I'm here" refactors. |
| **YAGNI** | No config flags, no abstraction for hypothetical futures. Build for today's requirement. |
| **Single Responsibility** | One reason to change per file. Split when a file does two distinct things. |
| **Pure functions** | All transformation logic (selectors, parsers, formatters, ops) is pure. Side effects only in components, hooks, and event handlers. |
| **Composition** | Prefer small composable pieces over deep inheritance or god objects. |
| **No magic numbers** | Numeric literals get a named constant or a comment that names the unit. |

---

## 2. TypeScript

- `strict: true` is the floor (this includes `strictNullChecks`, `noImplicitAny`, etc.).
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` must pass.
- `verbatimModuleSyntax: true` — use `import type { ... }` for type-only imports.
- `erasableSyntaxOnly: true` — **no enums, no namespaces**. Use string-literal unions.
- **No `any`**. Use `unknown` + narrowing. Exception: third-party type shims — must have a one-line `// eslint-disable-next-line` comment.
- **No `as` casts without justification**. If you must cast, the comment explains the gap.
- Prefer **discriminated unions** over boolean flag arguments (`{ kind: 'all' } | { kind: 'tag'; tag: string }` not `boolean isTagFilter`).
- Types that cross module boundaries live in `src/state/types.ts`. Types used by a single module are declared inline at the top of that file.
- Exhaustive switches: end with `default: return assertNever(x);` to surface unhandled cases at compile time.

---

## 3. React

- **Function components only.** No class components.
- **All components use CSS Modules.** One `.module.css` per `.tsx`, named after the component.
- **Modals and toasts render via `createPortal(..., document.body)`.** They must not be scoped under a parent's `overflow: hidden` or `transform`.
- **State is `useReducer` + Context.** No external state lib. No `useState` for global state.
- **Hook order** in a component:
  1. State (`useState`, `useReducer`, `useContext`)
  2. Derived values (`useMemo`)
  3. Stable callbacks (`useCallback`)
  4. Effects (`useEffect`)
- **`useCallback`** for callbacks passed to: memoized children, `useEffect` deps, or `useMemo` deps.
- **`useMemo`** only for: (a) genuinely expensive computation, or (b) referential stability required by a downstream consumer. **Never** as a perf superstition.
- **No inline arrow functions in JSX that capture state.** `onClick={() => setX(y)}` is fine only if `setX` is the only thing captured and the child is not memoized. If the child is `React.memo`'d or the function ends up in an effect dep, hoist it.
- **List keys are stable IDs.** Never the array index, unless the list is provably read-only for the component's lifetime.
- **IDs from `crypto.randomUUID()`** via the helper in `src/utils/id.ts`. No inline `Math.random()` or counter, except ephemeral UI IDs (toast keys) where the count never escapes the component — and even then, prefer the helper for consistency.
- Component file = component name. `Foo.tsx` exports `function Foo`.

---

## 4. CSS

- **All styles in `.module.css`.** No global CSS classes for components (only resets, tokens, and `body`).
- **Colors, radii, spacing, shadows come from `tokens.css` variables.** If a value is missing, add a token — never hardcode.
- **No inline `style={{}}` for layout.** Inline `style` is allowed only for one-off micro-content (e.g. a single table cell's padding for a tight demo). If the value is used twice, it belongs in the module CSS.
- **No `!important`** outside third-party overrides (which must be isolated).
- **No `*` selectors.** Specificity is the contract.
- **No hardcoded color literals anywhere.** If you find one, add a token to `tokens.css` and reference it.

---

## 5. Accessibility (binding)

- **No `onClick` on non-interactive elements** (`<span>`, `<div>`, `<li>`). Use a real `<button>`, or `<div role="button" tabIndex={0}>` with keyboard handling if the element cannot be a button (rare).
- **No nested interactive elements.** A `<button>` cannot contain another `<button>`, `<a>`, or `onClick`-bearing element. If you need an "action inside a row", restructure as: container is `<div role="row">` (or `<tr>`), each action is a real `<button>`. Use `e.stopPropagation()` on inner actions to prevent the row's click.
- **`role="menu"` requires the full WAI-ARIA menu pattern:** focus moves to first item on open, `ArrowDown`/`ArrowUp` navigate, `Enter`/`Space` activate, `Esc` closes, focus returns to trigger. If you can't implement the full pattern, drop the `role` and use plain buttons.
- **Every modal must:** render via portal, trap focus (Tab/Shift+Tab cycle), close on Esc, restore focus to the trigger on close, have `role="dialog"` + `aria-modal="true"` + `aria-label`.
- **Every icon-only button** has `aria-label`.
- **The toast region** has `aria-live="polite"`.
- **Tooltip/title text must match actual behavior.** A `title="恢复 (R)"` button that doesn't respond to `R` is a bug. Either implement the shortcut or remove the text.
- **Every mouse interaction has a keyboard equivalent.** A `onMouseEnter` tooltip needs a `onFocus` equivalent. A drag interaction needs keyboard arrows.
- **Color is never the only signal.** Error states pair red with an icon or text.

---

## 6. State

- **Selectors in `src/state/selectors.ts` are pure.** No hooks, no I/O, no exceptions. `selectVisibleAssets`, `isInSelection`, `matchesSearch`, etc.
- **Sidebar selection is a tagged union** — branch with `sel.kind`, never with duck-typing or property guessing.
- **Reducer is pure.** The `useReducer` switch has no `Date.now()`, no `crypto.randomUUID()`, no I/O. The impure bits go in `wrappedDispatch` (in `store.tsx`) or in `useEffect` callers.
- **Ops that return an undo payload** live in `src/state/assetOps.ts` and return `{ nextState, undo? }`. The caller applies `nextState` and stores `undo` for the toast.
- **Persisted state shape** must satisfy `isAppState()`. If it doesn't, `loadState()` returns `null` and the app falls back to mocks — never crash on bad storage.
- **Debounce timers** are independent: search 150ms in `App.tsx`, persistence 300ms in `persistence.ts`. Don't merge them.

---

## 7. Confirmations and feedback

- **Destructive actions use `useConfirm()`.** Returns `Promise<boolean>`. Never `window.confirm`, `window.alert`, `window.prompt` — they bypass the design system and block the JS thread.
- **Non-blocking feedback uses the Toast** via `useToast()`. Auto-dismiss after 4s, cap at 3 visible.
- **Undo affordance:** any destructive op that has a reverse path (move to trash, rename) should show an "撤销" toast. Permanent deletes and empty-trash do not.

---

## 8. Keyboard handling

- **Global shortcuts go through `useKeyboardShortcuts`** with a `KeymapEntry`. Each entry has a `description` that is shown in the help modal.
- **The `description` must accurately describe the actual behavior.** "关闭对话框" is a lie if the handler doesn't close a dialog.
- **Modal Escape handlers must call `e.stopImmediatePropagation()`** before `onClose()` to prevent sibling document-level listeners (`useKeyboardShortcuts`) from running on the same event.
- **Handlers must gate on open state.** Don't deselect an asset if a modal is open. Don't clear search if a context menu is open.
- **Scope awareness:** shortcuts that should only fire outside inputs (global) and shortcuts that should only fire inside inputs (editing) are distinct. `useKeyboardShortcuts` discriminates by editable target.

---

## 9. File organization

```
src/
  components/
    layout/      # AppShell, region containers
    toolbar/     # top toolbar
    sidebar/     # left nav
    browser/     # grid + list + row + card
    detail/      # right detail panel
    filter/      # filter dialog
    upload/      # upload dialog
    common/      # Modal, Toast, ConfirmDialog, ContextMenu, ShortcutsHelp
  hooks/         # useStore, useDebounce, useToast, useKeyboardShortcuts
  state/         # store, actions, types, selectors, assetOps, persistence, mockData
  utils/         # fileType, format, clipboard, download, uploadParser, id
  styles/        # global.css, tokens.css
tests/           # mirrors src/ layout
```

- **One component per file.** `Foo.tsx` exports `function Foo`. Subcomponents used only by `Foo` can live in the same file.
- **Pure functions** in `src/utils/` or `src/services/` — no React imports.
- **Hooks** in `src/hooks/`. They may import React and project code, never the other way around.
- **Test files** mirror source layout: `tests/<dir>/<name>.test.{ts,tsx}`.

---

## 10. Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Components | PascalCase, file matches | `Modal.tsx` → `function Modal` |
| Hooks | `useXxx` | `useConfirm` |
| Pure functions | camelCase | `parseFile` |
| True constants | UPPER_SNAKE_CASE | `MAX_UPLOAD_SIZE` |
| Type/interface | PascalCase, no `I` prefix | `Asset`, not `IAsset` |
| CSS modules | `<Component>.module.css` | `Modal.module.css` |
| Action types | UPPER_SNAKE_CASE, discriminated union | `'SET_SEARCH'`, `'TOGGLE_FAVORITE'` |
| Test files | `<name>.test.{ts,tsx}` | `Modal.test.tsx` |
| CSS classes | camelCase inside modules | `.modalHeader` (NOT `.modal-header`) |

---

## 11. Tests

- **Vitest** + **React Testing Library**. `tests/setup.ts` runs `cleanup()` and clears `localStorage` in `afterEach`; tests are isolated by default.
- **Don't import from `vitest/globals` or `@testing-library/jest-dom`** — they're configured globally.
- **Test behavior, not implementation.** Don't assert on internal state. Don't test that `useState` was called. Test what the user sees/does.
- **One test per behavior.** If a test name needs "and", split it.
- **TDD for new features:** write the failing test, watch it fail for the right reason, then implement.
- **Bug fixes start with a failing test** that reproduces the bug.
- **Mocks are local to the test file.** No global mock state.
- **No snapshot tests** for components — they encourage testing implementation. Use explicit assertions.

---

## 12. Commits and git

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `style:`, `perf:`.
- **One logical change per commit.** Don't bundle an unrelated refactor with a fix.
- **Run `npm test && npm run build && npm run lint`** before committing.
- **No `--no-verify`** without explicit user consent.
- **No force-push to main/master.**
- **No secrets in commits** (`.env`, `*.pem`, API keys).
- **No generated files in commits** (`dist/`, `node_modules/`, `var/`). The `.gitignore` should already cover these; check before adding.

---

## 13. Forbidden patterns (with the replacement)

| Pattern | Why it's banned | Use instead |
|---------|----------------|-------------|
| `any` type | Erodes type safety | `unknown` + type narrowing |
| `enum` / `namespace` | `erasableSyntaxOnly` ban | String-literal union |
| `window.confirm/alert/prompt` | Bypasses design system, blocks JS thread | `useConfirm()` / Toast |
| `style={{ ... }}` for layout | Style convention violation | `.module.css` |
| `onClick` on `<span>` / `<div>` | A11y violation | `<button>` |
| `onClick` nested in `<button>` | HTML invalidity | `<div role="row">` + sibling buttons |
| Inline arrow in JSX capturing state, into a memoized child or effect dep | Reference instability | `useCallback` or extract |
| Module-level `let` for mutable state | Leaks across tests, hides ownership | `useRef` / `useState` |
| Native `console.log` in committed source | Clutters prod output, never gets removed | Proper logger or remove |
| `as` cast without comment | Hides a real type error | Refactor to satisfy the type, or comment why |
| Tailwind classes | Project convention | CSS Modules |
| Hardcoded color literals (`#fff`, `rgb(...)`, etc.) | Tokens are SSoT | CSS variable in `tokens.css` |
| `!important` (outside third-party overrides) | Specificity hack | Higher specificity in module CSS |
| `useMemo` as a perf superstition | Wastes memory, obscures intent | Remove, or profile first |
| `useEffect` to derive state | Should be a render-time computation | Compute inline or `useMemo` |
| `Date.now()` / `new Date()` inside the reducer | Reducer must be pure | Move to the dispatcher / action creator |

---

## 14. Required patterns

For these scenarios, there is exactly one accepted approach. If you find yourself doing it differently, stop.

| Scenario | Required pattern |
|----------|------------------|
| Destructive action | `useConfirm()` returning `Promise<boolean>` |
| Modal | Portal + focus trap + Esc + restore focus + `role="dialog" aria-modal="true"` |
| Toast | `useToast()` (auto-dismiss + `aria-live` provided) |
| Async work that can fail | Explicit `try/catch` with typed error, or a `Result<T, E>` shape — never silent `.catch(() => {})` |
| Global shortcut | Add to the keymap with a real `description` |
| ID generation | `id()` from `src/utils/id.ts` |
| List rendering | `key={stableId}` |
| State update | `dispatch` with a typed action; reducer is pure |
| New filter / search / visibility logic | Add to `selectors.ts`, not the component |
| CSS value used twice | Move to module CSS, then to `tokens.css` if cross-cutting |

---

## 15. When to break a rule

The standards are strict, but not absolute. The override process:

1. **Add a one-line comment** at the point of deviation explaining why.
2. **Add a TODO with a date** if the override is temporary.
3. **If the deviation is permanent**, propose an amendment to this document.

Examples of legitimate overrides:
- A test must `as` cast a third-party type with a known bug → comment + `// eslint-disable-next-line`.
- A performance-critical render path needs `useMemo` despite no obvious expense → comment with the measured reason.
- An integration with a third-party CSS reset needs `!important` → isolate in a `_overrides.module.css`.

---

## 16. Enforcement

- **`npm run build`** enforces: TypeScript strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- **`npm run lint`** enforces: ESLint flat config (see `eslint.config.js`). Extend the config for project-specific rules; do not turn off rules per-file without a comment.
- **`npm test`** enforces: unit tests pass, coverage of changed code is not required to a fixed percentage but the new code must have tests.
- **Code review** catches everything else, especially the a11y and convention items that the linter can't see.

When the linter, the tests, and the build all pass, the code is mechanically correct. When it also passes review against this document, it's project-correct.

---

## 17. Cross-references

- **`CLAUDE.md`** — project overview, commands, data model summary. Read this first.
- **`docs/api-contract.md`** — backend API contract. Defines the shape the frontend must match.
- **`docs/code-review-2026-06-04.md`** — the most recent review; lists active violations to fix.
- **`docs/superpowers/plans/`** — historical implementation plans. Useful context for "why is it this way".
