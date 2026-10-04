/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mohar/core"],
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};
export default nextConfig;
