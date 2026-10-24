/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // PGlite (dev fallback DB) must not be bundled — its WASM loader needs
    // real filesystem paths.
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
    outputFileTracingIncludes: {
      "/api/ml/**": ["./ml/*.json"],
      "/api/nlp/**": ["./ml/*.json"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
