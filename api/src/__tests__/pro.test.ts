process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }),
  pool: { query: vi.fn() },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

vi.mock("../audit", () => ({
  logAuditEvent: vi.fn(),
}));

import { query } from "../db";
import { logAuditEvent } from "../audit";
import app from "../index";

const mockQuery = vi.mocked(query);
const mockLogAuditEvent = vi.mocked(logAuditEvent);

function authToken(userId = "user-1", role = "homeowner") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
      const reqOpts: http.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method: method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          ...opts.headers,
        },
      };

      const req = http.request(reqOpts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            status: res.statusCode || 0,
            body: parsed,
            headers: res.headers as Record<string, string>,
          });
        });
      });

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

describe("GET /pro/leads", () => {
  it("rejects homeowners because leads are contractor-only", async () => {
    const res = await makeRequest("GET", "/pro/leads", {
      headers: { Authorization: `Bearer ${authToken("homeowner-1", "homeowner")}` },
    });

    expect(res.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns normalized contractor leads and summary metrics", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "lead-1",
        project_id: "project-1",
        project_name: "Roof renovation",
        project_description: "Metal roof replacement",
        project_type: "omakotitalo",
        unit_count: null,
        building_info: { address: "Testikatu 1" },
        homeowner_name: "Matti",
        contact_name: "Matti Meikalainen",
        contact_email: "matti@example.com",
        contact_phone: "+358401234567",
        postcode: "00100",
        work_scope: "Roof replacement with insulation",
        bom_line_count: 18,
        estimated_cost: "24000.50",
        partner_channel: "manual_luotettava_kumppani",
        matched_contractor_count: 0,
        status: "submitted",
        created_at: "2026-04-24T08:00:00Z",
      }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/pro/leads?limit=10", {
      headers: { Authorization: `Bearer ${authToken("contractor-1", "contractor")}` },
    });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toContain("FROM quote_requests qr");
    expect(mockQuery.mock.calls[0][1]).toEqual([10]);
    const body = res.body as {
      leads: Array<{ id: string; estimated_cost: number; building_info: { address: string } }>;
      summary: { open_count: number; total_estimated_cost: number };
      tiers: Array<{ id: string; monthly_price_eur: number }>;
    };
    expect(body.leads[0]).toMatchObject({
      id: "lead-1",
      estimated_cost: 24000.5,
      building_info: { address: "Testikatu 1" },
    });
    expect(body.summary.open_count).toBe(1);
    expect(body.summary.total_estimated_cost).toBe(24001);
    expect(body.tiers.map((tier) => tier.id)).toEqual(["free", "pro", "growth"]);
  });

  it("rejects invalid status filters", async () => {
    const res = await makeRequest("GET", "/pro/leads?status=lost", {
      headers: { Authorization: `Bearer ${authToken("contractor-1", "contractor")}` },
    });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("PATCH /pro/leads/:id/status", () => {
  it("updates lead status and audits the contractor action", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "lead-1",
        project_id: "project-1",
        project_name: "Kitchen renovation",
        project_description: null,
        project_type: "omakotitalo",
        unit_count: null,
        building_info: null,
        homeowner_name: "Liisa",
        contact_name: "Liisa",
        contact_email: "liisa@example.com",
        contact_phone: null,
        postcode: "33100",
        work_scope: "Kitchen cabinets",
        bom_line_count: 6,
        estimated_cost: 6200,
        partner_channel: "manual_luotettava_kumppani",
        matched_contractor_count: 1,
        status: "forwarded",
        created_at: "2026-04-24T08:00:00Z",
      }],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PATCH", "/pro/leads/lead-1/status", {
      headers: { Authorization: `Bearer ${authToken("contractor-1", "contractor")}` },
      body: { status: "forwarded" },
    });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toEqual(["lead-1", "forwarded"]);
    expect((res.body as { lead: { status: string; matched_contractor_count: number } }).lead).toMatchObject({
      status: "forwarded",
      matched_contractor_count: 1,
    });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      "contractor-1",
      "pro.lead_status_updated",
      expect.objectContaining({ leadId: "lead-1", status: "forwarded" }),
    );
  });

  it("rejects invalid status updates", async () => {
    const res = await makeRequest("PATCH", "/pro/leads/lead-1/status", {
      headers: { Authorization: `Bearer ${authToken("contractor-1", "contractor")}` },
      body: { status: "won" },
    });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
