import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    // Proxy first-party /accounts/* calls from creator.pivota.cc
    // to the Railway accounts backend so that login cookies are
    // first-party on mobile browsers.
    return [
      {
        source: "/accounts/:path*",
        destination:
          "https://web-production-fedb.up.railway.app/accounts/:path*",
      },
    ];
  },
};

export default nextConfig;
