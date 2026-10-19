export const IN_QUERY_CHUNK = 80;

export async function mapInChunks<T, R>(ids: T[], load: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const rows: R[] = [];
  for (let index = 0; index < unique.length; index += IN_QUERY_CHUNK) {
    rows.push(...(await load(unique.slice(index, index + IN_QUERY_CHUNK))));
  }
  return rows;
}
