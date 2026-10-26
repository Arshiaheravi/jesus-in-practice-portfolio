export interface SelectablePractice {
  id: string;
  source: "bible" | "book-of-mormon";
  category: string;
}

export function eligiblePractices<T extends SelectablePractice>(
  collection: readonly T[],
  source: "bible" | "book-of-mormon" | "both",
  topics: readonly string[],
): T[] {
  return collection.filter(
    (practice) =>
      (source === "both" || practice.source === source) &&
      (topics.length === 0 || topics.includes(practice.category)),
  );
}

export function dailyPractice<T extends SelectablePractice>(
  collection: readonly T[],
  localDate: string,
): T | undefined {
  if (!collection.length) return undefined;
  const stamp = Date.parse(`${localDate}T12:00:00Z`);
  const day = Number.isNaN(stamp) ? 0 : Math.floor(stamp / 86_400_000);
  return collection[((day % collection.length) + collection.length) % collection.length];
}

export function randomPractice<T extends SelectablePractice>(
  collection: readonly T[],
  currentId: string,
  random: () => number = Math.random,
): T | undefined {
  const alternatives = collection.filter((practice) => practice.id !== currentId);
  const choices = alternatives.length ? alternatives : collection;
  if (!choices.length) return undefined;
  const sample = random();
  const value = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON) : 0;
  return choices[Math.floor(value * choices.length)];
}

export function practiceSessionKey(source: string, topics: readonly string[], localDate: string) {
  return `${source}:${Array.from(new Set(topics)).sort().join("|")}:${localDate}`;
}
