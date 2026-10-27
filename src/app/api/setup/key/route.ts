import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

// Local setup only: writes ANTHROPIC_API_KEY into .env.local. Disabled outside `npm run dev`
// and for any request that doesn't come from this computer.
export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (process.env.NODE_ENV !== "development" || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const { key } = await req.json().catch(() => ({ key: "" }));
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(key || ""))) {
    return NextResponse.json({ error: "זה לא נראה כמו מפתח של Anthropic. הוא צריך להתחיל ב-sk-ant-" }, { status: 400 });
  }
  const file = join(process.cwd(), ".env.local");
  const text = await readFile(file, "utf8");
  const line = `ANTHROPIC_API_KEY=${key}`;
  const next = /^ANTHROPIC_API_KEY=.*$/m.test(text) ? text.replace(/^ANTHROPIC_API_KEY=.*$/m, line) : `${text.trimEnd()}\n${line}\n`;
  await writeFile(file, next, "utf8");
  return NextResponse.json({ ok: true });
}
