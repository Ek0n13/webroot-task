# Article Intelligence

A TypeScript application for turning submitted news articles into structured briefings and comparing pairs of articles using Gemini through OpenRouter. AI work runs asynchronously in a pg-boss worker, not inside a TanStack Start HTTP request.

The web workspace accepts pasted article text, follows queued work through completion, and presents either an editorial briefing or a direct comparison of two sources. Individual analyses have searchable saved history; comparisons use only temporary pg-boss job payloads and outputs.

## Workspace Layout

```text
apps/web       TanStack Start, React workspace, server functions, Query integration
apps/worker    pg-boss consumer, editorial prompts, Vercel AI SDK and OpenRouter
packages/db    PostgreSQL pool, migrations, queue configuration, analysis persistence
packages/schemas  Framework-independent Zod input/output contracts
```

The web app does not depend on the worker or AI SDK. Shared packages export TypeScript source, consumed by Vite and the worker's `tsx` runtime. The worker's build command type-checks its source rather than producing a separate bundle.

Within `apps/web/src/features/article-analysis`, `client/` contains React components and Query configuration, while `server/` contains the typed server functions and database-facing implementation. Client code reaches the server only through the generated server-function RPC stubs.

## Requirements

- Node.js 24 LTS (`.nvmrc` is included)
- pnpm 11 (the exact version is pinned in `package.json`)
- Docker with Docker Compose
- An OpenRouter API key with access to `google/gemini-3.8-flash`

## Local Setup

```bash
git clone <repository-url> article-intelligence
cd article-intelligence
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
```

Create a root environment file if you do not already have one:

```bash
cp .env.example .env.local
```

Set `OPENROUTER_API_KEY` to your real key and configure all required values from `.env.example`. Existing root `.env` files are also supported; `.env.local` takes precedence. Do not overwrite an existing file containing your credentials. Neither file is tracked by Git. `.env.example` is a template only, never loaded as runtime configuration.

Start PostgreSQL, apply migrations, then start both apps:

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

