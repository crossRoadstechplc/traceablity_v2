import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ensurePrismaEnginePath } from "./engine-path.js";

ensurePrismaEnginePath();

function parseEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

/** Load App/.env when Next runs from apps/web before Prisma reads URLs. */
export function loadMonorepoEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../../../.env"),
  ];
  for (const p of candidates) parseEnvFile(p);
}

loadMonorepoEnv();

/**
 * URL selection:
 * - Vercel serverless: prefer DATABASE_URL (pooler :6543) — session DIRECT_URL
 *   often fails with P1001 / IPv6 from the edge network.
 * - Local / CLI seed: prefer DIRECT_URL (session :5432) for reliable bulk writes.
 * Append connect_timeout so failures fail fast instead of hanging.
 */
function databaseUrl(): string | undefined {
  loadMonorepoEnv();
  const onVercel = process.env.VERCEL === "1";
  const raw = onVercel
    ? process.env.DATABASE_URL || process.env.DIRECT_URL
    : process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (raw.includes("connect_timeout=")) return raw;
  return raw.includes("?")
    ? `${raw}&connect_timeout=15`
    : `${raw}?connect_timeout=15`;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
};

function createClient(url: string | undefined): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Lazy singleton — created on first use so Next has loaded env vars. */
export function getPrisma(): PrismaClient {
  loadMonorepoEnv();
  ensurePrismaEnginePath();
  const url = databaseUrl();
  if (!globalForPrisma.prisma || globalForPrisma.prismaUrl !== url) {
    void globalForPrisma.prisma?.$disconnect().catch(() => {});
    globalForPrisma.prisma = createClient(url);
    globalForPrisma.prismaUrl = url;
  }
  return globalForPrisma.prisma;
}

/** @deprecated use getPrisma() — kept for existing imports */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
