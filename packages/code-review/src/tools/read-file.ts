import { tool } from 'ai';
import { readFile as fsReadFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { z } from 'zod';

export function createReadFileTool(opts: { rootDir: string }) {
  const root = resolve(opts.rootDir);

  return tool({
    description:
      'Read a project file relative to the repository root (e.g. CLAUDE.md, AGENTS.md, source files). ' +
      'Use this to verify project conventions and existing code patterns before drawing conclusions.',
    inputSchema: z.object({
      path: z.string().describe('Repo-relative path to read (e.g. "AGENTS.md", "src/lib/utils.ts")'),
    }),
    execute: async ({ path: requestedPath }) => {
      const target = resolve(root, requestedPath);
      if (target !== root && !target.startsWith(root + sep)) {
        return `Error: path "${requestedPath}" is outside the allowed root.`;
      }
      try {
        return await fsReadFile(target, 'utf8');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `Error: could not read "${requestedPath}": ${message}`;
      }
    },
  });
}
