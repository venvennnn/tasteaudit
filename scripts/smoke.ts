import { GoogleGenAI } from "@google/genai";

function configured(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

async function main() {
  const qlooKey = configured("QLOO_API_KEY");
  const qlooBase = configured("QLOO_BASE_URL") ?? "https://hackathon.api.qloo.com";
  const geminiKey = configured("GEMINI_API_KEY");
  const model = configured("GEMINI_MODEL") ?? "gemini-3.8-flash";
  if (!qlooKey || !geminiKey) {
    console.log("Live provider checks skipped: QLOO_API_KEY or GEMINI_API_KEY is not set.");
    if (process.env.SMOKE_REQUIRED === "1") process.exit(2);
    return;
  }
  const base = new URL(qlooBase);
  const search = new URL("/search", base.origin);
  search.searchParams.set("query", "Spirited Away");
  search.searchParams.set("types", "urn:entity:movie");
  search.searchParams.set("page", "1");
  search.searchParams.set("take", "1");
  const qloo = await fetch(search, { headers: { Accept: "application/json", "X-Api-Key": qlooKey } });
  console.log(`Qloo /search status ${qloo.status} host ${base.host}`);
  if (!qloo.ok && qloo.status !== 404) process.exit(1);

  const client = new GoogleGenAI({ apiKey: geminiKey });
  const response = await client.models.generateContent({
    model,
    contents: "Reply with the JSON object {\"ok\":true}.",
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
    },
  });
  const reported = response.modelVersion ?? model;
  if (reported !== model && !reported.startsWith(model)) {
    console.log("Gemini returned a different model than GEMINI_MODEL.");
    process.exit(1);
  }
  console.log(`Gemini structured output status ok model ${reported}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Smoke check failed.";
  console.log(message.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[redacted]"));
  process.exit(1);
});
