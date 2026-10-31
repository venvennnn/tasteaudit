import type { RegionalTagRecord } from "@/lib/audit/regional-types";

export type TagCell = {
  tagId: string;
  name: string;
  namespace: string;
  city: string;
  status: "returned" | "not_returned";
  rank: number | null;
  score: number | null;
  compatible: boolean | null;
};

export type AlignedTag = {
  tagId: string;
  name: string;
  namespace: string;
  cells: TagCell[];
  shared: boolean;
  distinctiveCity: string | null;
};

export function alignRegionalTags(cities: { city: string; tags: RegionalTagRecord[] }[]): AlignedTag[] {
  const order: string[] = [];
  const meta = new Map<string, { name: string; namespace: string }>();
  for (const city of cities) {
    for (const tag of city.tags) {
      if (!meta.has(tag.tagId)) {
        order.push(tag.tagId);
        meta.set(tag.tagId, { name: tag.name, namespace: tag.namespace });
      }
    }
  }
  return order.map((tagId) => {
    const info = meta.get(tagId)!;
    const cells = cities.map((city) => {
      const found = city.tags.find((tag) => tag.tagId === tagId);
      if (!found) {
        return {
          tagId,
          name: info.name,
          namespace: info.namespace,
          city: city.city,
          status: "not_returned" as const,
          rank: null,
          score: null,
          compatible: null,
        };
      }
      return {
        tagId,
        name: found.name,
        namespace: found.namespace,
        city: city.city,
        status: "returned" as const,
        rank: found.rank,
        score: found.score,
        compatible: found.compatible,
      };
    });
    const present = cells.filter((cell) => cell.status === "returned");
    return {
      tagId,
      name: info.name,
      namespace: info.namespace,
      cells,
      shared: cities.length > 0 && present.length === cities.length,
      distinctiveCity: present.length === 1 ? present[0]!.city : null,
    };
  });
}
