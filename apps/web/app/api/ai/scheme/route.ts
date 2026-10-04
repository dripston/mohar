import { NextResponse } from "next/server";
import { AI_LIMITS, SCHEME_SYSTEM_PROMPT } from "@mohar/core";
import { groqJson } from "@/lib/groq";

export const runtime = "nodejs";

/** Draft a checklist from pasted scheme text. Receives only the officer's pasted text: no certificate or personal data. */
export async function POST(req: Request) {
  let text: unknown;
  try {
    text = (await req.json()).text;
  } catch {
    return NextResponse.json({ error: "Send JSON: {text}" }, { status: 400 });
  }
  if (typeof text !== "string" || text.trim().length < 10 || text.length > AI_LIMITS.maxInputChars)
    return NextResponse.json({ error: `Paste between 10 and ${AI_LIMITS.maxInputChars} characters of eligibility text.` }, { status: 400 });
  const r = await groqJson(
    [
      { role: "system", content: SCHEME_SYSTEM_PROMPT },
      { role: "user", content: `Eligibility text:\n"""\n${text}\n"""` },
    ],
    process.env.GROQ_TEXT_MODEL ?? "openai/gpt-oss-120b",
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ draft: r.text });
}
