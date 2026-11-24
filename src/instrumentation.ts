export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { requireAppSecret } = await import("@/lib/crypto");
  requireAppSecret();
}
