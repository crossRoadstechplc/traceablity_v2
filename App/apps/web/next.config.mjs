/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ankuaru/engine", "@ankuaru/schema", "@ankuaru/seed"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      { source: "/health", destination: "/api/health" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
};
export default nextConfig;
