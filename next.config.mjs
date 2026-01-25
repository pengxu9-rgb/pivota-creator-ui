import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
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
          "https://web-production-fedb.up.railway.app/accounts/:path*",
      },
      // Proxy UGC endpoints (reviews/questions) as first-party too.
      {
        source: "/buyer/reviews/v1/:path*",
        destination:
          "https://web-production-fedb.up.railway.app/buyer/reviews/v1/:path*",
      },
      {
        source: "/questions",
        destination: "https://web-production-fedb.up.railway.app/questions",
      },
    ];
  },
};

export default nextConfig;
