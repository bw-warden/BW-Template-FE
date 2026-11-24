export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { requireAppSecret } = await import("@/lib/crypto");
  requireAppSecret();
  const { getRedis } = await import("@/lib/redis");
  await getRedis();
  const { migrateSqliteIfNeeded } = await import("@/lib/migrate-sqlite");
  await migrateSqliteIfNeeded();

  // Keep `bw serve` warm so Clients/Provision do not pay a cold unlock (~15s+).
  // Set VAULT_KEEPALIVE_MS=0 to disable; default 4 minutes.
  const raw = process.env.VAULT_KEEPALIVE_MS;
  const intervalMs =
    raw === undefined || raw === ""
      ? 240_000
      : Number(raw);
  if (intervalMs > 0) {
    const { startVaultKeepaliveLoop } = await import("@/lib/bitwarden/vault");
    startVaultKeepaliveLoop(intervalMs);
  }
}
