// Runs `next dev` against LOCAL Supabase and the local mail viewer only.
//
// Plain `npm run dev` can reach production: Next loads .env.development.local
// (hosted Supabase, real Gmail) ahead of .env.local. This script copies every
// variable from .env.local into the process environment, which beats any env
// file, and blanks the SMTP login so nothing can go out through Gmail.
//
//   node scripts/dev-local.mjs [project-root] [--no-email] [--port=N]
//
// --no-email switches email off entirely (default port 3001 instead of 3000).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const root = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const noEmail = args.includes("--no-email");
const portArg = args.find((a) => a.startsWith("--port="));
const port = portArg ? portArg.slice("--port=".length) : noEmail ? "3001" : "3000";

const env = { ...process.env };
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
env.SMTP_USER = "";
env.SMTP_PASS = "";
if (noEmail) env.SMTP_HOST = "";
env.SITE_URL = `http://localhost:${port}`;

if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("Refusing to start: .env.local does not point at local Supabase.");
  process.exit(1);
}

const child = spawn("npx", ["next", "dev", "--port", port], { cwd: root, env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
