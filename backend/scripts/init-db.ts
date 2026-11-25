import { closeDatabase, ensureDbInitialized, getDbEngineMode } from "../src/db";

async function main() {
  console.log(`[Banatier Backend] Initializing PostgreSQL schema & seed (${getDbEngineMode()})...`);
  await ensureDbInitialized();
  await closeDatabase();
  console.log("[Banatier Backend] Database ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[Banatier Backend] Failed to initialize database:", err);
  process.exit(1);
});
