import type { PositionBoard, PositionCategory, PositionsData } from "@/types/positions";
import positions from "../data/positions.json";

// Typed explicitly: TypeScript infers the type from whatever data/positions.json currently
// holds, which widens the category to a plain string.
export const getPositions = (): PositionsData => {
  const data = positions as unknown as PositionsData;
  // A snapshot from before the field existed carries no failed sources.
  return { ...data, failedSources: data.failedSources ?? [] };
};

export interface PositionOrganization {
  organization: string;
  category: PositionCategory;
  source: PositionBoard;
  sourceId: string;
  count: number;
}

// The organizations that have open positions right now.
export const getPositionOrganizations = (): PositionOrganization[] => {
  const organizations = new Map<string, PositionOrganization>();

  for (const position of getPositions().positions) {
    const existing = organizations.get(position.organization);
    if (existing) {
      existing.count++;
      continue;
    }
    organizations.set(position.organization, {
      organization: position.organization,
      category: position.category,
      source: position.source,
      sourceId: position.sourceId,
      count: 1
    });
  }

  return [...organizations.values()].sort((a, b) => a.organization.localeCompare(b.organization));
};
