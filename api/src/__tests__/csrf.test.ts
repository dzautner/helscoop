import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { configuredCorsOrigins, rejectCrossOriginCookieAuth } from "../csrf";

function mockReq(headers: Record<string, string>, method = "POST") {
  return { headers, method } as unknown as Request;
}

function mockRes() {
  return {
    _status: 0,
    _body: null as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  } as unknown as Response & { _status: number; _body: unknown };
}

describe("configuredCorsOrigins", () => {
  it("uses trimmed configured origins when present", () => {
    expect(configuredCorsOrigins(" https://app.example.com/,https://api.example.com ", ["fallback"])).toEqual([
      "https://app.example.com",
      "https://api.example.com",
    ]);
  });

  it("falls back when no configured origins are present", () => {
    expect(configuredCorsOrigins(" , ", ["http://localhost:3000"])).toEqual(["http://localhost:3000"]);
  });
});

describe("rejectCrossOriginCookieAuth", () => {
  const middleware = rejectCrossOriginCookieAuth(["https://app.example.com"]);

  function run(req: Request) {
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    middleware(req, res, next);
    return { res, next };
  }

  it("allows bearer-token API clients regardless of origin", () => {
    const { res, next } = run(mockReq({
      authorization: "Bearer test-token",
      cookie: "helscoop_session=cookie-token",
      origin: "https://evil.example",
    }));
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });

  it("allows cookie-authenticated requests from configured origins", () => {
    const { res, next } = run(mockReq({
      cookie: "helscoop_session=cookie-token",
      origin: "https://app.example.com",
    }));
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });

  it("rejects unsafe cookie-authenticated requests from other origins", () => {
    const { res, next } = run(mockReq({
      cookie: "helscoop_session=cookie-token",
      origin: "https://evil.example",
    }));
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._body).toEqual({ error: "Invalid request origin" });
  });

  it("uses referer as a fallback origin signal", () => {
    const { res, next } = run(mockReq({
      cookie: "helscoop_session=cookie-token",
      referer: "https://app.example.com/projects/1",
    }));
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });

  it("does not block safe methods", () => {
    const { res, next } = run(mockReq({
      cookie: "helscoop_session=cookie-token",
      origin: "https://evil.example",
    }, "GET"));
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });
});
