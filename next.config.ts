import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader:false,
  experimental:{optimizePackageImports:["@mui/material","@mui/icons-material","recharts"]},
};

export default nextConfig;
