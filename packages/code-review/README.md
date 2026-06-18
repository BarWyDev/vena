# @vena/code-review

AI-powered code-review tooling built on the [Vercel AI SDK](https://ai-sdk.dev)
(`ai` v6) with the [OpenRouter](https://openrouter.ai) provider and
[Zod](https://zod.dev) for structured, validated output.

## Setup

```bash
npm install                         # from packages/code-review
export OPENROUTER_API_KEY=sk-or-...  # https://openrouter.ai/keys
```

Optional: `OPENROUTER_MODEL` overrides the default model
(`anthropic/claude-sonnet-4.6`).

## Run

```bash
npm start        # tsx src/index.ts — runs the demo review
npm run dev      # watch mode
npm run typecheck
```

## Use as a library

`src/index.ts` is the entry point. It exposes:

- `createProvider(apiKey?)` — configured OpenRouter provider.
- `reviewCode({ diff, model?, provider? })` — returns a Zod-validated
  `ReviewResult` via `generateText` + `Output.object`.
- `ReviewResult`, `ReviewFinding`, `Severity` — Zod schemas + inferred types.

```ts
import { reviewCode } from './src/index.ts';

const result = await reviewCode({ diff: myDiff });
console.log(result.summary, result.findings);
```
