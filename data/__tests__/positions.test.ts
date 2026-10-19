import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenPosition } from "@/types/positions";
import { POSITION_SOURCES } from "../position-sources";
import { checkSource, fetchPositions, retrySettings } from "../positions";

const GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/redwoodmaterials/jobs";
const ASHBY_URL = "https://api.ashbyhq.com/posting-api/job-board/helion";
const LEVER_URL = "https://api.lever.co/v0/postings/voltus?mode=json";

// The reference time the postings are compared against.
const NOW = Date.parse("2026-10-19T00:00:00.000Z");

const greenhouseResponse = {
  jobs: [
    {
      id: 1,
      internal_job_id: 10,
      title: "Battery Engineer",
      updated_at: "2026-10-01T10:00:00.000Z",
      first_published: "2026-09-20T10:00:00.000Z",
      absolute_url: "https://job-boards.greenhouse.io/redwoodmaterials/jobs/1",
      location: { name: "Berkeley, CA" }
    },
    {
      id: 2,
      internal_job_id: 11,
      title: "Remote Data Analyst",
      updated_at: "2026-10-02T10:00:00.000Z",
      absolute_url: "https://job-boards.greenhouse.io/redwoodmaterials/jobs/2",
      location: { name: "Remote (US)" }
    },
    {
      // Prospect posts are not openings, they have no internal job id.
      id: 3,
      internal_job_id: null,
      title: "Prospect",
      updated_at: "2026-10-03T10:00:00.000Z",
      absolute_url: "https://job-boards.greenhouse.io/redwoodmaterials/jobs/3",
      location: { name: "Anywhere" }
    }
  ]
};

const ashbyResponse = {
  jobs: [
    {
      id: "a1",
      title: "Fusion Engineer",
      location: "Everett, WA",
      employmentType: "FullTime",
      workplaceType: "On-site",
      isRemote: false,
      publishedAt: "2026-10-05T12:00:00.000Z",
      jobUrl: "https://jobs.ashbyhq.com/helion/a1",
      isListed: true
    },
    {
      id: "a2",
      title: "Fusion Engineer",
      location: "Seattle, WA",
      employmentType: "FullTime",
      publishedAt: "2026-10-04T12:00:00.000Z",
      jobUrl: "https://jobs.ashbyhq.com/helion/a2",
      isListed: true
    },
    {
      id: "a3",
      title: "Remote Recruiter",
      location: "Remote",
      secondaryLocations: [{ location: "Berlin" }],
      employmentType: "Contract",
      publishedAt: "2026-10-06T12:00:00.000Z",
      jobUrl: "https://jobs.ashbyhq.com/helion/a3",
      isListed: true
    },
    {
      id: "a4",
      title: "Closed Role",
      location: "Everett, WA",
      publishedAt: "2026-10-06T12:00:00.000Z",
      jobUrl: "https://jobs.ashbyhq.com/helion/a4",
      isListed: false
    }
  ]
};

const leverResponse = [
  {
    id: "l1",
    text: "Demand Response Analyst",
    hostedUrl: "https://jobs.lever.co/voltus/l1",
    createdAt: 1789000000000,
    categories: { location: "Remote (USA)", commitment: "Full-time" }
  }
];

const mockFetch = (routes: Record<string, { status?: number; body?: unknown }>) => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : String(input);
    const route = Object.keys(routes).find((key) => url.startsWith(key));
    if (!route) {
      return { ok: false, status: 404, statusText: "Not Found", json: async () => ({}) };
    }
    const { status = 200, body = {} } = routes[route];
    return {
      ok: status < 400,
      status,
      statusText: status < 400 ? "OK" : "Server Error",
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body))
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const findPosition = (positions: OpenPosition[], title: string) =>
  positions.find((position) => position.title === title);

// How often a board was asked.
const callsTo = (fetchMock: ReturnType<typeof mockFetch>, url: string) =>
  fetchMock.mock.calls.filter((call) => String(call[0]).startsWith(url)).length;

const sourceById = (id: string) => {
  const source = POSITION_SOURCES.find((item) => item.id === id);
  if (!source) {
    throw new Error(`Unknown source ${id}`);
  }
  return source;
};

afterEach(() => {
  vi.unstubAllGlobals();
  retrySettings.delayMs = 0;
});

beforeEach(() => {
  retrySettings.delayMs = 0;
});

