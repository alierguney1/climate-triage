"use client";

import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { useEffect, useMemo, useState } from "react";
import type { OpenPosition, PositionCategory, PositionType } from "@/types/positions";

const SEARCH_DEBOUNCE_MS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

// How many organizations the list shows before the reader asks for more.
const GROUPS_PER_PAGE = 8;

const CATEGORY_LABELS: Record<PositionCategory, string> = {
  carbon: "Carbon removal",
  energy: "Energy",
  food: "Food & agriculture",
  fuels: "Fuels",
  mobility: "Mobility",
  software: "Software"
};

const DATE_RANGES = [
  { id: "any", label: "Any time", days: 0 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "3m", label: "Last 3 months", days: 90 }
] as const;

type DateRange = (typeof DATE_RANGES)[number]["id"];
type SortOrder = "newest" | "oldest";
// "all" is every posting, "unspecified" the ones whose board doesn't tell us the kind of
// contract.
type TypeFilter = PositionType | "all" | "unspecified";

type PositionsListProps = {
  positions: OpenPosition[];
  // When the data was fetched, used to render the age of a posting on the server. The browser
  // takes over after hydration, so the age keeps up with the days.
  builtAt: string;
  // What each organization does, by source id.
  descriptions: Record<string, string>;
};

type PositionGroup = {
  organization: string;
  sourceId: string;
  positions: OpenPosition[];
};

export interface PositionFilter {
  // What the reader typed, matched against the title, the organization and the locations.
  term: string;
  remoteOnly: boolean;
  // The oldest posting that is still shown, 0 for no limit.
  cutoff: number;
  type: TypeFilter;
}

