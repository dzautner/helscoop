/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    viewTransition: true,
  },
};
module.exports = nextConfig;
