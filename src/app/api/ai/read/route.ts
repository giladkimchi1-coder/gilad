import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { currentRole } from "@/lib/supabase/server";

// Reads a photo / PDF of a delivery note, invoice or payroll invoice and returns the JSON
// the prompt asks for. The API key stays on the server; only signed-in members may call it.
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export async function GET() {
  return NextResponse.json({ images: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req: NextRequest) {
  const { me } = await currentRole();
  if (!me?.role) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "images_unavailable" }, { status: 503 });

  const form = await req.formData();
  const file = form.get("file");
  const prompt = String(form.get("prompt") || "");
  if (!(file instanceof File) || !prompt) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (file.size > 20 * 1048576) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const media: Anthropic.Beta.BetaContentBlockParam =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: (IMAGE_TYPES.includes(file.type as ImageType) ? file.type : "image/jpeg") as ImageType, data } };

  const client = new Anthropic();
  try {
    const params = {
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: "You extract data from Israeli construction-site documents (Hebrew). Reply with one JSON object only, no prose, no code fences.",
      messages: [{ role: "user", content: [media, { type: "text", text: prompt }] }],
    } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming;
    const res = await client.beta.messages.create(params);
    if (res.stop_reason === "refusal") return NextResponse.json({ error: "refused" }, { status: 422 });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return NextResponse.json({ data: JSON.parse(json) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "bad_key" }, { status: 503 });
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) return NextResponse.json({ error: "no_credit" }, { status: 402 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: "api_error", status: e.status }, { status: 502 });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "unreadable" }, { status: 422 });
    throw e;
  }
}
