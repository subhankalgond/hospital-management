/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // PGlite (dev fallback DB) must not be bundled — its WASM loader needs
    // real filesystem paths.
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
  },
};

export default nextConfig;
