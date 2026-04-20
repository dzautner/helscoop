import pino from "pino";

const IS_DEV = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(IS_DEV
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {
        // Production: JSON output, machine-readable
        formatters: {
          level(label) {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

export default logger;
