import { lookupArtwork } from "@/lib/catalog/artwork";
import { type ArtworkKind } from "@/lib/catalog/rank";
import { assertSameOrigin, jsonData, jsonError } from "@/lib/http/route";
import { AppError, toApiError } from "@/lib/providers/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<ArtworkKind>(["movie", "artist", "book", "any"]);

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    assertSameOrigin(request);
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const kind = url.searchParams.get("kind") ?? "any";
    const take = Math.min(6, Math.max(1, Number(url.searchParams.get("take") ?? 1) || 1));
    if (!KINDS.has(kind as ArtworkKind)) {
      throw new AppError({
        code: "invalid_request",
        message: "Kind must be movie, artist, book, or any.",
        stage: "catalog.artwork",
        retryable: false,
        status: 400,
        requestId,
      });
    }
    if (query.length > 120) {
      throw new AppError({
        code: "invalid_request",
        message: "The search is too long.",
        stage: "catalog.artwork",
        retryable: false,
        status: 400,
        requestId,
      });
    }
    const hits = await lookupArtwork({ query, kind: kind as ArtworkKind, take, signal: request.signal });
    return jsonData({ hits }, [], { provider: "catalog", requestId, retrievedAt: new Date().toISOString() });
  } catch (error) {
    return jsonError(toApiError(error, "catalog.artwork", requestId));
  }
}
