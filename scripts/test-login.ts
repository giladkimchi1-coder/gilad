// Local testing only: creates (or reuses) a test user with the given role and prints a
// one-time login URL for http://localhost:3000. Remove the user with --delete.
//   npx tsx scripts/test-login.ts admin|accounting|foreman|procurement
//   npx tsx scripts/test-login.ts --delete
import { createClient } from "@supabase/supabase-js";
import { connect, env } from "./db";

const EMAIL = "tester@binenfeld.test";
const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });

async function main() {
  const arg = process.argv[2] || "admin";
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  let user = users.users.find((u) => u.email === EMAIL);
  if (arg === "--delete") {
    if (user) await sb.auth.admin.deleteUser(user.id);
    console.log(user ? "משתמש הבדיקה נמחק" : "אין משתמש בדיקה");
    return;
  }
  if (!user) user = (await sb.auth.admin.createUser({ email: EMAIL, email_confirm: true })).data.user!;
  const db = await connect();
  await db.query("update app.profiles set role = $1, name = 'בודק' where user_id = $2", [arg, user.id]);
  await db.end();
  const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (error) throw error;
  console.log(`http://localhost:3000/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
