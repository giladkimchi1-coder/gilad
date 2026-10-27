import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Acts as the signed-in user (RLS and the store_* rules apply).
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: the middleware refreshes the session instead
        }
      },
    },
  });
}

// Full access, server only. Used for signed file URLs after the user's access was checked.
export const supabaseAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function currentRole() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("me");
  return { sb, me: data as { id: string; email: string; name: string | null; role: string | null } | null };
}
