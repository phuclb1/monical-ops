/** D1 allows at most 100 bound parameters per query. Keep batches well under that. */
export async function insertInBatches<T extends Record<string, unknown>>(
  insert: (rows: T[]) => Promise<unknown>,
  rows: T[],
  batchSize = 6,
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    await insert(rows.slice(i, i + batchSize));
  }
}
