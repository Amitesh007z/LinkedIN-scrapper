export function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

export function normalizeDate(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  const monthYear = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (monthYear) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return `${monthYear[2]}-${String(months.indexOf(monthYear[1].toLowerCase()) + 1).padStart(2, '0')}`;
  }

  const year = text.match(/\b(19|20)\d{2}\b/);
  return year ? year[0] : text;
}

export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
