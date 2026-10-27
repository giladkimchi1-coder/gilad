import { NextResponse, type NextRequest } from "next/server";
import { currentRole, supabaseAdmin } from "@/lib/supabase/server";

// Serves an uploaded file (photo / PDF) by asset id after checking the user may see it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const { sb, me } = await currentRole();
  if (!me?.role) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data: ok } = await sb.rpc("can_read_asset", { p_id: id });
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const download = req.nextUrl.searchParams.get("download");
  const { data, error } = await supabaseAdmin().storage.from("files").createSignedUrl(id, 3600, download ? { download } : undefined);
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "private, max-age=3000");
  return res;
}
