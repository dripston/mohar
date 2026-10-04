/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mohar/core"],
  reactStrictMode: true,
  // e2e builds into its own folder so a running `next dev` is never clobbered
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};
export default nextConfig;
