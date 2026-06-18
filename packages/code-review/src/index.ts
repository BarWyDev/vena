import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, Output } from 'ai';
import { z } from 'zod';

/**
 * Entry point for the AI-powered code-review tooling.
 *
 * Wires the Vercel AI SDK (`ai`) to OpenRouter and exposes a small,
 * Zod-validated structured-review primitive that the rest of the package
 * can build on. Run directly with `npm start` / `tsx src/index.ts`.
 */

/** Default model — newest Claude Sonnet on OpenRouter. Override with `OPENROUTER_MODEL`. */
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

/**
 * Build a configured OpenRouter provider.
 *
 * The API key is read from the `OPENROUTER_API_KEY` environment variable by
 * default; pass one explicitly to override.
 */
export function createProvider(apiKey = process.env.OPENROUTER_API_KEY) {
  if (!apiKey) {
    throw new Error(
      'Missing OpenRouter API key. Set OPENROUTER_API_KEY or pass it to createProvider().',
    );
  }
  return createOpenRouter({ apiKey });
}

/** Severity buckets for a single review finding. */
export const Severity = z.enum(['info', 'warning', 'error']);
export type Severity = z.infer<typeof Severity>;

/** A single issue surfaced by the reviewer. */
export const ReviewFinding = z.object({
  severity: Severity,
  file: z.string().describe('Path of the file the finding refers to.'),
  line: z.string().nullable().describe('1-based line number as a string (e.g. "42"), or null if not line-specific.'),
  message: z.string().describe('Concise description of the problem.'),
  suggestion: z.string().describe('Concrete fix or improvement.'),
});
export type ReviewFinding = z.infer<typeof ReviewFinding>;

/** The full structured review the model is asked to produce. */
export const ReviewResult = z.object({
  summary: z.string().describe('One-paragraph overview of the change.'),
  findings: z.array(ReviewFinding),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export interface ReviewOptions {
  /** Diff or code to review. */
  diff: string;
  /** OpenRouter model id. Defaults to `OPENROUTER_MODEL` env or the package default. */
  model?: string;
  /** Pre-built provider; created from env if omitted. */
  provider?: ReturnType<typeof createProvider>;
}

const SYSTEM_PROMPT =
  'You are a meticulous senior software engineer performing a code review. ' +
  'Report only substantive findings: correctness bugs, security issues, and clear ' +
  'simplifications. Be specific and reference files and lines.';

/**
 * Review a diff and return a typed, schema-validated result.
 */
export async function reviewCode({
  diff,
  model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
  provider = createProvider(),
}: ReviewOptions): Promise<ReviewResult> {
  const { output } = await generateText({
    model: provider(model),
    system: SYSTEM_PROMPT,
    prompt: `Review the following diff and report your findings:\n\n${diff}`,
    output: Output.object({ schema: ReviewResult }),
  });

  return output;
}

/** Demo entrypoint — runs only when this file is executed directly. */
async function main() {
  const sampleDiff = `--- a/src/sum.ts
+++ b/src/sum.ts
@@
-export function sum(a: number, b: number) {
-  return a - b;
+export function sum(a: number, b: number): number {
+  return a + b;
}`;

  const result = await reviewCode({ diff: sampleDiff });
  
  console.log(JSON.stringify(result, null, 2));
}


if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
