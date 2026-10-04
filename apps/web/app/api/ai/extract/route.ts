import { NextResponse } from "next/server";
import { AI_LIMITS, EXTRACT_SYSTEM_PROMPT } from "@mohar/core";
import { groqJson } from "@/lib/groq";

export const runtime = "nodejs";

/** Read typed/OCR text or a scanned image of paper certificates. The result is a DRAFT: a human confirms every row. */
export async function POST(req: Request) {
  let body: { text?: unknown; image?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: {text} or {image}" }, { status: 400 });
  }
  const { text, image } = body;
  if (typeof image === "string") {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image) || image.length > AI_LIMITS.maxImageBytes * 1.4)
      return NextResponse.json({ error: "Upload a PNG, JPEG or WebP image under 4 MB." }, { status: 400 });
    const r = await groqJson(
      [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: [{ type: "text", text: "List the certificates printed in this scan." }, { type: "image_url", image_url: { url: image } }] },
      ],
      process.env.GROQ_VISION_MODEL ?? "qwen/qwen3.8-27b",
    );
    return r.ok ? NextResponse.json({ draft: r.text }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  if (typeof text !== "string" || text.trim().length < 10 || text.length > AI_LIMITS.maxInputChars)
    return NextResponse.json({ error: `Paste between 10 and ${AI_LIMITS.maxInputChars} characters, or upload an image.` }, { status: 400 });
  const r = await groqJson(
    [
      { role: "system", content: EXTRACT_SYSTEM_PROMPT },
      { role: "user", content: `Certificate text:\n"""\n${text}\n"""` },
    ],
    process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-120b",
  );
  return r.ok ? NextResponse.json({ draft: r.text }) : NextResponse.json({ error: r.error }, { status: r.status });
}
