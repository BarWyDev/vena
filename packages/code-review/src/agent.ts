import { Output, ToolLoopAgent, stepCountIs } from 'ai';
import { createProvider, DEFAULT_MODEL } from './provider.js';
import { REVIEW_INSTRUCTIONS, buildReviewPrompt } from './prompt.js';
import { ReviewResult } from './schema.js';
import { createReadFileTool } from './tools/read-file.js';

export interface ReviewerConfig {
  model?: string;
  provider?: ReturnType<typeof createProvider>;
  rootDir?: string;
  maxSteps?: number;
}

export function createReviewer(config?: ReviewerConfig) {
  const {
    model = DEFAULT_MODEL,
    provider = createProvider(),
    rootDir = process.cwd(),
    maxSteps = 10,
  } = config ?? {};

  const agent = new ToolLoopAgent({
    model: provider(model),
    instructions: REVIEW_INSTRUCTIONS,
    tools: { readFile: createReadFileTool({ rootDir }) },
    output: Output.object({ schema: ReviewResult }),
    stopWhen: stepCountIs(maxSteps),
  });

  // ToolLoopAgent.generate() starts a fresh multi-step loop per call; no
  // conversation history is carried between calls, so reusing the instance is safe.
  return {
    agent,
    async review(diff: string): Promise<ReviewResult> {
      const { output } = await agent.generate({ prompt: buildReviewPrompt(diff) });
      return ReviewResult.parse(output);
    },
  };
}
