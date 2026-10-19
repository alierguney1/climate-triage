import type { OpenPosition, PositionBoard, PositionSource, PositionType } from "@/types/positions";
import { POSITION_SOURCES } from "./position-sources";

// Public job board APIs of the applicant tracking systems. They are read-only and need no
// authentication.
const BOARD_URLS: Record<PositionBoard, (token: string) => string> = {
  ashby: (token) => `https://api.ashbyhq.com/posting-api/job-board/${token}`,
  greenhouse: (token) => `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
  lever: (token) => `https://api.lever.co/v0/postings/${token}?mode=json`
};

// The board reports the organization's name, so we can tell that a token still points at the
// organization we expect it to.
const BOARD_NAME_URLS: Record<PositionBoard, (token: string) => string> = {
  ashby: (token) => `https://jobs.ashbyhq.com/${token}`,
  greenhouse: (token) => `https://boards-api.greenhouse.io/v1/boards/${token}`,
  lever: (token) => `https://jobs.lever.co/${token}`
};

const FETCH_TIMEOUT_MS = 30000;

// How often we ask a board again when it answers with an error. A board that is briefly down
// should not take the organization off the list for the hour.
const FETCH_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

// The retry behaviour. The tests lower the delay so they don't wait for it.
export const retrySettings = {
  attempts: FETCH_RETRIES,
  delayMs: RETRY_DELAY_MS
};

// The boards are third party services, we ask them politely: a few requests at a time.
const FETCH_CONCURRENCY = 5;

// Job boards keep postings around long after they were filled, some of them for years. A
// posting that has been on a board for more than a year is not an opening anymore.
const MAX_POSTING_AGE_DAYS = 365;

const isRecent = (postedAt: string, now: number) => {
  if (!postedAt) {
    // The board doesn't tell us when it was published, we don't drop it.
    return true;
  }
  const published = new Date(postedAt).getTime();
  if (Number.isNaN(published)) {
    return true;
  }
  return now - published <= MAX_POSTING_AGE_DAYS * 24 * 60 * 60 * 1000;
};

// Postings that are not an actual opening: talent pools, general applications and the
// "don't see the job you are looking for" posts.
const NOISE_TITLE =
  /\btalent pool\b|\bfuture opportunit\w*\b|\bgeneral application\b|\bgeneral interest\b|\bdon'?t see the job\b|\bengineering interest\b/i;

const isRemote = (value?: string) => !!value && /remote|anywhere|worldwide/i.test(value);

// The boards report the kind of contract in their own words, "Fulltime", "Full-time",
// "Full-time Employee". We normalize them so they can be filtered.
const normalizeEmploymentType = (value?: string): PositionType | undefined => {
  if (!value) {
    return undefined;
  }
  const text = value.toLowerCase();
  if (text.includes("intern")) {
    return "Intern";
  }
  if (text.includes("contract")) {
    return "Contract";
  }
  if (text.includes("temp")) {
    return "Temporary";
  }
  if (text.includes("part")) {
    return "Part-time";
  }
  if (text.includes("full")) {
    return "Full-time";
  }
  return undefined;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

// The board can name the organization a bit differently than we do, "Sunnova Energy
// Corporation" is still Sunnova Energy, but "Some Other Company" is not.
const namesMatch = (name: string, expected: string) => {
  const left = normalize(name);
  const right = normalize(expected);
  if (!right) {
    return false;
  }
  if (!left) {
    // The board published no name, we cannot say it is the organization we expect.
    return false;
  }
  return left.includes(right) || right.includes(left);
};

// The boards report the date in their own time zone, "-04:00" and "+00:00" are the same kind
// of value but don't sort the same way as text. We turn them into UTC, so comparing and
// sorting them as text is correct.
const toUtcIso = (value?: string): string => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};

// The boards answer with a list of postings. When that list is not there, the board changed
// its answer and we would otherwise report "no openings" for the organization.
const asPostingList = (data: unknown, field: string): unknown[] => {
  if (!data || typeof data !== "object") {
    throw new Error("The board did not return an object.");
  }
  const postings = (data as Record<string, unknown>)[field];
  if (!Array.isArray(postings)) {
    throw new Error(`The board did not return a "${field}" list.`);
  }
  return postings;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, statusText: string) {
    super(`${status} ${statusText}`);
    this.status = status;
  }
}

// A board that is busy or down for a moment is worth asking again, a board that tells us it
// does not know the token is not.
const isWorthRetrying = (status: number) => status === 429 || status >= 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "climate-triage (+https://climate-triage.com)" }
    });
    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchWithRetry = async (url: string): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchWithTimeout(url);
    } catch (error) {
      const retryable = error instanceof HttpError ? isWorthRetrying(error.status) : true;
      if (!retryable || attempt >= retrySettings.attempts) {
        throw error;
      }
      await sleep(retrySettings.delayMs * 2 ** attempt);
    }
  }
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetchWithRetry(url);
  return await response.json();
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetchWithRetry(url);
  return await response.text();
};

// Runs the worker over the items, a few at a time, and keeps the order of the results.
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
};

interface GreenhouseJob {
  id: number;
  // Prospect posts have no internal job id, they are not openings.
  internal_job_id: number | null;
  title: string;
  updated_at: string;
  first_published?: string;
  absolute_url: string;
  location?: { name: string };
}

const fetchGreenhouse = async (source: PositionSource): Promise<OpenPosition[]> => {
  const data = await fetchJson(BOARD_URLS.greenhouse(source.token));

  return asPostingList(data, "jobs")
    .map((posting) => posting as GreenhouseJob)
    .filter((job) => job.internal_job_id !== null)
    .map((job) => {
      const location = job.location?.name ?? "Not specified";
      return {
        id: `${source.id}-${job.id}`,
        title: job.title,
        organization: source.name,
        url: job.absolute_url,
        locations: [location],
        remote: isRemote(location),
        postedAt: toUtcIso(job.first_published ?? job.updated_at),
        category: source.category,
        source: source.board,
        sourceId: source.id
      };
    });
};

