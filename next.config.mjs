const isProduction = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Produces a self-contained .next/standalone directory — node_modules are
  // pruned to only what is needed at runtime, cutting the Railway Docker image
  // from ~600 MB to ~120 MB and halving cold-start time.
  output: "standalone",

  // Gzip all responses. Railway doesn't add a proxy-level compressor by
  // default, so this saves 60-80% on HTML and JSON payload size.
  compress: true,

  // pdfkit loads its font metrics (.afm) from disk relative to its own module.
  // Bundling rewrites that path and it fails at runtime with ENOENT on
  // Helvetica.afm, so it has to stay an external require. exceljs is listed for
  // the same class of reason — both are Node-only libraries with data files.
  serverExternalPackages: ["pdfkit", "exceljs"],

  // Tell webpack not to try to bundle the Prisma query engine — it is a native
  // binary that needs to stay on disk next to the standalone output.
  webpack(config) {
    config.externals = config.externals ?? [];
    if (Array.isArray(config.externals)) {
      config.externals.push({ "@prisma/client": "@prisma/client" });
    }
    return config;
  },

  // Security headers: HSTS, no-sniff MIME, frame guard.
  // Supabase storage returns CORS-enabled signed URLs for document downloads,
  // so COOP/COEP are left off — they would block those fetches.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Tell browsers and Railway's edge to cache static assets aggressively.
        // A production build content-hashes every chunk filename, so a new build
        // is a new URL and "immutable" is safe.
        //
        // Development is the opposite: chunks are served at stable unhashed
        // paths (/_next/static/chunks/webpack.js), so the same header pins the
        // first build's JavaScript in the browser for a year. Every rebuild then
        // leaves the page running old code against a new server — which surfaces
        // as "Server Action … was not found on the server" on any form, since
        // action ids are rebuilt while the cached bundle still sends the old one.
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: isProduction
              ? "public, max-age=31536000, immutable"
              : "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
