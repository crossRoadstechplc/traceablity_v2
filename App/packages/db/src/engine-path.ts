/**
 * Point Prisma at the native query engine in the monorepo root node_modules.
 * Next.js webpack rewrites __dirname, so auto-discovery fails on Windows.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function engineDirs(): string[] {
  const dirs: string[] = [];
  try {
    const pkg = require.resolve("@prisma/client/package.json");
    // .../node_modules/@prisma/client/package.json → .../node_modules/.prisma/client
    dirs.push(path.join(path.dirname(pkg), "..", ".prisma", "client"));
  } catch {
    /* ignore */
  }
  const cwd = process.cwd();
  dirs.push(
    path.join(cwd, "node_modules", ".prisma", "client"),
    path.join(cwd, "..", "node_modules", ".prisma", "client"),
    path.join(cwd, "..", "..", "node_modules", ".prisma", "client"),
  );
  return dirs;
}

function pickEngineForPlatform(dir: string, names: string[]): string | undefined {
  const engines = names.filter(
    (n) => n.includes("query_engine") && n.includes(".node"),
  );
  if (!engines.length) return undefined;

  let preferred: string | undefined;
  if (process.platform === "win32") {
    preferred =
      engines.find((n) => n.includes("windows") && n.endsWith(".dll.node")) ??
      engines.find((n) => n.endsWith(".dll.node"));
  } else if (process.platform === "darwin") {
    preferred = engines.find((n) => n.includes("darwin"));
  } else {
    // Linux (Vercel / local)
    preferred =
      engines.find((n) => n.includes("debian") && n.endsWith(".so.node")) ??
      engines.find((n) => n.endsWith(".so.node"));
  }

  const chosen = preferred ?? engines[0];
  return chosen ? path.join(dir, chosen) : undefined;
}

function findQueryEngineLibrary(): string | undefined {
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    const existing = process.env.PRISMA_QUERY_ENGINE_LIBRARY;
    if (fs.existsSync(existing)) {
      // Reject wrong-platform engines left in env from a previous process
      const base = path.basename(existing);
      if (process.platform === "win32" && base.endsWith(".so.node")) {
        /* fall through and re-resolve */
      } else if (process.platform !== "win32" && base.endsWith(".dll.node")) {
        /* fall through */
      } else {
        return existing;
      }
    }
  }
  for (const dir of engineDirs()) {
    if (!fs.existsSync(dir)) continue;
    const found = pickEngineForPlatform(dir, fs.readdirSync(dir));
    if (found) return found;
  }
  return undefined;
}

/** Call before `new PrismaClient()`. Safe to call repeatedly. */
export function ensurePrismaEnginePath(): string | undefined {
  const engine = findQueryEngineLibrary();
  if (engine) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
  }
  return engine;
}
