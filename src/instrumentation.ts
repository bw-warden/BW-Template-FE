export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { requireAppSecret } = await import("@/lib/crypto");
  requireAppSecret();
  const { getRedis } = await import("@/lib/redis");
  await getRedis();
  const { migrateSqliteIfNeeded } = await import("@/lib/migrate-sqlite");
  await migrateSqliteIfNeeded();
}
