import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export const DEFAULT_MODEL: string =
  process.env['OPENROUTER_MODEL'] ?? 'anthropic/claude-haiku-4.5';

export function createProvider(apiKey = process.env['OPENROUTER_API_KEY']) {
  if (!apiKey) {
    throw new Error(
      'Missing OpenRouter API key. Set OPENROUTER_API_KEY or pass it to createProvider().',
    );
  }
  return createOpenRouter({ apiKey });
}
