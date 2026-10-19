// The applicant tracking systems the sources run on. All three expose a public,
// unauthenticated JSON API for the job board they host.
export type PositionBoard = "ashby" | "greenhouse" | "lever";

// A rough area of the climate transition, used to group and filter the listings.
export type PositionCategory = "carbon" | "energy" | "food" | "fuels" | "mobility" | "software";

// The kind of contract, normalized from what the job boards report.
export type PositionType = "Contract" | "Full-time" | "Intern" | "Part-time" | "Temporary";

export interface PositionSource {
  // Slug of the source, used to build position ids and to link back to the source.
  id: string;
  // Name of the organization, as it appears on its own job board.
  name: string;
  // What the organization does, in one line.
  description: string;
  // The job board the positions are listed on.
  url: string;
  // The applicant tracking system the board runs on.
  board: PositionBoard;
  // The board token, i.e. the path segment of the job board URL.
  token: string;
  category: PositionCategory;
  // Set when the board publishes no organization name, so the check cannot verify it.
  // Keep the list short and drop the entry when the board starts publishing a name.
  nameUnverifiable?: boolean;
}

export interface OpenPosition {
  // Unique across all sources, e.g. "form-energy-1a2b3c".
  id: string;
  title: string;
  organization: string;
  // Link to the original posting.
  url: string;
  // The locations the role is open in. A role can be listed once per location.
  locations: string[];
  remote: boolean;
  // The kind of contract. Not every board tells us, Greenhouse doesn't.
  employmentType?: PositionType;
  // ISO timestamp of the first publication of the posting, always in UTC, e.g.
  // "2026-10-19T16:04:27.197Z". The boards report it in their own time zone, we convert it,
  // so the values can be compared and sorted as text.
  postedAt: string;
  category: PositionCategory;
  // The applicant tracking system the posting came from.
  source: PositionBoard;
  // The id of the PositionSource the posting came from.
  sourceId: string;
}

export interface PositionsData {
  // When the data was fetched from the job board APIs.
  fetchedAt: string;
  positions: OpenPosition[];
  // The organizations whose board did not answer during the last update. Their listings are
  // missing from the data, empty when every board answered.
  failedSources: string[];
}
