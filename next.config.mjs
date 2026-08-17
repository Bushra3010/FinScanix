/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // pdfkit loads its font metrics (.afm) from disk relative to its own module.
  // Bundling rewrites that path and it fails at runtime with ENOENT on
  // Helvetica.afm, so it has to stay an external require. exceljs is listed for
  // the same class of reason — both are Node-only libraries with data files.
  serverExternalPackages: ["pdfkit", "exceljs"],
};

export default nextConfig;
