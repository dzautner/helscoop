import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    // Capture 10% of traces in production for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    // Replay only on errors in production
    replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
