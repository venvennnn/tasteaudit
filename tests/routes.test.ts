import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as search } from "@/app/api/qloo/search/route";
import { POST as score } from "@/app/api/qloo/score/route";
import { POST as repair } from "@/app/api/gemini/repair/route";
import { generateStructured } from "@/lib/providers/gemini";
import { resetInstanceCapacity } from "@/lib/http/route";
import { redactSecrets } from "@/lib/security/redact";
import { signEvidence, verifyEvidence } from "@/lib/security/sign";

vi.mock("@/lib/providers/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/providers/gemini")>("@/lib/providers/gemini");
  return {
    ...actual,
    generateStructured: vi.fn(async () => ({
      data: {
        selections: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", reason: "It fits the stated interests." }],
        answer: "I recommend the signed candidate.",
      },
      provenance: {
        provider: "gemini",
        model: "gemini-test",
        requestedModel: "gemini-test",
        systemPromptVersion: "test",
        temperature: 0.4,
        topP: 0.9,
        latencyMs: 1,
        usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        retrievedAt: new Date().toISOString(),
      },
    })),
  };
});

const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const seed = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function call(path: string, body: unknown, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      host: "localhost:3000",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetInstanceCapacity();
  process.env.QLOO_API_KEY = "server-key-should-not-leak";
  process.env.QLOO_BASE_URL = "https://hackathon.api.qloo.com";
  process.env.GEMINI_API_KEY = "gemini-key-should-not-leak";
  process.env.GEMINI_MODEL = "gemini-test";
  process.env.EVIDENCE_SIGNING_SECRET = "signing-secret-value";
  process.env.QLOO_TIMEOUT_MS = "12000";
  process.env.TASTEAUDIT_INSTANCE_RPM = "40";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider routes", () => {
  it("rejects a Qloo host other than the hackathon server", async () => {
    process.env.QLOO_BASE_URL = "https://api.qloo.com";
    const response = await search(call("/api/qloo/search", { name: "Dune", expectedTypes: ["urn:entity:book"] }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "not_configured" });
  });

  it("calls the hackathon host when QLOO_BASE_URL is unset", async () => {
    delete process.env.QLOO_BASE_URL;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(new URL(url).origin).toBe("https://hackathon.api.qloo.com");
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }),
    );
    const response = await search(call("/api/qloo/search", { name: "Dune", expectedTypes: ["urn:entity:book"] }));
    expect(response.status).toBe(200);
  });

  it("returns no-store and does not echo secrets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })));
    const response = await search(call("/api/qloo/search", { name: "Dune", expectedTypes: ["urn:entity:book"] }));
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text).not.toContain("server-key-should-not-leak");
    expect(text).not.toContain("gemini-key-should-not-leak");
  });

  it("rejects malformed JSON and cross-origin calls", async () => {
    const malformed = await search(call("/api/qloo/search", "{"));
    expect(malformed.status).toBe(400);
    const badOrigin = await search(call("/api/qloo/search", { name: "Dune", expectedTypes: ["urn:entity:book"] }, "https://evil.example"));
    expect(badOrigin.status).toBe(403);
    expect(await badOrigin.json()).toMatchObject({ code: "forbidden_origin", retryable: false });
  });

  it("does not retry authentication errors and does retry 429 and 500", async () => {
    const statuses = [401];
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: statuses[0] })));
    const denied = await search(call("/api/qloo/search", { name: "Dune", expectedTypes: ["urn:entity:book"] }));
    expect(denied.status).toBe(401);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(await denied.json()).toMatchObject({ code: "authentication", retryable: false });

    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) return new Response("{}", { status: attempts === 1 ? 429 : 502, headers: { "retry-after": "0" } });
        return new Response(JSON.stringify({ results: [{ entity_id: id, name: "Dune", subtype: "urn:entity:book", tags: null }] }), { status: 200 });
      }),
    );
    const recovered = await search(call("/api/qloo/search", { name: "Dune", expectedTypes: ["urn:entity:book"] }));
    expect(recovered.status).toBe(200);
    expect(attempts).toBe(3);
    const data = await recovered.json();
    expect(data.data.match.status).toBe("exact");
  });

  it("maps an aborted upstream call to a timeout", async () => {
    process.env.QLOO_TIMEOUT_MS = "80";
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })),
    );
    const response = await search(call("/api/qloo/search", { name: "Dune", expectedTypes: ["urn:entity:book"] }));
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: "timeout", retryable: true });
  });

  it("signs score evidence and refuses tampered affinity as authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        results: { entities: [{ entity_id: id, name: "Dune", subtype: "urn:entity:book", tags: null, query: { affinity: 0.42, explainability: { entities: [{ entity_id: seed, name: "Radiohead", score: 0.5 }] } } }] },
      }), { status: 200 })),
    );
    const scored = await score(call("/api/qloo/score", {
      domain: "book",
      seedIds: [seed],
      candidateIds: [id],
    }));
    const body = await scored.json();
    expect(body.data.entities[0].affinity).toBe(0.42);
    expect(verifyEvidence(body.data.entities[0].envelope)?.affinity).toBe(0.42);
    const tampered = signEvidence({
      domain: "book",
      entityId: id,
      name: "Dune",
      affinity: 0.99,
      explainability: null,
      seedIds: [seed],
    });
    expect(tampered).toBeTruthy();
    const broken = `${tampered?.slice(0, -4)}aaaa`;
    const repaired = await repair(call("/api/gemini/repair", {
      task: {
        question: "Recommend three books for my interests, preferred language and budget.",
        count: 1,
        domain: "book",
        companyName: "Lamp",
        assistantPurpose: "Books",
        age: 34,
        city: "Chicago",
        country: "United States",
        budget: "45",
        currency: "USD",
        language: "English",
        requirements: "No horror.",
        interests: [{ name: "Dune", kind: "book", entityId: seed }],
      },
      seedIds: [seed],
      candidates: [{
        entityId: id,
        name: "Dune",
        affinity: 0.99,
        evidenceOrigin: "provider",
        envelope: broken,
      }],
    }));
    const revision = await repaired.json();
    expect(revision.warnings.join(" ")).toMatch(/not treated as provider-authenticated/i);
    expect(JSON.stringify(revision)).not.toContain("server-key-should-not-leak");
    const prompt = String(vi.mocked(generateStructured).mock.calls.at(-1)?.[0]?.prompt ?? "");
    expect(prompt).not.toMatch(/not authenticated/i);
    expect(prompt).not.toContain("0.99");
    expect(prompt).toContain("Unavailable");
  });

  it("passes an unsigned returned affinity without asking the writer to judge authentication", async () => {
    delete process.env.EVIDENCE_SIGNING_SECRET;
    const repaired = await repair(call("/api/gemini/repair", {
      task: {
        question: "Recommend three books for my interests, preferred language and budget.",
        count: 1,
        domain: "book",
        companyName: "Lamp",
        assistantPurpose: "Books",
        age: 34,
        city: "",
        country: "United States",
        budget: "45",
        currency: "USD",
        language: "English",
        requirements: "No horror.",
        interests: [{ name: "Dune", kind: "book", entityId: seed }],
      },
      seedIds: [seed],
      candidates: [{
        entityId: id,
        name: "Dune",
        affinity: 0.42,
        evidenceOrigin: "unsigned",
        explainability: { status: "unavailable", contributions: [] },
        notes: ["Price, edition and stock unverified"],
      }],
    }));
    const revision = await repaired.json();
    expect(revision.warnings.join(" ")).not.toMatch(/not treated as provider-authenticated/i);
    const prompt = String(vi.mocked(generateStructured).mock.calls.at(-1)?.[0]?.prompt ?? "");
    expect(prompt).toContain("affinity 0.42");
    expect(prompt).toContain("Qloo affinity returned");
    expect(prompt).toContain("Price, edition and stock unverified");
    expect(prompt).not.toMatch(/not authenticated/i);
  });

  it("redacts configured secrets from text", () => {
    expect(redactSecrets("key server-key-should-not-leak")).not.toContain("server-key-should-not-leak");
  });
});
