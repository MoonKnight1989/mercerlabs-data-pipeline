# How We Build

This is the universal reference for every build session across all Massive Marketing projects. Read this before starting work. Then read the project's `CLAUDE.md` for project-specific context.

---

## Core Beliefs

- **Clean and efficient code, always.** No bloat, no dead weight, no "good enough for now." If it's not clean, it's not done.
- **Modern code, always.** Use current patterns, current APIs, current conventions. Don't write code that feels like it was built three years ago.
- **Type-safe by default.** Everything is TypeScript, strict mode, no exceptions. If the compiler can catch it, we don't ship it. Types are documentation that the compiler enforces.
- **Independent by default, dependent when necessary.** Every app, module, and function should stand on its own. Coupling is a conscious choice, not an accident.
- **Usability above all else.** Our products must be easy to use and slot into the everyday life of the people who use them. If it's hard to use, it doesn't matter how well it's built.
- **Boldness over timidity.** We are not afraid of making large changes if they serve optimal usability. Refactoring, rearchitecting, or scrapping something that isn't working. All fair game when the outcome is better.
- **Honest and opinionated.** We say what we think. We challenge each other when something doesn't align with these beliefs. But the human always has the last word.

---

## Session Protocol

### Starting a session
1. Read `how-we-build.md` (this file) for universal rules
2. Read the project's `CLAUDE.md` for project-specific context, architecture, and conventions
3. Check the project roadmap or task list for the current objective
4. Confirm with the human what we're working on. Never assume.
5. Read any relevant existing code before writing new code

### During a session
- **One task at a time.** Don't start the next task, pre-build future features, or scaffold things "while we're here"
- **Stop at the done condition.** When it's met, report and wait
- **Flag uncertainty immediately.** If making an assumption, taking a shortcut, or choosing between valid approaches, say so before moving on
- **Ask before building big.** If a task turns out larger than expected, pause and propose how to break it down

### Ending a session
Always provide:
1. **What was built** - brief summary
2. **What to test** - specific steps, commands, clicks, or inputs to verify it works
3. **Automated check results** - confirm `npm run check` passes (see Quality Gates below)
4. **Uncertainties** - trade-offs made, shortcuts taken, things not confident about
5. **Impact on next steps** - dependencies created, anything that affects upcoming work

Then wait. Do not proceed until the human confirms it works.

### Testing is a gate
- `npm run check` must pass before ending any session (type check + lint + unit tests)
- Human tests after every task (manual verification of behaviour)
- Issues get fixed before moving on
- "Looks good" or "move on" is the green light. Nothing else.

---

## TypeScript Rules

### Strict mode, always
Every `tsconfig.json` uses `"strict": true`. No exceptions. This enables all strict type-checking options including `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, and `noUncheckedIndexedAccess`.

### No `any`
Never use `any`. If you don't know the type, figure it out. If it's genuinely dynamic data (e.g. a raw API response before validation), use `unknown` and narrow it with type guards. `any` defeats the entire point of TypeScript and silently hides bugs.

The one exception: third-party library types that are genuinely broken. In that case, use a `// @ts-expect-error` comment with a reason, not a blanket `any`.

### Type external boundaries
Every point where data enters the system gets a type definition and validation:
- API responses from external services
- Database query results
- Incoming webhook or HTTP payloads
- Third-party SDK return values

This is where bugs actually live. Internal code that passes typed data between typed functions rarely breaks. It's the boundaries where untyped external data enters your system.

### Shared types
If a project has multiple modules or functions that share data shapes, define shared types in a central location (e.g. `shared/types.ts` or `packages/shared/types.ts`). Each module's own types live in its own `types.ts`. See the project's `CLAUDE.md` for the specific structure.

### Return types on exported functions
Always explicitly declare return types on exported functions. This catches accidental return shape changes and makes the code self-documenting:

```typescript
// Good: return type is explicit, compiler catches mistakes
export async function fetchDailyRevenue(date: string): Promise<DailyRevenueSummary[]> {

// Bad: return type is inferred, could silently change
export async function fetchDailyRevenue(date: string) {
```

Internal helper functions can use inference. Exported functions and module boundaries cannot.

### tsconfig.json (base config)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

Individual projects may extend or adjust this. Check the project's `CLAUDE.md` for any overrides.

---

## Quality Gates

Three automated checks run before every deploy and at the end of every session.

### Type check
```bash
npx tsc --noEmit
```
Catches type errors without producing output files. If this fails, there are bugs. Fix them.

