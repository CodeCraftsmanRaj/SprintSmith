/**
 * Defensive normalization for partially populated API responses.
 *
 * Backend routes frequently return untyped dictionaries, and fields may be
 * missing or null. Every value crossing this boundary must be checked before
 * string/array/number methods are used on it.
 */

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = asText(value);
  return text || null;
}

/** Maps an unknown payload to a typed array without ever calling map on a non-array. */
export function normalizeList<T>(
  value: unknown,
  map: (item: UnknownRecord, index: number) => T | null,
): T[] {
  const result: T[] = [];
  asArray(value).forEach((item, index) => {
    const mapped = map(asRecord(item), index);
    if (mapped !== null) result.push(mapped);
  });
  return result;
}

/** Unwraps backend envelopes such as `{runs: [...]}` and `{versions: [...]}`. */
export function unwrapList(payload: unknown, key: string): unknown[] {
  return asArray(asRecord(payload)[key]);
}

export function uniqueStrings(values: unknown): string[] {
  return Array.from(
    new Set(
      asArray(values)
        .map((value) => asText(value).trim())
        .filter(Boolean),
    ),
  );
}

/** Formats a count for display; returns an em dash when the field is absent. */
export function formatCount(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return asNumber(value).toLocaleString();
}

/** Formats a score only when a real number was returned by the backend. */
export function formatScore(value: unknown, digits = 2): string {
  const score = asNullableNumber(value);
  return score === null ? "Not evaluated" : score.toFixed(digits);
}

export function formatDate(value: unknown): string {
  const text = asText(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: unknown): string {
  const text = asText(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function humanize(value: unknown): string {
  return asText(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Extracts a safe, same-origin download filename from Content-Disposition. */
export function filenameFromContentDisposition(header: unknown, fallback: string): string {
  const value = asText(header);
  if (!value) return fallback;
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(value)?.[1];
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(value)?.[1];
  const candidate = encoded ?? plain ?? fallback;
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate.trim().replace(/^"|"$/g, ""));
  } catch {
    decoded = candidate.trim().replace(/^"|"$/g, "");
  }
  const base = decoded.split(/[\\/]/).pop() || fallback;
  const printable = Array.from(base)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("");
  return printable || fallback;
}

/** Rejects javascript:, data: and protocol-relative links from artifact content. */
export function safeExternalHref(value: unknown): string | null {
  const text = asText(value).trim();
  if (!text || /^\/\//.test(text)) return null;
  try {
    const url = new URL(text, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
