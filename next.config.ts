import {withSentryConfig} from "@sentry/nextjs";
import type { NextConfig } from "next";

const contentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.plaid.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://cdn.plaid.com;
  font-src 'self' data:;
  connect-src 'self' https://*.plaid.com https://cloud.appwrite.io https://*.appwrite.io https://*.sentry.io https://*.ingest.sentry.io;
  frame-src 'self' https://cdn.plaid.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
// For all available options, see:
// https://github.com/getsentry/sentry-webpack-plugin#options

org: "klh-wl",
project: "javascript-nextjs",

// Only print logs for uploading source maps in CI
silent: !process.env.CI,

// For all available options, see:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

// Upload a larger set of source maps for prettier stack traces (increases build time)
widenClientFileUpload: true,

// Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
// This can increase your server load as well as your hosting bill.
// Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
// side errors will fail.
// tunnelRoute: "/monitoring",

// Hides source maps from generated client bundles
sourcemaps: {
  disable: true,
},

// Automatically tree-shake Sentry logger statements and annotate React components via the webpack namespace
webpack: {
  treeshake: {
    removeDebugLogging: true,
  },
  reactComponentAnnotation: {
    enabled: true,
  },
  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
},
});
