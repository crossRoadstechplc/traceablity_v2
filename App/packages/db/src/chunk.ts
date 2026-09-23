/** Batched Prisma writes with retries (shared by seed + flush). */
export async function chunkedCreateMany<T>(
  label: string,
  rows: T[],
  write: (batch: T[]) => Promise<unknown>,
  size = 50,
  log: (msg: string) => void = () => {},
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    let attempt = 0;
    for (;;) {
      try {
        await write(batch);
        break;
      } catch (e) {
        attempt++;
        if (attempt >= 4) throw e;
        log(`${label} batch ${i} retry ${attempt}… ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if ((i / size) % 5 === 0 || i + size >= rows.length) {
      log(`  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}`);
    }
  }
}
