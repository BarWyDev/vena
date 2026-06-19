import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createReviewer, Criterion } from '../../../packages/code-review/src/index.js';
import type { ReviewFinding } from '../../../packages/code-review/src/index.js';

const CRITERIA: Array<{ key: Criterion; label: string }> = [
  { key: 'security', label: 'Security & Auth' },
  { key: 'correctness', label: 'Correctness & Edge Cases' },
  { key: 'typescript', label: 'TypeScript & Type Safety' },
  { key: 'conventions', label: 'Project Convention Compliance' },
  { key: 'cloudflare', label: 'Cloudflare Workers Compat.' },
];

function criterionStatus(findings: ReviewFinding[], key: Criterion): string {
  const matching = findings.filter(f => f.criterion === key);
  if (matching.some(f => f.severity === 'error')) return '❌';
  if (matching.some(f => f.severity === 'warning')) return '⚠️';
  return '✅';
}

function buildComment(
  passed: boolean,
  summary: string,
  findings: ReviewFinding[],
  prTitle: string,
): string {
  const badge = passed ? '✅ AI Code Review — Passed' : '❌ AI Code Review — Failed';
  const titleLine = prTitle ? `**PR:** ${prTitle}\n\n` : '';

  const criteriaRows = CRITERIA.map(
    ({ key, label }) => `| ${label.padEnd(30)} | ${criterionStatus(findings, key)} |`,
  ).join('\n');

  const criteriaTable =
    `### Criteria\n\n` +
    `| Criterion                      | Status |\n` +
    `|--------------------------------|--------|\n` +
    criteriaRows;

  let findingsBlock: string;
  if (findings.length === 0) {
    findingsBlock = '_No findings._';
  } else {
    const rows = findings
      .map(f => {
        const loc = f.line ? `${f.file}:${f.line}` : f.file;
        return `- **[${f.severity}]** \`${loc}\` — ${f.message}\n  > ${f.suggestion}`;
      })
      .join('\n');
    findingsBlock = `<details>\n<summary>Findings (${findings.length})</summary>\n\n${rows}\n</details>`;
  }

  return `## ${badge}\n\n${titleLine}${summary}\n\n${criteriaTable}\n\n${findingsBlock}\n`;
}

async function main() {
  const diff = readFileSync('/tmp/pr.diff', 'utf8');
  const rootDir = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const prTitle = process.env.PR_TITLE ?? '';

  const reviewer = createReviewer({ rootDir });
  const result = await reviewer.review(diff, prTitle || undefined);

  const passed = !result.findings.some(f => f.severity === 'error');
  const label = passed ? 'ai-cr:passed' : 'ai-cr:failed';

  const comment = buildComment(passed, result.summary, result.findings, prTitle);
  writeFileSync('/tmp/review-comment.md', comment);
  writeFileSync('/tmp/review-result.json', JSON.stringify({ passed, label, ...result }));

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `passed=${passed}\n`);
    appendFileSync(outputFile, `label=${label}\n`);
  }

  console.log(`Review complete. passed=${passed} label=${label}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