// The postings that match the filters, and how many of them the type and the categories
// hold. Kept out of the component so it can be tested without a browser.
export const filterPositions = (positions: OpenPosition[], filter: PositionFilter) => {
  const term = filter.term.trim().toLowerCase();

  const matching = positions.filter((position) => {
    if (filter.remoteOnly && !position.remote) {
      return false;
    }
    if (filter.cutoff > 0) {
      const published = new Date(position.postedAt).getTime();
      if (!Number.isNaN(published) && published < filter.cutoff) {
        return false;
      }
    }
    if (!term) {
      return true;
    }
    return [position.title, position.organization, ...position.locations]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  const matchingByType =
    filter.type === "all"
      ? matching
      : matching.filter((position) => (position.employmentType ?? "unspecified") === filter.type);

  const typeCounts = new Map<TypeFilter, number>();
  for (const position of matching) {
    const key: TypeFilter = position.employmentType ?? "unspecified";
    typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
  }

  const categoryCounts = new Map<PositionCategory, number>();
  for (const position of matchingByType) {
    categoryCounts.set(position.category, (categoryCounts.get(position.category) ?? 0) + 1);
  }

  return { matching, matchingByType, typeCounts, categoryCounts };
};

// "3 days ago", "2 weeks ago", "5 months ago".
export const formatAge = (date: string, now: number) => {
  const published = new Date(date).getTime();
  if (Number.isNaN(published)) {
    return "";
  }
  const days = Math.floor((now - published) / DAY_MS);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 14) {
    return `${days} days ago`;
  }
  if (days < 60) {
    return `${Math.round(days / 7)} weeks ago`;
  }
  if (days < 365) {
    return `${Math.round(days / 30)} months ago`;
  }
  const years = Math.round(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
};

const pillClass = (active: boolean) =>
  classNames("rounded-sm border px-3 py-2 text-sm", {
    "border-primary bg-primary text-white": active,
    "border-silver-100 transition-all hover:border-primary hover:text-primary": !active
  });

export const PositionsList = ({ positions, builtAt, descriptions }: PositionsListProps) => {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<PositionCategory | "all">("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [range, setRange] = useState<DateRange>("any");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [now, setNow] = useState(() => new Date(builtAt).getTime());
  const [visibleGroups, setVisibleGroups] = useState(GROUPS_PER_PAGE);

  // Debounce the search: it matches against the title, the organization and the locations of
  // every position.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // The age of a posting is counted from the time the browser has, not from the time the site
  // was built, so it keeps up while the page stays open.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const categories = useMemo(
    () => [...new Set(positions.map((position) => position.category))].sort(),
    [positions]
  );

  const types = useMemo(
    () =>
      [
        ...new Set(positions.map((position) => position.employmentType).filter(Boolean))
      ].sort() as PositionType[],
    [positions]
  );

  const rangeDays = DATE_RANGES.find((option) => option.id === range)?.days ?? 0;

  // The postings that match everything but the category, so the counts next to the categories
  // tell how many are left in each of them.
  const { matching, matchingByType, typeCounts, categoryCounts } = useMemo(
    () =>
      filterPositions(positions, {
        term: search,
        remoteOnly,
        cutoff: rangeDays > 0 ? now - rangeDays * DAY_MS : 0,
        type
      }),
    [positions, search, remoteOnly, rangeDays, type, now]
  );

  const filtered = useMemo(
    () =>
      category === "all"
        ? matchingByType
        : matchingByType.filter((position) => position.category === category),
    [matchingByType, category]
  );

  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) =>
      sort === "newest"
        ? b.postedAt.localeCompare(a.postedAt)
        : a.postedAt.localeCompare(b.postedAt)
    );

    const grouped = new Map<string, PositionGroup>();

    for (const position of sorted) {
      const group = grouped.get(position.organization);
      if (group) {
        group.positions.push(position);
        continue;
      }
      grouped.set(position.organization, {
        organization: position.organization,
        sourceId: position.sourceId,
        positions: [position]
      });
    }

    return [...grouped.values()].sort((a, b) => a.organization.localeCompare(b.organization));
  }, [filtered, sort]);

  const isFiltered =
    search.trim().length > 0 ||
    category !== "all" ||
    type !== "all" ||
    remoteOnly ||
    range !== "any";

  // A filtered list is short enough to show in full, an unfiltered one is not.
  const shownGroups = isFiltered ? groups : groups.slice(0, visibleGroups);
  const hasMoreGroups = groups.length > shownGroups.length;

  return (
    <div>
      <div className="not-prose mt-6 flex flex-wrap items-center gap-3">
        {/* biome-ignore lint/a11y/useSemanticElements: role="search" is equivalent to <search> and supported more widely */}
        <div className="relative flex grow rounded-md" role="search">
          <label htmlFor="positions-search" className="sr-only">
            Search positions
          </label>
          <input
            id="positions-search"
            type="search"
            className="block w-full rounded-md border border-silver-100 bg-transparent px-4 py-2 pl-11 text-sm text-gray-900 dark:text-silver-500"
            placeholder="Search in title, organization, location..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 flex items-center pl-4">
            <FontAwesomeIcon
              icon={faSearch}
              className="text-gray-900 dark:text-silver-500"
              aria-hidden="true"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-silver-500">
          <input
            type="checkbox"
            className="rounded border-silver-100 text-primary focus:ring-primary"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
          />
          Remote only
        </label>
      </div>

      <div className="not-prose mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-900 dark:text-silver-500">Posted</span>
        {DATE_RANGES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setRange(option.id)}
            className={pillClass(range === option.id)}
          >
            {option.label}
          </button>
        ))}
        <span className="ms-2 text-sm text-gray-900 dark:text-silver-500">Sort</span>
        <span className="flex gap-3">
          <button
            type="button"
            onClick={() => setSort("newest")}
            className={pillClass(sort === "newest")}
          >
            Newest
          </button>
          <button
            type="button"
            onClick={() => setSort("oldest")}
            className={pillClass(sort === "oldest")}
          >
            Oldest
          </button>
        </span>
      </div>

      <div className="not-prose mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-900 dark:text-silver-500">Type</span>
        <button type="button" onClick={() => setType("all")} className={pillClass(type === "all")}>
          Any type ({matching.length})
        </button>
        {types.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            className={pillClass(type === value)}
          >
            {value} ({typeCounts.get(value) ?? 0})
          </button>
        ))}
        {(typeCounts.get("unspecified") ?? 0) > 0 ? (
          <button
            type="button"
            onClick={() => setType("unspecified")}
            className={pillClass(type === "unspecified")}
          >
            Not specified ({typeCounts.get("unspecified")})
          </button>
        ) : null}
      </div>

      <div className="not-prose mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={pillClass(category === "all")}
        >
          All ({matchingByType.length})
        </button>
        {categories.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCategory(value)}
            className={pillClass(category === value)}
          >
            {CATEGORY_LABELS[value]} ({categoryCounts.get(value) ?? 0})
          </button>
        ))}
      </div>

      <p className="not-prose mt-4 text-sm text-gray-900 dark:text-silver-500" aria-live="polite">
        {filtered.length} of {positions.length} positions
      </p>

      {shownGroups.length === 0 ? (
        <p className="mt-4">No position matches the search.</p>
      ) : (
        shownGroups.map((group) => (
          <details key={group.organization} open={isFiltered}>
            <summary>
              {group.organization} ({group.positions.length})
            </summary>
            {descriptions[group.sourceId] ? (
              <p className="not-prose mb-2 mt-1 text-sm text-gray-900 dark:text-silver-500">
                {descriptions[group.sourceId]}
              </p>
            ) : null}
            <ul>
              {group.positions.map((position) => {
                const age = formatAge(position.postedAt, now);
                return (
                  <li key={position.id}>
                    <a href={position.url} target="_blank" rel="noreferrer">
                      {position.title}
                    </a>{" "}
                    — {position.locations.join(", ")}
                    {position.employmentType ? ` (${position.employmentType})` : ""}
                    {position.remote ? ", remote" : ""}
                    {age ? (
                      <>
                        {" — posted "}
                        <time
                          dateTime={position.postedAt.slice(0, 10)}
                          title={position.postedAt.slice(0, 10)}
                        >
                          {age}
                        </time>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ))
      )}

      {hasMoreGroups ? (
        <div className="not-prose mt-4">
          <button
            type="button"
            onClick={() => setVisibleGroups((count) => count + GROUPS_PER_PAGE)}
            className="rounded-sm border border-silver-100 px-3 py-2 text-sm hover:border-primary hover:text-primary"
          >
            Show more organizations ({groups.length - shownGroups.length} left)
          </button>
        </div>
      ) : null}
    </div>
  );
};
