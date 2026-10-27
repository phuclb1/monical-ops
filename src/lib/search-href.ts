export function searchHref(action: string, entries: Iterable<[string, FormDataEntryValue]>) {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) params.append(key, text);
  }
  const query = params.toString();
  return query ? `${action}?${query}` : action;
}