// A location is either a plain string or an object with the name and the address.
type AshbyLocation = string | { location?: string };

const locationName = (value: AshbyLocation | undefined): string | undefined =>
  typeof value === "string" ? value : value?.location;

interface AshbyJob {
  id: string;
  title: string;
  location?: AshbyLocation;
  secondaryLocations?: AshbyLocation[];
  employmentType?: string;
  workplaceType?: string;
  isRemote?: boolean;
  publishedAt: string;
  jobUrl: string;
  isListed?: boolean;
}

const fetchAshby = async (source: PositionSource): Promise<OpenPosition[]> => {
  const data = await fetchJson(BOARD_URLS.ashby(source.token));

  return asPostingList(data, "jobs")
    .map((posting) => posting as AshbyJob)
    .filter((job) => job.isListed !== false)
    .map((job) => {
      const locations = [job.location, ...(job.secondaryLocations ?? [])]
        .map((location) => locationName(location))
        .filter((location): location is string => !!location);
      return {
        id: `${source.id}-${job.id}`,
        title: job.title,
        organization: source.name,
        url: job.jobUrl,
        locations: locations.length > 0 ? locations : ["Not specified"],
        remote:
          job.isRemote === true ||
          job.workplaceType === "Remote" ||
          isRemote(locationName(job.location)),
        employmentType: normalizeEmploymentType(job.employmentType),
        postedAt: toUtcIso(job.publishedAt),
        category: source.category,
        source: source.board,
        sourceId: source.id
      };
    });
};

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt: number;
  categories?: {
    location?: string;
    commitment?: string;
  };
}

const fetchLever = async (source: PositionSource): Promise<OpenPosition[]> => {
  const data = await fetchJson(BOARD_URLS.lever(source.token));
  if (!Array.isArray(data)) {
    throw new Error("The board did not return a list of postings.");
  }

  return (data as LeverPosting[]).map((posting) => {
    const location = posting.categories?.location ?? "Not specified";
    const commitment = posting.categories?.commitment ?? "";
    return {
      id: `${source.id}-${posting.id}`,
      title: posting.text,
      organization: source.name,
      url: posting.hostedUrl,
      locations: [location],
      remote: isRemote(location) || isRemote(commitment),
      employmentType: normalizeEmploymentType(commitment),
      postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : "",
      category: source.category,
      source: source.board,
      sourceId: source.id
    };
  });
};

const fetchSource = async (source: PositionSource): Promise<OpenPosition[]> => {
  switch (source.board) {
    case "greenhouse":
      return fetchGreenhouse(source);
    case "ashby":
      return fetchAshby(source);
    case "lever":
      return fetchLever(source);
  }
};

// Boards list the same role once per location. Keep one entry per role and list the
// locations it is open in.
const mergePositions = (positions: OpenPosition[]): OpenPosition[] => {
  const merged = new Map<string, OpenPosition>();

  for (const position of positions) {
    // The boards write the same role with a different spacing, "Class A Safety Driver " and
    // "Class A Safety Driver" are the same role in two locations.
    const key = `${position.organization}|${normalize(position.title)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...position, locations: [...position.locations] });
      continue;
    }
    existing.locations = [...new Set([...existing.locations, ...position.locations])];
    // The role is still advertised if one of its postings is recent. The timestamps are all
    // in UTC, so comparing them as text compares them as moments in time.
    if (position.postedAt > existing.postedAt) {
      existing.postedAt = position.postedAt;
    }
  }

  return [...merged.values()].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
};

export interface PositionsFetchResult {
  positions: OpenPosition[];
  failures: { source: string; error: string }[];
}

export const fetchPositions = async ({
  now = Date.now()
}: {
  now?: number;
} = {}): Promise<PositionsFetchResult> => {
  const results = await mapWithConcurrency(POSITION_SOURCES, FETCH_CONCURRENCY, async (source) => {
    try {
      return { source, positions: await fetchSource(source) };
    } catch (error) {
      return {
        source,
        positions: [] as OpenPosition[],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  const positions: OpenPosition[] = [];
  const failures: { source: string; error: string }[] = [];

  for (const result of results) {
    if (result.error) {
      failures.push({ source: result.source.name, error: result.error });
      continue;
    }
    positions.push(...result.positions);
  }

  const merged = mergePositions(positions.filter((position) => !NOISE_TITLE.test(position.title)));

  return {
    positions: merged.filter((position) => isRecent(position.postedAt, now)),
    failures
  };
};

export interface SourceCheck {
  // The name the board reports, empty when the board publishes none.
  name: string;
  // True only when the board's name matched the organization we expect.
  matches: boolean;
  // False when the board publishes no name we can compare it against.
  verified: boolean;
}

// Checks that a board token still points at the organization we expect it to. Greenhouse
// reports the name in JSON, Ashby and Lever only in the title of the board page.
export const checkSource = async (source: PositionSource): Promise<SourceCheck> => {
  if (source.board === "greenhouse") {
    const data = (await fetchJson(BOARD_NAME_URLS.greenhouse(source.token))) as { name?: string };
    const name = data.name ?? "";
    return { name, matches: namesMatch(name, source.name), verified: name.length > 0 };
  }

  const html = await fetchText(BOARD_NAME_URLS[source.board](source.token));
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  const name = title.replace(/jobs?$/i, "").trim();
  return { name, matches: namesMatch(name, source.name), verified: name.length > 0 };
};
