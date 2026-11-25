import "./env";
import http from "node:http";
import { closeDatabase, ensureDbInitialized, getDbEngineMode } from "./db";
import { handleApiRequest } from "./app";
import { getServerInstanceId } from "./store-service";

const port = Number(process.env.PORT || 4000);

async function startServer() {
  await ensureDbInitialized();

  const server = http.createServer((req, res) => {
    void handleApiRequest(req, res);
  });

  server.on("error", async (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(
        `[Banatier Backend] Port ${port} sudah digunakan oleh proses backend lain yang masih aktif.`
      );
      await closeDatabase();
      process.exit(0);
    }
    console.error("[Banatier Backend] Server error:", err);
    await closeDatabase();
    process.exit(1);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(
      `[Banatier Backend] Running on http://127.0.0.1:${port} | Node=${getServerInstanceId()} | DB=${getDbEngineMode()}`
    );
  });

  let shuttingDown = false;
  const gracefulShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => void gracefulShutdown());
  process.on("SIGTERM", () => void gracefulShutdown());
}

startServer().catch((err) => {
  console.error("[Banatier Backend] Failed to start:", err);
  process.exit(1);
});
