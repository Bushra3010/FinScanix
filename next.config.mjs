/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // pdfkit loads its font metrics (.afm) from disk relative to its own module.
  // Bundling rewrites that path and it fails at runtime with ENOENT on
  // Helvetica.afm, so it has to stay an external require. exceljs is listed for
  // the same class of reason — both are Node-only libraries with data files.
  serverExternalPackages: ["pdfkit", "exceljs"],

  // Security headers: HSTS, no-sniff MIME, frame guard.
  // Supabase storage returns CORS-enabled signed URLs for document downloads,
  // so COOP/COEP are left off — they would block those fetches.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
