import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { expect, test } from "vitest";

const removedWords = [
  ["n", "o", "t", "e"].join(""),
  ["r", "e", "a", "s", "o", "n"].join(""),
];

test("match review and revision sources contain no removed free-text metadata", () => {
  const files = ["src", "supabase", "tests"].flatMap((directory) => sourceFiles(join(process.cwd(), directory)));
  const violations = files.flatMap((file) => {
    const contents = readFileSync(file, "utf8");
    return removedWords
      .filter((word) => new RegExp(`\\b(?:p_)?${word}\\b`, "i").test(contents))
      .map((word) => `${relative(process.cwd(), file)}: ${word}`);
  });

  expect(violations).toEqual([]);
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === ".temp") return [];
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx", ".sql"].includes(extname(path)) ? [path] : [];
  });
}
