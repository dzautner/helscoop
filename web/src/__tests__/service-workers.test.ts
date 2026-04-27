import { readFileSync } from "node:fs";
import path from "node:path";
import * as vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerHandler = (event: Record<string, unknown>) => void;

interface WorkerHarness {
  listeners: Record<string, WorkerHandler[]>;
  self: {
    skipWaiting: ReturnType<typeof vi.fn>;
    clients: {
      claim: ReturnType<typeof vi.fn>;
      matchAll: ReturnType<typeof vi.fn>;
      openWindow: ReturnType<typeof vi.fn>;
    };
    registration: {
      showNotification: ReturnType<typeof vi.fn>;
    };
    location: {
      origin: string;
    };
  };
}

function loadWorkerScript(
  filename: "sw.js" | "push-sw.js",
  overrides: Record<string, unknown> = {},
): WorkerHarness {
  const listeners: Record<string, WorkerHandler[]> = {};
  const clients = {
    claim: vi.fn(),
    matchAll: vi.fn().mockResolvedValue([]),
    openWindow: vi.fn().mockResolvedValue(undefined),
  };
  const self = {
    skipWaiting: vi.fn(),
    clients,
    registration: {
      showNotification: vi.fn().mockResolvedValue(undefined),
    },
    location: {
      origin: "https://app.test",
    },
    addEventListener: vi.fn((type: string, handler: WorkerHandler) => {
      listeners[type] = [...(listeners[type] || []), handler];
    }),
  };

  const source = readFileSync(path.join(process.cwd(), "public", filename), "utf8");
  vm.runInNewContext(source, {
    self,
    clients,
    caches: {
      open: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(undefined),
    },
    fetch: vi.fn(),
    URL,
    Response,
    Promise,
    console,
    ...overrides,
  });

  return { listeners, self };
}

describe("service workers", () => {
  it("does not reject install when static precache writes fail", async () => {
    const addAll = vi.fn().mockRejectedValue(new Error("cache write failed"));
    const caches = {
      open: vi.fn().mockResolvedValue({ addAll }),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(undefined),
    };
    const { listeners, self } = loadWorkerScript("sw.js", { caches });
    const pending: Promise<unknown>[] = [];

    listeners.install[0]({
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });

    await expect(Promise.all(pending)).resolves.toEqual([undefined]);
    expect(addAll).toHaveBeenCalledWith(["/", "/manifest.json", "/icon.svg"]);
    expect(self.skipWaiting).toHaveBeenCalled();
  });

  it("serves cached static assets when background refresh fails", async () => {
    const cachedResponse = new Response("cached asset", { status: 200 });
    const cache = {
      match: vi.fn().mockResolvedValue(cachedResponse),
      put: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    };
    const caches = {
      open: vi.fn().mockResolvedValue(cache),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
      match: vi.fn().mockResolvedValue(undefined),
    };
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const { listeners } = loadWorkerScript("sw.js", { caches, fetch });
    let responsePromise: Promise<Response> | null = null;

    listeners.fetch[0]({
      request: {
        method: "GET",
        url: "https://app.test/_next/static/chunks/app.js",
      },
      respondWith: (promise: Promise<Response>) => {
        responsePromise = promise;
      },
    });

    await expect(responsePromise).resolves.toBe(cachedResponse);
    expect(fetch).toHaveBeenCalled();
  });

  it("keeps app shell registration failures out of unhandled promise paths", () => {
    const layoutSource = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(layoutSource).toContain('navigator.serviceWorker.register("/sw.js").catch(function(){})');
  });

  it("normalizes external push notification click targets to the app root", async () => {
    const clients = {
      claim: vi.fn(),
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn().mockResolvedValue(undefined),
    };
    const { listeners } = loadWorkerScript("push-sw.js", { clients });
    const pending: Promise<unknown>[] = [];
    const close = vi.fn();

    listeners.notificationclick[0]({
      notification: {
        close,
        data: { url: "https://evil.test/phish" },
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });

    await Promise.all(pending);
    expect(close).toHaveBeenCalled();
    expect(clients.openWindow).toHaveBeenCalledWith("/");
  });

  it("focuses an existing same-origin push notification target", async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const clients = {
      claim: vi.fn(),
      matchAll: vi.fn().mockResolvedValue([
        { url: "https://app.test/project/project-1?tab=bom", focus },
      ]),
      openWindow: vi.fn().mockResolvedValue(undefined),
    };
    const { listeners } = loadWorkerScript("push-sw.js", { clients });
    const pending: Promise<unknown>[] = [];

    listeners.notificationclick[0]({
      notification: {
        close: vi.fn(),
        data: { url: "/project/project-1?tab=bom" },
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });

    await Promise.all(pending);
    expect(focus).toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });
});
