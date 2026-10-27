// Loads the old app's export (data/ + assets/) into Supabase, keeping the old ids.
// Re-runnable: by default only adds what is missing and never touches existing records.
//   npm run db:import                -> add missing records and files
//   npm run db:import -- --overwrite -> also replace existing records with the export (cut-over)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { connect, env } from "./db";

const ROOT = process.cwd();
const DATA = join(ROOT, "data");
const ASSETS = join(ROOT, "assets");
const ADMIN_EMAIL = "giladkimchi1@gmail.com";
const OLD_ADMIN_IDS = ["u_gfYCx9oPWdk1FONX2xpbkQ"];
const overwrite = process.argv.includes("--overwrite");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".heic": "image/heic", ".pdf": "application/pdf",
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureAdmin(): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === ADMIN_EMAIL);
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await sb.auth.admin.createUser({ email: ADMIN_EMAIL, email_confirm: true });
  if (error) throw error;
  console.log("נוצר משתמש מנהל:", ADMIN_EMAIL);
  return data.user.id;
}

async function main() {
  const adminId = await ensureAdmin();
  const db = await connect();
  try {
    await db.query(
      `insert into app.profiles (user_id, email, name, role) values ($1, $2, 'גלעד', 'admin')
       on conflict (user_id) do update set role = 'admin'`,
      [adminId, ADMIN_EMAIL],
    );

    // ---- records ----
    let added = 0, replaced = 0, kept = 0;
    for (const file of walk(DATA).filter((f) => f.endsWith(".json"))) {
      const path = relative(DATA, file).split(sep).join("/").replace(/\.json$/, "");
      const cut = path.lastIndexOf("/");
      if (cut < 0) continue;
      let text = readFileSync(file, "utf8");
      for (const old of OLD_ADMIN_IDS) text = text.split(old).join(adminId);
      const data = JSON.parse(text);
      const r = await db.query(
        overwrite
          ? `insert into app.store (path, col, id, data) values ($1, $2, $3, $4)
             on conflict (path) do update set data = excluded.data, updated_at = now()
             returning (xmax = 0) as inserted`
          : `insert into app.store (path, col, id, data) values ($1, $2, $3, $4)
             on conflict (path) do nothing returning true as inserted`,
        [path, path.slice(0, cut), path.slice(cut + 1), data],
      );
      if (!r.rowCount) kept++;
      else if (r.rows[0].inserted) added++;
      else replaced++;
    }
    console.log(`רשומות: ${added} נוספו` + (replaced ? `, ${replaced} עודכנו` : "") + (kept ? `, ${kept} כבר היו ולא נגעתי בהן` : ""));
  } finally {
    await db.end();
  }

  // ---- files ----
  const existing = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from("files").list("", { limit: 1000, offset });
    if (error) throw error;
    data.forEach((o) => existing.add(o.name));
    if (data.length < 1000) break;
  }
  let up = 0, skip = 0;
  for (const file of walk(ASSETS)) {
    const ext = extname(file).toLowerCase();
    const id = relative(ASSETS, file).replace(/\.[^.]+$/, "");
    if (existing.has(id)) { skip++; continue; }
    const { error } = await sb.storage.from("files").upload(id, readFileSync(file), {
      contentType: MIME[ext] || "application/octet-stream",
      upsert: false,
    });
    if (error) throw new Error(`${id}: ${error.message}`);
    up++;
  }
  console.log(`קבצים: ${up} הועלו` + (skip ? `, ${skip} כבר היו` : ""));
}

main().catch((e) => {
  console.error("נכשל:", e.message || e);
  process.exit(1);
});
