import fs from "node:fs/promises";
import slugify from "slugify";
import type { Data } from "@/types/types";

export const extendedSlugify = (text: string): string => {
  // symbols to replace with slugify
  slugify.extend({
    "#": "sharp",
    "+": "plus"
  });

  return slugify(text, {
    lower: true,
    strict: true,
    locale: "en"
  });
};

export const writeJsonFile = async (path: string, data: unknown) => {
  await fs.writeFile(path, JSON.stringify(data));
  console.log(`Generated ${path}`);
};

export const writeDataFile = async (data: Data) => {
  await writeJsonFile("data/data.json", data);
};

export const chunkArray = <T>(arr: T[], chunkSize: number): T[][] => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize) as never);
  }
  return chunks;
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