The web app runs at [http://localhost:3000](http://localhost:3000). The worker runs as a separate process. Submissions can be queued while the worker is offline; they are processed once it starts.

PostgreSQL 17 is provided by `compose.yaml`, bound to `127.0.0.1:5432`, with a health check and named volume. The example database credentials are **local-development only**. `pnpm db:down` stops the container without deleting the volume. Do not use `docker compose down -v` unless you intend to delete local database data.

## Commands

| Command             | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm dev`          | Start web and worker concurrently                                    |
| `pnpm dev:web`      | Start only the web app                                               |
| `pnpm dev:worker`   | Start only the worker in watch mode                                  |
| `pnpm worker:start` | Run the worker without watch mode                                    |
| `pnpm db:up`        | Start Compose PostgreSQL and wait for readiness                      |
| `pnpm db:migrate`   | Apply versioned application migrations and initialize/update pg-boss |
| `pnpm db:down`      | Stop Compose services, preserving data                               |
| `pnpm build`        | Build the web app and type-check the worker                          |
| `pnpm preview`      | Preview the built web app                                            |
| `pnpm typecheck`    | Check every workspace package                                        |
| `pnpm lint`         | Run ESLint                                                           |
| `pnpm check`        | Check formatting                                                     |
| `pnpm format`       | Apply formatting and lint fixes                                      |

## Configuration

| Variable             | Consumer                | Configuration                                                 |
| -------------------- | ----------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`       | Web, worker, migrations | Required PostgreSQL URL; no local-database fallback           |
| `OPENROUTER_API_KEY` | Worker only             | Required; documented placeholder is rejected                  |
| `OPENROUTER_MODEL`   | Worker only             | Required model ID; the example uses `google/gemini-3.8-flash` |
| `WORKER_CONCURRENCY` | Worker only             | Required integer `1`-`8`; the example uses `2`                |

Environment files are loaded once at process startup, not inside database or LLM functions:

- Worker and migration scripts use Node 24's native `--env-file-if-exists=../../.env --env-file-if-exists=../../.env.local` flags through `tsx`. Existing process variables take precedence, followed by `.env.local`, then `.env`.
- The web app uses Vite's `loadEnv` with the repository root as `envDir`. Vite also supports its normal mode-specific files. Only `DATABASE_URL` is copied into the web server environment; no OpenRouter settings are exposed through `import.meta.env`.
- Library functions read `process.env`. They do not read files or supply hidden deployment defaults. Missing required values fail validation instead of silently selecting a different model or database.
- Restart the affected process after changing its environment file. Built deployments must receive their environment at runtime; `.env` files are not bundled into the application.

Production environments should inject these variables through their secret manager. Only the worker needs the OpenRouter key. No Vercel gateway key is required. Runtime processes do not run migrations automatically: run `pnpm db:migrate` before deploying new code.

## Asynchronous API

The typed functions are in `apps/web/src/features/article-analysis/server/article-analysis.functions.ts`:

```ts
import {
  submitArticleAnalysis,
  getArticleAnalysisStatus,
} from './server/article-analysis.functions'

const requestId = crypto.randomUUID()
const submission = await submitArticleAnalysis({
  data: { article: articleText, requestId },
})

if (submission.ok) {
  const status = await getArticleAnalysisStatus({
    data: { analysisId: submission.analysisId },
  })
}
```

Reuse the same `requestId` if a submission's response is lost; repeated submissions with that ID enqueue only once, while changing the article requires a new request ID. Poll status approximately every two seconds, stopping on `completed`, `failed`, or `NOT_FOUND`. Back off on `STATUS_UNAVAILABLE`. Input validation and RPC failures can still reject the function call and must be caught separately.

`getRecentArticleAnalyses()` lists the latest 50 unexpired analyses, newest first. It returns short source previews, status, submission time, and editorial category, not full article text or briefings. Database failures return a sanitized `HISTORY_UNAVAILABLE` error. Active jobs use the same crash reconciliation as individual status reads.

Article comparison follows the same submit-and-poll browser flow through `apps/web/src/features/article-comparison/server/article-comparison.functions.ts`. The request UUID is also its pg-boss job ID. Both articles are stored in the queue payload, and the worker's validated return value is stored as the job output. There is no comparison application table, database migration, or comparison history. Queue retention removes the temporary input and result after one day.

## Web Workspace

- **TanStack Query v5** manages submission mutations, saved-history reads, and status polling around the typed server functions. Its official Router SSR integration creates a QueryClient per request/browser lifecycle, provides it app-wide through router context, and handles dehydration, hydration, and streaming without a server-global cache. The index loader preloads history before the workspace renders.
- **TanStack Table v9** displays database-backed history with text filtering, sortable columns, and five-row pagination. Filtering and pagination run locally over the latest 50 records; this is deliberately not an unbounded database browser.
- **Navigation:** a single `/` workspace keeps the source, briefing, and history together. The index loader seeds the Query cache, and selecting a briefing prefetches its status before mounting the status view. Deep links and browser Back/Forward between selections are deferred.
- Paste 100-50,000 trimmed characters. The form uses the shared Zod schema, shows word/character counts, and keeps the source visible while analysis runs. There is no file upload or URL extraction.
- Pending analyses refresh every two seconds. Terminal results and missing IDs stop interval polling; transient read failures back off up to 30 seconds. History refreshes every two seconds while it contains active jobs, otherwise every 30 seconds. Background tabs pause interval polling and reconnect/focus refreshes reads.
- The comparison workspace accepts two independently validated articles and polls a temporary pg-boss job every two seconds. Its result separates similarities and differences, shows each article's position for every point, and concludes with source limitations and model metadata.
- Submissions never retry automatically. An uncertain submission locks its source text and preserves the exact request ID for an explicit safe retry. Starting a new submission is a separate user action and may incur another provider charge. Pending request IDs and draft text are in-memory only: after a reload, consult database-backed history before submitting again.
- Briefings display summaries, developments, entities, topics, verification priorities and attribution, editorial follow-ups, confidence, caveats, and model metadata. Empty sections explain absent information. Claims are explicitly unverified, and confidence measures source fidelity rather than truth.
- The responsive layout uses local system fonts, semantic sections, explicit form labels, keyboard-operable table controls, visible focus states, a skip link, live error/progress messages, and reduced-motion styles. On small screens panels stack and only the table scrolls horizontally.

## Queue And Persistence

The **web app enqueues**. The **worker handles**. pg-boss connects the two through PostgreSQL:

```text
Web app: submitAnalysis() -> boss.send() -> PostgreSQL queue
                                              |
Worker: boss.work() -> handleAnalysisJob() <----+
                          |
                  load article -> analyze -> save result -> return
```

Read these three places in order:

1. `packages/db/src/index.ts`, `submitAnalysis`: saves the article and calls `boss.send` in the same transaction. This inserts a queue row; it does not run the LLM.
2. `apps/worker/src/index.ts`, `main`: opens the connection and calls `boss.work` once to register a callback. pg-boss polls PostgreSQL and calls that callback for each available job.
3. `apps/worker/src/index.ts`, `handleAnalysisJob`: loads the article, calls `analyzeArticle`, and saves the result. Returning completes the queue job; throwing fails it. pg-boss handles the acknowledgement.

`WORKER_CONCURRENCY=2` means up to two callbacks can await OpenRouter at the same time in **one Node process**. No child processes or threads are spawned per job. There are no custom polling loops, lease tokens, queue-table SQL, or manual acknowledgements.

The public analysis states are `queued`, `processing`, `completed`, and `failed`. A provider error is saved as a failed analysis, even though its queue job completes normally: the handler successfully recorded the outcome. A process crash or unexpected handler error fails the queue job, which status polling translates into a safe application error.

Queue payloads contain only the analysis ID. Articles and results are retained for seven days, become inaccessible at expiry, and are deleted at worker startup and hourly while a worker is running. Queue history is retained separately for one day. If no worker is running, cleanup waits until one starts.

Comparison is deliberately different: its queue payload contains both articles and its completion output contains the result. The web server reads that output by job ID and validates it against the shared schema before returning it to the browser. pg-boss removes both after its one-day retention window, so comparisons cannot be revisited through application history.

Queue retries are disabled (`retryLimit: 0`). This intentionally trades automatic recovery for simpler behavior and avoids overlapping paid attempts after a timeout or worker crash. Only queued article records can start, and terminal results cannot be overwritten. To rerun a failed analysis, submit it with a **new** request ID; do not manually retry the old pg-boss job. Resubmission may be billable even if the previous worker crashed before saving a completed LLM response.

When upgrading an existing database, stop running workers, run `pnpm db:migrate`, then restart them. The migrations retain existing articles/results while bringing the analysis table and queued-job settings up to date.

## Analysis And Reliability

The worker first classifies the article, then selects static editorial guidance for its type (politics, health, science, sports, opinion, etc.). The briefing contains a summary, developments, entities, topics, checkable claims, editorial assessment, confidence, and caveats. Prompts require source grounding and careful attribution; article text is treated as untrusted content.

Comparisons skip classification. They use exactly one structured `generateText` call with SDK retries disabled, producing material similarities, differences, a conclusion, and caveats grounded only in the two supplied articles.

Both stages use Vercel AI SDK `generateText` with `Output.object` and the standard OpenRouter provider. Strict JSON Schema output and a normal completion reason are required. Schema validation checks shape, not factual truth; editorial review is still necessary.

- Malformed classification falls back to the general editorial lens.
- Invalid or truncated briefing output gets one correction attempt within the job.
- SDK, client transport, and queue retries are disabled. Provider failures are shown to the user rather than automatically repeating a paid call.
- The one malformed-output correction above still happens within the same analysis attempt.
- Worker shutdown uses `boss.stop` to stop polling and wait up to 100 seconds for running callbacks. Abrupt termination is reported through pg-boss expiration; the user can resubmit.
- Safe error codes are persisted for configuration, invalid output, and general provider failures. Article text, credentials, and raw SDK/SQL errors are not logged or placed in queue output.

## Error Handling

The worker uses `@maxmorozoff/try-catch-tuple` at explicit boundaries. Capture `[data, error]` with `tryCatch.async`, check the error rather than the data, and run cleanup before propagating failures.

The worker runtime is one file: `index.ts`. Its job handler only claims and loads the article, calls `analyzeArticle`, and saves the result. `analyzeArticle` contains the OpenRouter setup, direct AI SDK calls, retry rule, and safe provider-error mapping. Database and payload failures throw a sanitized error to pg-boss. `article-analysis.prompts.ts` is the only supporting runtime file and contains only prompts.

There is no custom AI SDK client, adapter, completion protocol, or error utility. The web and database packages use the same tuple pattern.

## Gemini Capabilities

OpenRouter's [model catalog](https://openrouter.ai/api/v1/models) and [Gemini 3.8 Flash endpoints](https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints), checked on September 5, 2026, list text, image, file, audio, and video inputs, text output, JSON Schema support, a 1,048,576-token context, and a maximum 65,536-token output. The application currently accepts **pasted text only**, not media uploads.

Reasoning is mandatory for this model. Requests use low effort and omit reasoning text from returned content; classification and briefing budgets are 4,096 and 8,192 tokens, including reasoning. Alternative models must support these settings and structured outputs.

## Scope And Deployment

The monorepo and PostgreSQL queue add setup and operational work beyond the original take-home baseline. They provide durable work independent of HTTP lifetimes and a clear separation between the web process and LLM execution. The worker must run in a long-lived Node process, not a short-lived serverless request. Deploy the web and worker independently against the same PostgreSQL database, with compatible schema versions.

Before public deployment, add authenticated accounts where appropriate, edge rate limits, global spending/concurrency controls, database backups, and an OpenRouter key spending cap. The current take-home implementation intentionally has no access control, so submitted articles and results must not be treated as private. Worker concurrency is per process, not a global fleet limit. Richer observability and a production deployment adapter remain follow-up work. History is intentionally capped at 50 rows; a larger archive should use server-side pagination and batch status reconciliation rather than per-active-row lookups.

## AI-Assisted Development

OpenCode was used for framework/API research, scaffolding, backend implementation, JSDoc comments, and the workspace/queue migration. The initial generated backend ran inside an HTTP request; that design was rejected during review because long, billable analysis should outlive the browser connection. It was replaced with transactional submission and a separately deployed worker. The queue migration also removed nested transport retries to avoid multiplying paid attempts.

OpenCode also implemented the React workspace, Query integration, database-backed Table history, and responsive styling. An initially generated Table implementation used v8 APIs and was updated to v9's explicit features and reactive `useTable` API instead of downgrading the dependency.

The original exercise remains unchanged in `task01.md`; personal implementation notes remain in `decisions.md`.

The custom queue polling and fenced acknowledgements were subsequently rejected as too complicated for this project. They were replaced with pg-boss's standard `work` callback and no automatic job retries, making the execution flow easier to read and avoiding overlapping paid attempts.
