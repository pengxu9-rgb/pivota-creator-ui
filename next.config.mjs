import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloud Run: self-contained server bundle (.next/standalone/server.js)
  output: "standalone",
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async rewrites() {
    // Proxy first-party /accounts/* calls from creator.pivota.cc
    // to the Railway accounts backend so that login cookies are
    // first-party on mobile browsers.
    return [
      {
        source: "/accounts/:path*",
        destination:
          "https://api.pivota.cc/accounts/:path*",
      },
      // Proxy UGC endpoints (reviews/questions) as first-party too.
      {
        source: "/buyer/reviews/v1/:path*",
        destination:
          "https://api.pivota.cc/buyer/reviews/v1/:path*",
      },
      {
        source: "/questions",
        destination: "https://api.pivota.cc/questions",
      },
      {
        source: "/questions/:path*",
        destination: "https://api.pivota.cc/questions/:path*",
      },
    ];
  },
};

export default nextConfig;
