// Applies supabase/migrations/*.sql in order. Every migration is written to be re-runnable.
// Usage: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./db";

const dir = join(process.cwd(), "supabase", "migrations");

const main = async () => {
  const db = await connect();
  try {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      process.stdout.write(`מריץ ${f}… `);
      await db.query(readFileSync(join(dir, f), "utf8"));
      console.log("✓");
    }
  } finally {
    await db.end();
  }
};

main().catch((e) => {
  console.error("\nנכשל:", e.message);
  process.exit(1);
});
