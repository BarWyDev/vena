import { z } from 'zod';

export const Severity = z.enum(['info', 'warning', 'error']);
export type Severity = z.infer<typeof Severity>;

export const ReviewFinding = z.object({
  severity: Severity,
  file: z.string().describe('Path of the file the finding refers to.'),
  line: z
    .string()
    .nullable()
    .describe('1-based line number as a string (e.g. "42"), or null if not line-specific.'),
  message: z.string().describe('Concise description of the problem.'),
  suggestion: z.string().describe('Concrete fix or improvement.'),
});
export type ReviewFinding = z.infer<typeof ReviewFinding>;

export const ReviewResult = z.object({
  summary: z.string().describe('One-paragraph overview of the change.'),
  findings: z.array(ReviewFinding),
});
export type ReviewResult = z.infer<typeof ReviewResult>;
