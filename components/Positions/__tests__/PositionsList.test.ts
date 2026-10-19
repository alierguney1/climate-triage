import { describe, expect, it } from "vitest";
import type { OpenPosition } from "@/types/positions";
import { filterPositions, formatAge } from "../PositionsList";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

const position = (overrides: Partial<OpenPosition>): OpenPosition => ({
  id: "1",
  title: "Engineer",
  organization: "Form Energy",
  url: "https://example.com/1",
  locations: ["Berkeley, CA"],
  remote: false,
  postedAt: daysAgo(1),
  category: "energy",
  source: "ashby",
  sourceId: "form-energy",
  ...overrides
});

const NO_FILTER = { term: "", remoteOnly: false, cutoff: 0, type: "all" } as const;

describe("formatAge", () => {
  it("counts the days a posting is old", () => {
    expect(formatAge(daysAgo(0), NOW)).toBe("today");
    expect(formatAge(daysAgo(1), NOW)).toBe("yesterday");
    expect(formatAge(daysAgo(3), NOW)).toBe("3 days ago");
    expect(formatAge(daysAgo(13), NOW)).toBe("13 days ago");
  });

  it("counts the weeks and months for the older postings", () => {
    expect(formatAge(daysAgo(14), NOW)).toBe("2 weeks ago");
    expect(formatAge(daysAgo(45), NOW)).toBe("6 weeks ago");
    expect(formatAge(daysAgo(90), NOW)).toBe("3 months ago");
    expect(formatAge(daysAgo(200), NOW)).toBe("7 months ago");
    expect(formatAge(daysAgo(400), NOW)).toBe("1 year ago");
  });

  it("says nothing when the board doesn't tell us when it was published", () => {
    expect(formatAge("", NOW)).toBe("");
    expect(formatAge("not a date", NOW)).toBe("");
  });
});

describe("filterPositions", () => {
  const positions = [
    position({
      id: "1",
      title: "Battery Engineer",
      category: "energy",
      employmentType: "Full-time"
    }),
    position({
      id: "2",
      title: "Data Analyst",
      organization: "Voltus",
      sourceId: "voltus",
      category: "software",
      employmentType: "Contract",
      remote: true,
      locations: ["Remote"]
    })
  ];

  it("keeps every posting when nothing is filtered", () => {
    const { matching, matchingByType } = filterPositions(positions, NO_FILTER);

    expect(matching).toHaveLength(2);
    expect(matchingByType).toHaveLength(2);
  });

  it("counts the categories inside the type filter", () => {
    const { matchingByType, categoryCounts } = filterPositions(positions, {
      ...NO_FILTER,
      type: "Full-time"
    });

    // Only the first one is full time, the counts next to the categories have to say so.
    expect(matchingByType).toHaveLength(1);
    expect(categoryCounts.get("energy")).toBe(1);
    expect(categoryCounts.get("software")).toBeUndefined();
  });

  it("counts the postings without a type", () => {
    const { typeCounts } = filterPositions(positions, NO_FILTER);

    expect(typeCounts.get("Full-time")).toBe(1);
    expect(typeCounts.get("Contract")).toBe(1);
    expect(typeCounts.get("unspecified")).toBeUndefined();
  });

  it("keeps the postings of a type that the board doesn't name", () => {
    const withoutType = [position({ id: "3", title: "Office Role" })];

    const { matchingByType } = filterPositions(withoutType, { ...NO_FILTER, type: "unspecified" });

    expect(matchingByType).toHaveLength(1);
  });

  it("finds a posting by its title, its organization and its location", () => {
    expect(filterPositions(positions, { ...NO_FILTER, term: "battery" }).matching).toHaveLength(1);
    expect(filterPositions(positions, { ...NO_FILTER, term: "voltus" }).matching).toHaveLength(1);
    expect(filterPositions(positions, { ...NO_FILTER, term: "berkeley" }).matching).toHaveLength(1);
    expect(filterPositions(positions, { ...NO_FILTER, term: "nuclear" }).matching).toHaveLength(0);
  });

  it("keeps the postings of the last days", () => {
    const older = [position({ id: "4", title: "Old Role", postedAt: daysAgo(30) })];

    const { matching } = filterPositions(older, { ...NO_FILTER, cutoff: NOW - 7 * DAY_MS });

    expect(matching).toHaveLength(0);
  });

  it("keeps the remote postings", () => {
    const { matching } = filterPositions(positions, { ...NO_FILTER, remoteOnly: true });

    expect(matching).toHaveLength(1);
    expect(matching[0].title).toBe("Data Analyst");
  });
});