### Lint
```bash
npx eslint . --ext .ts
```
ESLint with `@typescript-eslint/recommended` rules. Catches common mistakes, unused variables, and enforces consistent patterns. Prettier handles formatting so there's no debate about style.

### Unit tests
```bash
npx vitest run
```
Vitest for unit tests. Fast, TypeScript-native, zero config. Not everything needs a test. But the following always do:

**Always test:**
- Data transformation logic (parsing API responses, calculating derived values, formatting outputs)
- Financial calculations (pricing, commissions, revenue. Money is not something you get wrong silently.)
- Deduplication and filtering logic
- Anything that runs unattended (scheduled functions, daily pipelines, automated emails)
- Logic with edge cases (null handling, empty arrays, date boundaries)

**Don't bother testing:**
- Simple CRUD wrappers (if it's just passing data to a database, the types are enough)
- Message or UI formatting (test it visually)
- Glue code that just calls other tested functions in sequence

### Combined check command
In every project's `package.json`:
```json
{
  "scripts": {
    "build": "tsc",
    "check": "tsc --noEmit && eslint . --ext .ts && vitest run",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`npm run check` is the single command. It must pass before any deploy and at the end of every build session.

### Pre-deploy rule
**Never deploy without `npm run check` passing.** The deploy script should run check first so you can't deploy broken code. No exceptions, no `--force`, no "I'll fix it after."

---

## Error Handling

### Philosophy
Don't add error handling for scenarios that can't happen. Do handle every scenario that can. External API calls always fail eventually. Scheduled jobs run when nobody's watching. Be explicit about what happens when things go wrong.

### External API calls
Wrap all external calls. Never let an unhandled API failure crash the function silently:

```typescript
async function callExternalAPI<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${name}] API call failed: ${message}`);
    throw new Error(`${name} failed: ${message}`);
  }
}
```

### Scheduled functions
For anything that runs unattended on a schedule:
- Log the start and end of every run with a timestamp
- Log counts (records processed, records inserted, records skipped)
- If a run fails partially, log what succeeded and what didn't. Stale data is better than wrong data.
- Never silently swallow errors. If something fails, it should be visible in logs.

### Database errors
Always check the response from any database operation and surface the error. Don't assume writes succeed.

### Retries
External APIs get 3 attempts with exponential backoff (1s, 2s, 4s). If all three fail, log the error and move on. Don't retry database writes (could cause duplicates). Don't retry AI API calls for generated content (fall back to a simpler output instead).

---

## Cloud Functions (Google Cloud)

Default conventions for Cloud Functions. Individual projects may override these in their `CLAUDE.md`.

- Language: TypeScript (strict mode)
- Runtime: Node.js 20
- Build before deploy. Compiled JS goes to `dist/`, deploy points to `dist/`.
- Region and project are defined in the project's `CLAUDE.md`, not here.

General deploy pattern:
```bash
npm run check && npm run build
gcloud functions deploy <functionName> \
  --runtime=nodejs20 \
  --trigger-http \
  --source=./dist \
  --entry-point=<functionName> \
  --region=<PROJECT_REGION> \
  --project=<GCP_PROJECT_ID> \
  --memory=512Mi
```

Check the project's `CLAUDE.md` for the actual region, project ID, and any additional deploy flags.

---

## Dependencies

- Keep deps minimal. Question every `npm install`.
- Prefer built-in Node.js APIs over libraries (e.g. `fetch` over `axios`, `crypto` over hashing libraries)
- Pin major versions in `package.json` to avoid surprise breaking changes
- `devDependencies` for TypeScript, ESLint, Vitest, Prettier. These don't ship to production.

---

## Project Setup Checklist (new modules/apps)

When creating a new module or app within a project:

1. `package.json` with `build`, `check`, `test`, `deploy` scripts
2. `tsconfig.json` using the base config above (adjust if the project requires it)
3. `.eslintrc.json` with `@typescript-eslint/recommended`
4. `types.ts` for module-specific type definitions
5. Entry point as `index.ts`
6. Verify `npm run check` passes before first commit

---

## What This Doc Does NOT Cover

The following are project-specific and belong in each project's `CLAUDE.md`:

- Architecture decisions and patterns (database choice, UI approach, deployment region)
- Integration details (API credentials, endpoint URLs, third-party service configs)
- Database schemas and access patterns
- Decision log
- Protected tables, columns, or resources
- Deploy commands with actual project IDs and regions
- Project roadmap and task breakdown
