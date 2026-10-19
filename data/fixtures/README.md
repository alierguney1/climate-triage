# Sample data

`ecosystems-sample.json` is a trimmed copy of the
[ecosyste.ms OST API](https://ost.ecosyste.ms/api/v1/issues/openclimateaction?per_page=300) response.
`pnpm prebuild:sample` builds the site from it instead of calling the API. PR builds use it, so
they don't send requests to ecosyste.ms and give the same result on every run.

It holds 3 projects per category, the minimum for a category to get a page, with at most 3
issues each. It keeps only the fields `data/index.ts` reads, so it contains no issue bodies or
issue authors.

## License

This file is derived from data by [ecosyste.ms](https://ecosyste.ms), licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and is shared under the same
license. It has been trimmed to a subset of projects, issues and fields.

## Regenerating

Requires [jq](https://jqlang.org/). If `data/index.ts` starts reading a new field, add it below.

```sh
curl -s "https://ost.ecosyste.ms/api/v1/issues/openclimateaction?per_page=300" | jq '
  sort_by(.id)
  | map(select((.issues | length) > 0))
  | group_by(.category) | map(.[:3]) | flatten | sort_by(.id)
  | map({
      id, name, description, url, language, category, has_new_issues, monthly_downloads,
      repository: (.repository | {owner, stargazers_count, license, pushed_at, topics, created_at}),
      issues: (.issues[:3] | map({uuid, number, title, labels, comments_count, created_at, html_url}))
    })' > data/fixtures/ecosystems-sample.json
```

# Positions snapshot

`positions.json` is a copy of `data/positions.json`, the file `pnpm prebuild` generates from the
public job board APIs of the organizations listed in `data/position-sources.ts`. `pnpm
prebuild:sample` copies it into place instead of calling the APIs, so PR builds don't send requests
to the job boards and give the same result on every run. It is also the fallback when a job board
API is unreachable while the site is built.

It holds the title, the locations, the date and a link to the original posting of every open
position. No job description is copied.

## License

The postings belong to the organizations that published them, we only publish a link to them.
[Greenhouse documents its job board API](https://developers.greenhouse.io/job-board.html) as
public data that needs no authentication, and Ashby and Lever expose the same for the boards they
host. Every entry links to the organization that posted it.

## Regenerating

The `Refresh Positions Snapshot` workflow does this every hour, and only commits a snapshot that
was fetched from every board. To do it by hand:

```sh
pnpm positions:fetch                    # writes data/positions.json from the job board APIs
cp data/positions.json data/fixtures/positions.json
```

To check that every board still belongs to the organization we expect it to:

```sh
pnpm positions:check
```

A board that publishes no organization name cannot be checked by the script. Those sources say so
with `nameUnverifiable` in `data/position-sources.ts`, and the check reports them as `??` instead
of pretending they are verified.

