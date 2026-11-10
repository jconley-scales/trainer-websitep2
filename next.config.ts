import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Pages from the old Wix site that search engines still list.
  async redirects() {
    return [
      { source: "/list", destination: "/pricing", permanent: true },
      { source: "/pricing-plans/:path*", destination: "/pricing", permanent: true },
    ];
  },
};

export default nextConfig;
