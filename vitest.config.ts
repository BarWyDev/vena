import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { getViteConfig } from "astro/config";

// Vitest runs in plain Node, so it never gets `.dev.vars` the way Cloudflare
// workerd does for `npm run dev`. Load it into `process.env` here, before
// `getViteConfig()` resolves the Astro config and `astro:env/server` evaluates
// `loadEnv()` — otherwise `createClient()` sees empty SUPABASE_URL/SUPABASE_KEY
// and silently returns `null`. CI sets these vars directly, so `.dev.vars`
// being absent there is expected and not an error.
try {
  const devVars = readFileSync(fileURLToPath(new URL("./.dev.vars", import.meta.url)), "utf-8");
  for (const line of devVars.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value;
  }
} catch {
  // No .dev.vars locally — CI provides SUPABASE_URL/SUPABASE_KEY via env directly.
}

export default getViteConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
