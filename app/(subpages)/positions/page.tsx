import type { Metadata } from "next";
import { getPositionOrganizations, getPositions } from "@/app/positions-loader";
import { PositionsList } from "@/components/Positions/PositionsList";
import { BOARD_NAMES, POSITION_SOURCES } from "@/data/position-sources";
import { genPageMetadata } from "../../seo";

export function generateMetadata(): Metadata {
  return genPageMetadata({
    title: "Open Positions",
    description:
      "Open roles at organizations working on climate and sustainability, collected from the public job board APIs they use for their own careers pages."
  });
}

const formatDate = (date: string) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().split("T")[0];
};

// The boards the organizations run their job boards on, by name.
const boardNames = () => {
  const boards = [...new Set(POSITION_SOURCES.map((source) => source.board))].map(
    (board) => BOARD_NAMES[board]
  );
  if (boards.length <= 1) {
    return boards.join("");
  }
  return `${boards.slice(0, -1).join(", ")} and ${boards[boards.length - 1]}`;
};

export default function Page() {
  const { fetchedAt, positions, failedSources } = getPositions();
  const organizations = getPositionOrganizations();
  const sources = new Map(POSITION_SOURCES.map((source) => [source.id, source]));

  return (
    <article className="prose prose-lg mb-10 lg:prose-xl dark:prose-invert">
      <h1>Open Positions</h1>
      <p className="lead">
        Open roles at organizations working on climate and sustainability. Every entry links to the
        original posting, so you apply on the organization&apos;s own job board.
      </p>
      <p>
        {positions.length} positions from {organizations.length} organizations, last updated{" "}
        {formatDate(fetchedAt)}.
      </p>

      {failedSources.length > 0 ? (
        <p className="not-prose text-sm text-gray-900 dark:text-silver-500">
          {failedSources.length} job board(s) did not answer during the last update, the listings of{" "}
          {failedSources.join(", ")} are missing from this page.
        </p>
      ) : null}

      <PositionsList
        positions={positions}
        builtAt={fetchedAt}
        descriptions={Object.fromEntries(
          POSITION_SOURCES.map((source) => [source.id, source.description])
        )}
      />

      <h2>How this list is built</h2>
      <p>
        The organizations are on the list because they work on the climate transition, not because
        they asked us to be here. We read the public job board APIs the organizations already use
        for their own careers pages — {boardNames()} — so nothing is scraped and no application data
        is involved. Only the title, the locations, the date and a link to the original posting are
        published, the job descriptions stay with the organization that wrote them.
      </p>
      <p>
        What you see is the set of openings of those organizations, from engineering and operations
        to sales and office roles. Job boards keep postings around long after they were filled, so a
        posting that has been on a board for more than a year is left off.
      </p>
      <p>
        The list is fetched while the site is built, which happens every hour, so it stays close to
        what the job boards show. If a job board API is unreachable, the build keeps the last
        snapshot it has instead of failing, and the page says which organizations are missing.
      </p>
      <p>
        The organizations are curated by hand, and every entry is checked against the
        organization&apos;s own board, so a board that moves to another system is noticed instead of
        silently showing the wrong postings.
      </p>

      <h2>Sources</h2>
      <ul>
        {organizations.map((organization) => {
          const source = sources.get(organization.sourceId);
          return (
            <li key={organization.sourceId}>
              <a href={source?.url ?? organization.organization} target="_blank" rel="noreferrer">
                {organization.organization}
              </a>{" "}
              — {source?.description ?? organization.organization} ({organization.source} job board)
            </li>
          );
        })}
      </ul>

      <h2>Data and licensing</h2>
      <p>
        The postings belong to the organizations that published them. Greenhouse documents its job
        board API as public data that needs no authentication, and Ashby and Lever expose the same
        for the boards they host. We publish the listings as links, without the descriptions, and
        each organization keeps the rights to its own text.
      </p>
    </article>
  );
}
