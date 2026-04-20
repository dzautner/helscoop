const webpack = require("webpack");
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    viewTransition: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // manifold-3d's Emscripten loader conditionally imports node:module at runtime.
      // Webpack statically parses it, so we strip the node: prefix and provide a
      // browser-safe empty fallback.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        module: false,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

// Wrap with Sentry only when DSN is configured (avoids build errors in dev
// without a Sentry account).
const hasSentryDsn = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

module.exports = hasSentryDsn
  ? withSentryConfig(nextConfig, {
      // Suppress Sentry build output in CI
      silent: true,
      // Disable source map upload unless SENTRY_AUTH_TOKEN is set
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  : nextConfig;
