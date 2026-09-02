const basePath = process.env.CV_BUILDER_BASE_PATH ?? "";

const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  turbopack: { root: process.cwd() }
};

export default nextConfig;
