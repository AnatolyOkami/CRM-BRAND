import type { DealSource, LeadSource } from "../types";

/** The label of a source: the one of the list, or the code itself when the list does not know it. */
export const getSourceLabel = (
  sources: Pick<LeadSource, "code" | "label">[],
  code: DealSource,
  fallback?: string,
): string =>
  sources.find((source) => source.code === code)?.label ?? fallback ?? code;

/**
 * The sources a person may pick for a deal: the active ones, plus the source the deal already has,
 * so that an old deal with a retired source still shows its value in the list.
 */
export const getSelectableSources = (
  sources: LeadSource[],
  current?: DealSource,
): LeadSource[] =>
  [...sources]
    .filter((source) => source.is_active || source.code === current)
    .sort((a, b) => a.position - b.position);

/** The next free position for a new source: after the last active one. */
export const nextSourcePosition = (sources: LeadSource[]): number =>
  sources
    .filter((source) => source.is_active)
    .reduce((max, source) => Math.max(max, source.position), 0) + 10;

/** Turns a label into a code of a source: latin letters, digits and hyphens, at most 40 characters. */
export const slugifySourceCode = (label: string): string => {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  return label
    .toLowerCase()
    .split("")
    .map((char) => map[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
};
