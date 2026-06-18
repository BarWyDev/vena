import { createReviewer } from './agent.js';

const sampleDiff = `--- a/src/sum.ts
+++ b/src/sum.ts
@@
-export function sum(a: number, b: number) {
-  return a - b;
+export function sum(a: number, b: number): number {
+  return a + b;
}`;

async function main() {
  const reviewer = createReviewer();
  const result = await reviewer.review(sampleDiff);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
