import { describe, it, expect } from "vitest";

describe("API structure", () => {
  it("has all route files", async () => {
    const materials = await import("../routes/materials");
    const projects = await import("../routes/projects");
    const suppliers = await import("../routes/suppliers");
    const pricing = await import("../routes/pricing");
    expect(materials.default).toBeDefined();
    expect(projects.default).toBeDefined();
    expect(suppliers.default).toBeDefined();
    expect(pricing.default).toBeDefined();
  });

  it("auth module exports required functions", async () => {
    const auth = await import("../auth");
    expect(auth.signToken).toBeTypeOf("function");
    expect(auth.requireAuth).toBeTypeOf("function");
    expect(auth.requireAdmin).toBeTypeOf("function");
    expect(auth.login).toBeTypeOf("function");
    expect(auth.register).toBeTypeOf("function");
  });

  it("db module exports pool and query", async () => {
    const db = await import("../db");
    expect(db.pool).toBeDefined();
    expect(db.query).toBeTypeOf("function");
  });
});

describe("SQL migrations", () => {
  it("001_initial_schema.sql exists and has required tables", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const sqlPath = path.resolve(
      __dirname,
      "../../../db/migrations/001_initial_schema.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf-8");

    const requiredTables = [
      "users",
      "suppliers",
      "categories",
      "materials",
      "pricing",
      "pricing_history",
      "scrape_runs",
      "projects",
      "project_bom",
    ];

    for (const table of requiredTables) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }

    expect(sql).toContain("v_material_pricing");
    expect(sql).toContain("v_project_cost");
  });

  it("002_seed has all suppliers and materials from original JSON", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const sqlPath = path.resolve(
      __dirname,
      "../../../db/migrations/002_seed_from_json.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf-8");

    const requiredSuppliers = [
      "sarokas",
      "k-rauta",
      "ruukki",
      "tikkurila",
      "paroc",
      "lakan-betoni",
    ];
    for (const s of requiredSuppliers) {
      expect(sql).toContain(`'${s}'`);
    }

    const requiredMaterials = [
      "pine_48x98_c24",
      "osb_9mm",
      "galvanized_roofing",
      "insulation_100mm",
      "screws_50mm",
      "concrete_block",
    ];
    for (const m of requiredMaterials) {
      expect(sql).toContain(`'${m}'`);
    }
  });
});

describe("Scraper structure", () => {
  it("scraper entry point exists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const scraperPath = path.resolve(
      __dirname,
      "../../../scraper/src/scrape.ts"
    );
    expect(fs.existsSync(scraperPath)).toBe(true);
  });
});
