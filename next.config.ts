import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // The service worker is useless in dev and makes hot reload confusing.
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  images: {
    // Exercise media is hotlinked from the dataset repo. Serve it untouched at
    // its native 180x180 — the Gym Visual terms permit that resolution only, so
    // this must NOT go through Next's resizing optimizer.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/hasaneyldrm/exercises-dataset/**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
