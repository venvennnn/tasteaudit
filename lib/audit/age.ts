import { AGE_BANDS, type AgeBand } from "@/lib/schemas/limits";

const BANDS: { max: number; band: AgeBand }[] = [
  { max: 24, band: "24_and_younger" },
  { max: 29, band: "25_to_29" },
  { max: 34, band: "30_to_34" },
  { max: 44, band: "35_to_44" },
  { max: 54, band: "45_to_54" },
];

export function ageToSupportedBand(age: number | null | undefined): AgeBand | null {
  if (age === null || age === undefined || !Number.isInteger(age)) return null;
  if (age < 0 || age > 120) return null;
  for (const entry of BANDS) {
    if (age <= entry.max) return entry.band;
  }
  return "55_and_older";
}

export function isSupportedAgeBand(value: string): value is AgeBand {
  return (AGE_BANDS as readonly string[]).includes(value);
}

export function ageBandLabel(band: AgeBand): string {
  switch (band) {
    case "24_and_younger":
      return "24 and younger";
    case "25_to_29":
      return "25 to 29";
    case "30_to_34":
      return "30 to 34";
    case "35_to_44":
      return "35 to 44";
    case "45_to_54":
      return "45 to 54";
    case "55_and_older":
      return "55 and older";
  }
}
