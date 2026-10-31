import { z } from "zod";
import { EVIDENCE_NOTES } from "@/lib/audit/evidence";
import { DOMAINS, FAVORITE_KINDS, LIMITS } from "@/lib/schemas/limits";

export const uuidSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/);

export const searchRequestSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.favoriteName),
  expectedTypes: z.array(z.string().min(1).max(80)).min(1).max(6),
}).strict();

export const discoverRequestSchema = z.object({
  domain: z.enum(DOMAINS),
  seedIds: z.array(uuidSchema).min(1).max(LIMITS.favorites),
  locationQuery: z.string().trim().max(LIMITS.city).optional(),
  ageBand: z
    .enum(["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"])
    .optional(),
}).strict();

export const scoreRequestSchema = discoverRequestSchema.extend({
  candidateIds: z.array(uuidSchema).min(1).max(LIMITS.scorePoolMax),
}).strict();

export const entitiesRequestSchema = z.object({
  entityIds: z.array(uuidSchema).min(1).max(5),
}).strict();

export const taskSchema = z.object({
  question: z.string().trim().min(1).max(LIMITS.question),
  count: z.number().int().min(LIMITS.recommendationsMin).max(LIMITS.recommendationsMax),
  domain: z.enum(DOMAINS),
  companyName: z.string().trim().max(LIMITS.companyName),
  assistantPurpose: z.string().trim().max(LIMITS.purpose),
  age: z.number().int().min(0).max(120).nullable(),
  city: z.string().trim().max(LIMITS.city),
  destination: z.string().trim().max(LIMITS.city).optional(),
  country: z.string().trim().max(LIMITS.country),
  budget: z.string().trim().max(LIMITS.budget),
  currency: z.string().trim().max(LIMITS.currency),
  language: z.string().trim().max(LIMITS.language),
  requirements: z.string().trim().max(LIMITS.requirements),
  interests: z.array(z.object({
    name: z.string().trim().min(1).max(LIMITS.favoriteName),
    kind: z.enum(FAVORITE_KINDS),
    resolvedName: z.string().trim().max(LIMITS.favoriteName).optional(),
    entityId: uuidSchema.optional(),
  })).max(LIMITS.favorites),
}).strict();

export const originalRequestSchema = z.object({ task: taskSchema }).strict();

export const refineRequestSchema = z.object({
  task: taskSchema,
  originalAnswer: z.string().trim().min(1).max(LIMITS.pastedAnswer),
}).strict();

export const extractRequestSchema = z.object({
  domain: z.enum(DOMAINS),
  answer: z.string().trim().min(1).max(LIMITS.pastedAnswer),
  count: z.number().int().min(1).max(LIMITS.recommendationsMax),
}).strict();

export const evidenceInputSchema = z.object({
  entityId: uuidSchema,
  name: z.string().trim().min(1).max(LIMITS.favoriteName),
  affinity: z.number().nullable(),
  explainability: z.unknown().optional(),
  envelope: z.string().max(8000).optional(),
  evidenceOrigin: z.enum(["provider", "imported", "unsigned"]),
  notes: z.array(z.enum(EVIDENCE_NOTES)).max(EVIDENCE_NOTES.length).optional(),
}).strict();

export const repairRequestSchema = z.object({
  task: taskSchema,
  candidates: z.array(evidenceInputSchema).min(1).max(LIMITS.scorePoolMax),
  seedIds: z.array(uuidSchema).max(LIMITS.favorites),
}).strict();

export const localityRequestSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.city),
}).strict();

export const tasteRequestSchema = z.object({
  domain: z.enum(DOMAINS),
  locationQuery: z.string().trim().min(1).max(LIMITS.city),
  ageBand: z.enum(["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]).optional(),
}).strict();

export const regionalInsightsRequestSchema = z.object({
  domain: z.enum(DOMAINS),
  tagIds: z.array(z.string().trim().min(3).max(180)).min(1).max(12),
  seedIds: z.array(uuidSchema).max(LIMITS.favorites).optional(),
  candidateIds: z.array(uuidSchema).max(LIMITS.scorePoolMax).optional(),
  locationQuery: z.string().trim().max(LIMITS.city).optional(),
  ageBand: z.enum(["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"]).optional(),
}).strict();

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type DiscoverRequest = z.infer<typeof discoverRequestSchema>;
export type ScoreRequest = z.infer<typeof scoreRequestSchema>;
export type TaskSpec = z.infer<typeof taskSchema>;
export type RepairRequest = z.infer<typeof repairRequestSchema>;
