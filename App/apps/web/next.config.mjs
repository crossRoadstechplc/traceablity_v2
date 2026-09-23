import nextEnv from "@next/env";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

// Load monorepo App/.env so DATABASE_URL / DIRECT_URL reach the ledger API
const { loadEnvConfig } = nextEnv;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, "../..");
loadEnvConfig(appRoot);

/** Copy Prisma query engines into paths Next/Prisma search under apps/web. */
function mirrorPrismaEngines() {
  const src = path.join(appRoot, "node_modules", ".prisma", "client");
  if (!fs.existsSync(src)) return;
  const targets = [
    path.join(__dirname, "node_modules", ".prisma", "client"),
    path.join(__dirname, ".prisma", "client"),
  ];
  for (const dest of targets) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (!name.includes("query_engine") && name !== "schema.prisma") continue;
      const from = path.join(src, name);
      const to = path.join(dest, name);
      try {
        fs.copyFileSync(from, to);
      } catch {
        /* ignore locked files on Windows */
      }
    }
  }
  const engNames = fs
    .readdirSync(src)
    .filter((n) => n.includes("query_engine") && n.includes(".node"));
  const eng =
    process.platform === "win32"
      ? engNames.find((n) => n.includes("windows"))
      : engNames.find((n) => n.endsWith(".so.node"));
  if (eng) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(src, eng);
  }
}

mirrorPrismaEngines();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ankuaru/db", "@ankuaru/engine", "@ankuaru/schema", "@ankuaru/seed"],
  // Keep Prisma out of the webpack bundle so query_engine-*.node resolves from node_modules
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    // TS packages use ESM ".js" import specifiers that map to ".ts" sources
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    if (isServer) {
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        "@prisma/client",
        ".prisma/client",
      ];
    }
    return config;
  },
  async rewrites() {
    return [
      { source: "/health", destination: "/api/health" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
};
export default nextConfig;
