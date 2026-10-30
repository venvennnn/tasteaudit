import { createHmac, timingSafeEqual } from "node:crypto";

export type EvidenceEnvelopePayload = {
  v: 1;
  exp: number;
  domain: "book" | "place";
  entityId: string;
  name: string;
  affinity: number | null;
  explainability: unknown;
  seedIds: string[];
};

const TTL_MS = 2 * 60 * 60 * 1000;

function secret(): string | null {
  const value = process.env.EVIDENCE_SIGNING_SECRET;
  if (!value || value.trim().length < 16) return null;
  return value;
}

export function signingAvailable(): boolean {
  return secret() !== null;
}

export function signEvidence(payload: Omit<EvidenceEnvelopePayload, "v" | "exp"> & { exp?: number }): string | null {
  const key = secret();
  if (!key) return null;
  const full: EvidenceEnvelopePayload = {
    v: 1,
    exp: payload.exp ?? Date.now() + TTL_MS,
    domain: payload.domain,
    entityId: payload.entityId,
    name: payload.name,
    affinity: payload.affinity,
    explainability: payload.explainability ?? null,
    seedIds: [...payload.seedIds].sort(),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyEvidence(token: string): EvidenceEnvelopePayload | null {
  const key = secret();
  if (!key) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as EvidenceEnvelopePayload;
    if (parsed.v !== 1 || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    if (parsed.domain !== "book" && parsed.domain !== "place") return null;
    if (typeof parsed.entityId !== "string" || typeof parsed.name !== "string") return null;
    if (parsed.affinity !== null && typeof parsed.affinity !== "number") return null;
    if (!Array.isArray(parsed.seedIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}
