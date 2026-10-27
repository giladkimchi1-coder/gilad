import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

// Target of the magic link e-mail: turns the code / token into a session cookie.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const sb = await supabaseServer();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await sb.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };
  const dest = url.clone();
  dest.search = "";
  dest.pathname = error ? "/login" : "/";
  if (error) dest.searchParams.set("e", "link");
  return NextResponse.redirect(dest);
}
