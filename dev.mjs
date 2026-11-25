import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

function startService(name, dir) {
  const child = spawn(npmCmd, ["run", "dev"], {
    cwd: dir,
    stdio: "inherit",
    shell: isWin,
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] berhenti dengan kode ${code}`);
    }
  });
  return child;
}

console.log("Menjalankan Banatier Backend (http://localhost:4000) & Frontend (http://localhost:3000)...");
const backendProc = startService("backend", "backend");
const frontendProc = startService("frontend", "frontend");

function shutdown() {
  backendProc.kill();
  frontendProc.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