describe("positions", () => {
  it("normalizes the postings of every board", async () => {
    mockFetch({
      [GREENHOUSE_URL]: { body: greenhouseResponse },
      [ASHBY_URL]: { body: ashbyResponse },
      [LEVER_URL]: { body: leverResponse }
    });

    const { positions } = await fetchPositions({ now: NOW });

    const battery = findPosition(positions, "Battery Engineer");
    expect(battery).toBeDefined();
    expect(battery?.organization).toBe("Redwood Materials");
    expect(battery?.url).toBe("https://job-boards.greenhouse.io/redwoodmaterials/jobs/1");
    expect(battery?.locations).toEqual(["Berkeley, CA"]);
    expect(battery?.remote).toBe(false);
    expect(battery?.postedAt).toBe("2026-09-20T10:00:00.000Z");
    expect(battery?.source).toBe("greenhouse");

    const recruiter = findPosition(positions, "Remote Recruiter");
    expect(recruiter?.remote).toBe(true);
    expect(recruiter?.locations).toEqual(["Remote", "Berlin"]);
    expect(recruiter?.employmentType).toBe("Contract");

    const analyst = findPosition(positions, "Demand Response Analyst");
    expect(analyst?.organization).toBe("Voltus");
    expect(analyst?.remote).toBe(true);
    expect(analyst?.employmentType).toBe("Full-time");
    expect(analyst?.postedAt).toBe("2026-09-10T00:26:40.000Z");
  });

  it("skips postings that are not openings", async () => {
    mockFetch({
      [GREENHOUSE_URL]: { body: greenhouseResponse },
      [ASHBY_URL]: { body: ashbyResponse }
    });

    const { positions } = await fetchPositions({ now: NOW });

    expect(findPosition(positions, "Prospect")).toBeUndefined();
    expect(findPosition(positions, "Closed Role")).toBeUndefined();
  });

  it("merges a role that is listed in several locations", async () => {
    mockFetch({ [ASHBY_URL]: { body: ashbyResponse } });

    const { positions } = await fetchPositions({ now: NOW });
    const engineers = positions.filter((position) => position.title === "Fusion Engineer");

    expect(engineers.length).toBe(1);
    expect(engineers[0].locations).toEqual(["Everett, WA", "Seattle, WA"]);
    // The role is still advertised if one of its postings is recent.
    expect(engineers[0].postedAt).toBe("2026-10-05T12:00:00.000Z");
  });

  it("drops a posting that has been on the board for more than a year", async () => {
    mockFetch({
      [ASHBY_URL]: {
        body: {
          jobs: [
            {
              id: "old",
              title: "Old Opening",
              location: "Everett, WA",
              publishedAt: "2024-03-01T12:00:00.000Z",
              jobUrl: "https://jobs.ashbyhq.com/helion/old",
              isListed: true
            },
            {
              id: "recent",
              title: "Recent Opening",
              location: "Everett, WA",
              publishedAt: "2026-09-01T12:00:00.000Z",
              jobUrl: "https://jobs.ashbyhq.com/helion/recent",
              isListed: true
            }
          ]
        }
      }
    });

    const { positions } = await fetchPositions({ now: NOW });

    expect(findPosition(positions, "Old Opening")).toBeUndefined();
    expect(findPosition(positions, "Recent Opening")).toBeDefined();
  });

  it("keeps the other sources when one board fails", async () => {
    mockFetch({
      [GREENHOUSE_URL]: { body: greenhouseResponse },
      [ASHBY_URL]: { status: 500 },
      [LEVER_URL]: { body: leverResponse }
    });

    const { positions, failures } = await fetchPositions({ now: NOW });

    expect(findPosition(positions, "Battery Engineer")).toBeDefined();
    expect(findPosition(positions, "Demand Response Analyst")).toBeDefined();
    expect(failures.some((failure) => failure.source === "Helion")).toBe(true);
  });

  it("drops postings that are only a talent pool or a general application", async () => {
    mockFetch({
      [ASHBY_URL]: {
        body: {
          jobs: [
            {
              id: "n1",
              title: "Join our talent pool",
              location: "Everett, WA",
              publishedAt: "2026-10-05T12:00:00.000Z",
              jobUrl: "https://jobs.ashbyhq.com/helion/n1",
              isListed: true
            },
            {
              id: "n2",
              title: "General Application",
              location: "Everett, WA",
              publishedAt: "2026-10-05T12:00:00.000Z",
              jobUrl: "https://jobs.ashbyhq.com/helion/n2",
              isListed: true
            }
          ]
        }
      }
    });

    const { positions } = await fetchPositions({ now: NOW });

    expect(positions).toHaveLength(0);
  });

  it("lists every source with a unique id and a board url that matches its token", () => {
    const ids = POSITION_SOURCES.map((source) => source.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const source of POSITION_SOURCES) {
      expect(source.url).toContain(source.token);
      expect(source.url.startsWith("https://")).toBe(true);
    }
  });

  it("keeps the committed snapshot in the expected shape", async () => {
    const snapshot = JSON.parse(await fs.readFile("data/fixtures/positions.json", "utf-8"));

    expect(typeof snapshot.fetchedAt).toBe("string");
    expect(snapshot.positions.length).toBeGreaterThan(0);
    for (const position of snapshot.positions) {
      expect(position.title).toBeTruthy();
      expect(position.organization).toBeTruthy();
      expect(position.url).toMatch(/^https:\/\//);
      expect(position.locations.length).toBeGreaterThan(0);
      expect(position.postedAt).toBeTruthy();
    }
  });

  it("detects a board that does not belong to the organization", async () => {
    const source = sourceById("redwood-materials");

    mockFetch({
      "https://boards-api.greenhouse.io/v1/boards/redwoodmaterials": {
        body: { name: "Some Other Company" }
      }
    });
    expect((await checkSource(source)).matches).toBe(false);

    mockFetch({
      "https://boards-api.greenhouse.io/v1/boards/redwoodmaterials": {
        body: { name: "Redwood Materials" }
      }
    });
    expect((await checkSource(source)).matches).toBe(true);
  });

  it("reads the organization from the title of a board page", async () => {
    const source = sourceById("helion");

    mockFetch({
      "https://jobs.ashbyhq.com/helion": {
        body: "<html><title>Some Other Company Jobs</title></html>"
      }
    });
    expect((await checkSource(source)).matches).toBe(false);

    mockFetch({
      "https://jobs.ashbyhq.com/helion": { body: "<html><title>Helion Jobs</title></html>" }
    });
    expect((await checkSource(source)).matches).toBe(true);
  });

  it("does not call a board that names no organization a match", async () => {
    const source = sourceById("form-energy");

    mockFetch({
      "https://jobs.ashbyhq.com/formenergy": { body: "<html><title>Jobs</title></html>" }
    });

    const result = await checkSource(source);
    // The board publishes no name, so we cannot say it is the organization we expect.
    expect(result.verified).toBe(false);
    expect(result.matches).toBe(false);
    // The source says that this is known, so the check does not fail the run.
    expect(source.nameUnverifiable).toBe(true);
  });

  it("turns the dates of the boards into UTC, so they can be sorted", async () => {
    mockFetch({
      [GREENHOUSE_URL]: {
        body: {
          jobs: [
            {
              id: 1,
              internal_job_id: 1,
              title: "Evening Role",
              updated_at: "2026-10-19T16:00:00.000Z",
              // The board reports the date in its own time zone.
              first_published: "2026-10-19T20:00:00.000-04:00",
              absolute_url: "https://job-boards.greenhouse.io/redwoodmaterials/jobs/1"
            },
            {
              id: 2,
              internal_job_id: 2,
              title: "Morning Role",
              updated_at: "2026-10-19T16:00:00.000Z",
              first_published: "2026-10-19T18:00:00.000+00:00",
              absolute_url: "https://job-boards.greenhouse.io/redwoodmaterials/jobs/2"
            }
          ]
        }
      }
    });

    const { positions } = await fetchPositions({ now: NOW });

    // 20:00-04:00 is 00:00Z the next day, so it is the newer one.
    expect(positions[0].title).toBe("Evening Role");
    expect(positions[0].postedAt).toBe("2026-10-20T00:00:00.000Z");
    expect(positions[1].postedAt).toBe("2026-10-19T18:00:00.000Z");
  });

  it("merges a role the board wrote with a different spacing", async () => {
    mockFetch({
      [ASHBY_URL]: {
        body: {
          jobs: [
            {
              id: "s1",
              title: "Class A Safety Driver ",
              location: "Lancaster, TX",
              publishedAt: "2026-10-05T12:00:00.000Z",
              jobUrl: "https://jobs.ashbyhq.com/helion/s1",
              isListed: true
            },
            {
              id: "s2",
              title: "Class A Safety Driver",
              location: "Odessa, TX",
              publishedAt: "2026-10-04T12:00:00.000Z",
              jobUrl: "https://jobs.ashbyhq.com/helion/s2",
              isListed: true
            }
          ]
        }
      }
    });

    const { positions } = await fetchPositions({ now: NOW });
    const drivers = positions.filter((position) => position.organization === "Helion");

    expect(drivers).toHaveLength(1);
    expect(drivers[0].locations).toEqual(["Lancaster, TX", "Odessa, TX"]);
    expect(drivers[0].postedAt).toBe("2026-10-05T12:00:00.000Z");
  });

  it("reports a board that changed its answer instead of reporting no openings", async () => {
    mockFetch({
      // The board answered, but the list of postings is not under the name we know.
      [GREENHOUSE_URL]: { body: { openings: [] } },
      [ASHBY_URL]: { body: ashbyResponse }
    });

    const { positions, failures } = await fetchPositions({ now: NOW });

    expect(failures.some((failure) => failure.source === "Redwood Materials")).toBe(true);
    expect(findPosition(positions, "Battery Engineer")).toBeUndefined();
  });

  it("asks a board again when it answers with a server error", async () => {
    const fetchMock = mockFetch({ [ASHBY_URL]: { status: 500 } });

    const { failures } = await fetchPositions({ now: NOW });

    expect(failures.some((failure) => failure.source === "Helion")).toBe(true);
    // The board is asked once and then twice more.
    expect(callsTo(fetchMock, ASHBY_URL)).toBe(3);
  });

  it("does not ask a board again when it says it does not know the token", async () => {
    const fetchMock = mockFetch({ [ASHBY_URL]: { status: 404 } });

    const { failures } = await fetchPositions({ now: NOW });

    expect(failures.some((failure) => failure.source === "Helion")).toBe(true);
    expect(callsTo(fetchMock, ASHBY_URL)).toBe(1);
  });
});
