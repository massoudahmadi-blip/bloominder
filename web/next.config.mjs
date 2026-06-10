/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a minimal self-contained server in .next/standalone for a small Docker image.
  output: 'standalone',
};

export default nextConfig;
