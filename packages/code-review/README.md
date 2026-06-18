# @vena/code-review

AI-powered code-review tooling built on the [Vercel AI SDK](https://ai-sdk.dev)
(`ai` v6) with the [OpenRouter](https://openrouter.ai) provider and
[Zod](https://zod.dev) for structured, validated output.

The reviewer is a `ToolLoopAgent` with a confined `readFile` tool so it can
consult `CLAUDE.md`, `AGENTS.md`, and related source files before emitting a
Zod-validated `ReviewResult`.

## Setup

```bash
npm install                          # from packages/code-review
export OPENROUTER_API_KEY=sk-or-...  # https://openrouter.ai/keys
```

Optional: `OPENROUTER_MODEL` overrides the default model
(`anthropic/claude-haiku-4.5`).

## Run

```bash
npm start        # tsx src/demo.ts — runs the demo review
npm run dev      # watch mode
npm run typecheck
```

## Use as a library

```ts
import { createReviewer } from './src/index.ts';

const reviewer = createReviewer({ rootDir: '/path/to/repo' });
const result = await reviewer.review(diff);
console.log(result.summary, result.findings);
```

### `createReviewer(config?)`

| Option | Type | Default |
|--------|------|---------|
| `model` | `string` | `DEFAULT_MODEL` / `OPENROUTER_MODEL` env |
| `provider` | OpenRouter provider | `createProvider()` |
| `rootDir` | `string` | `process.cwd()` |
| `maxSteps` | `number` | `10` |

Returns `{ agent: ToolLoopAgent, review(diff: string): Promise<ReviewResult> }`.

### Exports

- `createReviewer(config?)` — factory (see above)
- `createProvider(apiKey?)` — configured OpenRouter provider
- `DEFAULT_MODEL` — default model id string
- `ReviewResult`, `ReviewFinding`, `Severity` — Zod schemas + inferred types
