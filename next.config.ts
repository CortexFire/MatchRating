import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    instantNavigationDevToolsToggle: true,
    turbopackFileSystemCacheForDev: false,
  },
};

export default withWorkflow(nextConfig);
