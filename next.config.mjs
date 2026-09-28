/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // PGlite (dev fallback DB) must not be bundled — its WASM loader needs
    // real filesystem paths.
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
  },
  // Ship the trained ML model JSONs with the server bundle (API routes read
  // them at runtime from the filesystem).
  outputFileTracingIncludes: {
    "/api/ml/**": ["./ml/*.json"],
    "/api/nlp/**": ["./ml/*.json"],
  },
};

export default nextConfig;
