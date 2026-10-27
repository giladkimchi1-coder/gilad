// Shared helpers for scripts: env loading and a direct Postgres connection (pooler, session mode).
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

export const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`חסר ${k} בקובץ .env.local`);
  return v;
};

export const projectRef = () => new URL(env("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];

export async function connect() {
  const client = new pg.Client({
    host: env("SUPABASE_DB_HOST"),
    port: 5432,
    user: `postgres.${projectRef()}`,
    password: env("SUPABASE_DB_PASSWORD"),
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}
