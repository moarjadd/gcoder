import { createRequire } from "node:module"
const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  productionBrowserSourceMaps: true,

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      three: require.resolve("three"),
    }
    return config
  },
}

export default nextConfig
