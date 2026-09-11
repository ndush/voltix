import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. Without this, Turbopack walks up looking for a
    // lockfile and finds a stray package-lock.json in the home directory.
    root: path.join(__dirname),
  },
};

export default nextConfig;
