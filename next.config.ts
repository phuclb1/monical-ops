import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["html2canvas", "jspdf"],
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;

void import("@opennextjs/cloudflare")
  .then((mod) => mod.initOpenNextCloudflareForDev())
  .catch(() => {
    // next dev still works without Wrangler bindings
  });
