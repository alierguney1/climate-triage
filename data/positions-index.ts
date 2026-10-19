import fs from "node:fs/promises";
import type { PositionsData } from "@/types/positions";
import { POSITION_SOURCES } from "./position-sources";
import { checkSource, fetchPositions } from "./positions";
import { writeJsonFile } from "./utils";

const OUTPUT_FILE = "data/positions.json";
const SAMPLE_FILE = "data/fixtures/positions.json";

const copySample = async () => {
  await fs.copyFile(SAMPLE_FILE, OUTPUT_FILE);
  console.log(`Copied ${SAMPLE_FILE} to ${OUTPUT_FILE}.`);
};

// Verifies that every board token still points at the organization we expect it to.
const check = async () => {
  let failures = 0;

  for (const source of POSITION_SOURCES) {
    try {
      const result = await checkSource(source);

      if (!result.verified) {
        // The board publishes no name we can compare against, so we cannot say it is the
        // organization we expect. The source says whether that is known.
        if (source.nameUnverifiable) {
          console.log(
            `??   ${source.name} (${source.board}/${source.token}) -> the board publishes no name, checked by hand`
          );
        } else {
          failures++;
          console.log(
            `FAIL ${source.name} (${source.board}/${source.token}) -> the board publishes no name to check`
          );
        }
        continue;
      }

      if (!result.matches) {
        failures++;
      }
      console.log(
        `${result.matches ? "ok  " : "FAIL"} ${source.name} (${source.board}/${source.token}) -> ${result.name}`
      );
    } catch (e) {
      failures++;
      console.log(
        `FAIL ${source.name} (${source.board}/${source.token}) -> ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (failures > 0) {
    console.error(`${failures} source(s) do not match the expected organization.`);
    process.exit(1);
  }
};

const main = async () => {
  if (process.argv.includes("--check")) {
    await check();
    return;
  }

  // PR builds use the committed snapshot, so they don't call the job board APIs.
  if (process.argv.includes("--sample")) {
    await copySample();
    return;
  }

  const { positions, failures } = await fetchPositions();

  for (const failure of failures) {
    console.warn(`⚠️  ${failure.source}: ${failure.error}`);
  }

  // Every board being down shouldn't take the site down, we fall back to the snapshot. A
  // board that answered but has no openings is not a reason to fall back.
  const allFailed = failures.length === POSITION_SOURCES.length;
  if (allFailed) {
    console.warn(`⚠️  Every job board failed, falling back to ${SAMPLE_FILE}.`);
    await copySample();
    return;
  }

  const data: PositionsData = {
    fetchedAt: new Date().toISOString(),
    positions,
    failedSources: failures.map((failure) => failure.source)
  };
  await writeJsonFile(OUTPUT_FILE, data);

  const organizations = new Set(positions.map((position) => position.organization));
  console.log(
    `Generated ${OUTPUT_FILE}: ${positions.length} positions from ${organizations.size} organizations.`
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
