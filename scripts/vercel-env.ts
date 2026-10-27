// Copies the keys the deployed app needs from .env.local to the Vercel project (production),
// without printing them. Re-runnable: replaces existing values.
//   npx tsx scripts/vercel-env.ts
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "ANTHROPIC_API_KEY"];
const vercel = (args: string[], input?: string) =>
  spawnSync("npx", ["--yes", "vercel@latest", ...args], { input, encoding: "utf8", shell: true });

for (const k of KEYS) {
  const v = process.env[k];
  if (!v) { console.log(`${k}: חסר ב-.env.local, דילגתי`); continue; }
  vercel(["env", "rm", k, "production", "--yes"]);
  const r = vercel(["env", "add", k, "production"], v);
  console.log(`${k}: ${r.status === 0 ? "✓" : "נכשל – " + (r.stderr || "").split("\n").filter(Boolean).pop()}`);
}
