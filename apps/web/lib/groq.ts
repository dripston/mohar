
/**
 * Server-side Groq call (OpenAI-compatible). The key lives only in the GROQ_API_KEY environment variable, never in the
 * browser bundle and never in the repo. The model only DRAFTS; the browser validates and a human confirms.
 */
export async function groqJson(messages: unknown[], model: string): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, status: 503, error: "AI drafting is not configured on this deployment (GROQ_API_KEY is not set)." };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 3000, response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { ok: false, status: 502, error: `AI provider returned HTTP ${res.status}.` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string") return { ok: false, status: 502, error: "AI provider returned no text." };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, status: 504, error: `AI provider unreachable: ${(e as Error).name}` };
  }
}
