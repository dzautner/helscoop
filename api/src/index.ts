import express from "express";
import cors from "cors";
import { login, register, signToken, requireAuth } from "./auth";
import materialsRouter from "./routes/materials";
import projectsRouter from "./routes/projects";
import suppliersRouter from "./routes/suppliers";
import pricingRouter from "./routes/pricing";
import chatRouter from "./routes/chat";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await login(email, password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: signToken(user), user });
});

app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const user = await register(email, password, name);
    res.status(201).json({ token: signToken(user), user });
  } catch (e: unknown) {
    console.error("Registration error:", e);
    const msg = e instanceof Error ? e.message : "Registration failed";
    if (msg.includes("duplicate key")) {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(400).json({ error: msg || "Registration failed" });
  }
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json(req.user);
});

app.use("/materials", materialsRouter);
app.use("/projects", projectsRouter);
app.use("/suppliers", suppliersRouter);
app.use("/pricing", pricingRouter);
app.use("/chat", chatRouter);

app.get("/materials/export/viewer", async (_req, res) => {
  const { query: dbQuery } = await import("./db");
  const mats = await dbQuery(`
    SELECT m.*, c.id AS cat_id, c.display_name AS category_name
    FROM materials m JOIN categories c ON m.category_id = c.id
    ORDER BY c.sort_order, m.name
  `);
  const pricing = await dbQuery(`
    SELECT p.*, s.name AS supplier_name, s.id AS supplier_id
    FROM pricing p JOIN suppliers s ON p.supplier_id = s.id
  `);
  const cats = await dbQuery("SELECT * FROM categories ORDER BY sort_order");
  const sups = await dbQuery("SELECT * FROM suppliers ORDER BY name");

  const pricingByMat: Record<string, typeof pricing.rows> = {};
  for (const p of pricing.rows) {
    (pricingByMat[p.material_id] ||= []).push(p);
  }

  const materials: Record<string, unknown> = {};
  for (const m of mats.rows) {
    const prices = pricingByMat[m.id] || [];
    const primary = prices.find((p) => p.is_primary) || prices[0];
    const alts = prices.filter((p) => p !== primary);

    materials[m.id] = {
      name: m.name,
      category: m.cat_id,
      tags: m.tags || [],
      visual: {
        albedo: m.visual_albedo || [0.8, 0.8, 0.8],
        roughness: m.visual_roughness ?? 0.5,
        metallic: m.visual_metallic ?? 0.0,
        ...(m.visual_albedo_texture && { albedoTexture: m.visual_albedo_texture }),
        ...(m.visual_normal_texture && { normalTexture: m.visual_normal_texture }),
      },
      thermal: {
        conductivity: m.thermal_conductivity ?? 0,
        thickness: m.thermal_thickness ?? 0,
      },
      structural: {
        gradeClass: m.structural_grade_class || "",
        maxSpan_floor_mm: m.structural_max_span_floor_mm ?? 0,
        maxSpan_wall_mm: m.structural_max_span_wall_mm ?? 0,
        maxSpan_rafter_mm: m.structural_max_span_rafter_mm ?? 0,
        bendingStrength_MPa: m.structural_bending_strength_mpa ?? 0,
        modulus_GPa: m.structural_modulus_gpa ?? 0,
      },
      pricing: primary
        ? {
            unit: primary.unit,
            unitPrice: parseFloat(primary.unit_price),
            supplier: primary.supplier_name,
            link: primary.link || "",
            sku: primary.sku || "",
            ean: primary.ean || "",
            currency: primary.currency || "EUR",
            lastPriceCheck: primary.last_scraped_at || "",
            alternativeSuppliers: alts.map((a) => ({
              supplier: a.supplier_name,
              unitPrice: parseFloat(a.unit_price),
              link: a.link || "",
              sku: a.sku || "",
            })),
          }
        : { unit: "kpl", unitPrice: 0, supplier: "", link: "" },
    };
  }

  const categories: Record<string, unknown> = {};
  for (const c of cats.rows) {
    categories[c.id] = {
      displayName: c.display_name,
      displayNameFi: c.display_name_fi,
      sortOrder: c.sort_order,
    };
  }

  const suppliers: Record<string, unknown> = {};
  for (const s of sups.rows) {
    suppliers[s.id] = {
      name: s.name,
      website: s.url || s.website || "",
      country: s.country || "FI",
    };
  }

  res.json({ version: 1, materials, categories, suppliers });
});

app.get("/templates", (_req, res) => {
  res.json([
    {
      id: "pihasauna",
      name: "Pihasauna 3x4m",
      description: "Perinteinen suomalainen pihasauna hirsirunko",
      icon: "sauna",
      estimated_cost: 8500,
      scene_js: `// Pihasauna 3x4m
const floor = box(4, 0.2, 3);
const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
const wall2 = translate(box(4, 2.4, 0.12), 0, 1.3, 1.44);
const wall3 = translate(box(0.12, 2.4, 3), -1.94, 1.3, 0);
const wall4 = translate(box(0.12, 2.4, 3), 1.94, 1.3, 0);
const door = translate(box(0.8, 2.0, 0.12), 1.0, 1.1, -1.44);
const wall1_cut = subtract(wall1, door);
const roof1 = translate(rotate(box(2.3, 0.05, 4.4), 0, 0, 0.52), -1.0, 2.9, 0);
const roof2 = translate(rotate(box(2.3, 0.05, 4.4), 0, 0, -0.52), 1.0, 2.9, 0);

scene.add(floor, { material: "foundation", color: [0.65, 0.65, 0.65] });
scene.add(wall1_cut, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(wall2, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(wall3, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(wall4, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(roof1, { material: "roofing", color: [0.35, 0.32, 0.30] });
scene.add(roof2, { material: "roofing", color: [0.35, 0.32, 0.30] });`,
      bom: [
        { material_id: "pine_48x148_c24", quantity: 42, unit: "jm" },
        { material_id: "pine_48x98_c24", quantity: 28, unit: "jm" },
        { material_id: "osb_11mm", quantity: 12, unit: "m2" },
        { material_id: "mineral_wool_150", quantity: 12, unit: "m2" },
        { material_id: "concrete_c25", quantity: 1.2, unit: "m3" },
        { material_id: "roofing_felt_yp2200", quantity: 16, unit: "m2" },
      ],
    },
    {
      id: "autotalli",
      name: "Autotalli 6x4m",
      description: "Yhden auton autotalli nosto-ovella",
      icon: "garage",
      estimated_cost: 12000,
      scene_js: `// Autotalli 6x4m
const floor = box(6, 0.15, 4);
const wall_back = translate(box(6, 2.8, 0.15), 0, 1.55, -1.925);
const wall_left = translate(box(0.15, 2.8, 4), -2.925, 1.55, 0);
const wall_right = translate(box(0.15, 2.8, 4), 2.925, 1.55, 0);
const wall_front = translate(box(6, 0.8, 0.15), 0, 2.55, 1.925);
const gate = translate(box(2.6, 2.2, 0.15), 0, 1.25, 1.925);
const roof = translate(box(6.6, 0.05, 4.6), 0, 3.0, 0);

scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
scene.add(wall_back, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_left, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_right, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_front, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(gate, { material: "lumber", color: [0.5, 0.45, 0.4] });
scene.add(roof, { material: "roofing", color: [0.3, 0.3, 0.3] });`,
      bom: [
        { material_id: "pine_48x148_c24", quantity: 65, unit: "jm" },
        { material_id: "pine_48x98_c24", quantity: 45, unit: "jm" },
        { material_id: "osb_11mm", quantity: 24, unit: "m2" },
        { material_id: "mineral_wool_150", quantity: 24, unit: "m2" },
        { material_id: "concrete_c25", quantity: 2.4, unit: "m3" },
        { material_id: "metal_roof_ruukki", quantity: 28, unit: "m2" },
      ],
    },
    {
      id: "varasto",
      name: "Puutarhavarasto 3x2m",
      description: "Kompakti varastokoppi puutarhaan",
      icon: "shed",
      estimated_cost: 3200,
      scene_js: `// Puutarhavarasto 3x2m
const floor = box(3, 0.1, 2);
const wall1 = translate(box(3, 2.2, 0.1), 0, 1.2, -0.95);
const wall2 = translate(box(3, 2.2, 0.1), 0, 1.2, 0.95);
const wall3 = translate(box(0.1, 2.2, 2), -1.45, 1.2, 0);
const wall4_upper = translate(box(0.1, 0.6, 2), 1.45, 2.0, 0);
const door = translate(box(0.8, 1.8, 0.1), 0.6, 1.0, 0.95);
const wall2_cut = subtract(wall2, door);
const roof = translate(rotate(box(3.4, 0.04, 2.4), 0.12, 0, 0), 0, 2.4, 0);

scene.add(floor, { material: "foundation", color: [0.6, 0.6, 0.6] });
scene.add(wall1, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(wall2_cut, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(wall3, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(wall4_upper, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(roof, { material: "roofing", color: [0.35, 0.35, 0.3] });`,
      bom: [
        { material_id: "pine_48x98_c24", quantity: 24, unit: "jm" },
        { material_id: "osb_11mm", quantity: 8, unit: "m2" },
        { material_id: "roofing_felt_yp2200", quantity: 8, unit: "m2" },
      ],
    },
    {
      id: "katos",
      name: "Terassi & katos 4x3m",
      description: "Avoin terassirakenne katteineen",
      icon: "pergola",
      estimated_cost: 4800,
      scene_js: `// Terassi & katos 4x3m
const deck = translate(box(4, 0.08, 3), 0, 0.4, 0);
const post1 = translate(box(0.12, 2.6, 0.12), -1.8, 1.5, -1.3);
const post2 = translate(box(0.12, 2.6, 0.12), 1.8, 1.5, -1.3);
const post3 = translate(box(0.12, 2.6, 0.12), -1.8, 1.5, 1.3);
const post4 = translate(box(0.12, 2.6, 0.12), 1.8, 1.5, 1.3);
const beam1 = translate(box(4.2, 0.18, 0.12), 0, 2.85, -1.3);
const beam2 = translate(box(4.2, 0.18, 0.12), 0, 2.85, 1.3);
const roof = translate(rotate(box(4.6, 0.04, 3.4), 0.08, 0, 0), 0, 3.1, 0);

scene.add(deck, { material: "lumber", color: [0.78, 0.65, 0.45] });
scene.add(post1, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(post2, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(post3, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(post4, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(beam1, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(beam2, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(roof, { material: "roofing", color: [0.4, 0.38, 0.35] });`,
      bom: [
        { material_id: "pine_48x148_c24", quantity: 30, unit: "jm" },
        { material_id: "pine_48x98_c24", quantity: 18, unit: "jm" },
        { material_id: "metal_roof_ruukki", quantity: 14, unit: "m2" },
        { material_id: "wood_screw_5x80", quantity: 250, unit: "kpl" },
      ],
    },
  ]);
});

app.get("/categories", async (_req, res) => {
  const { query: dbQuery } = await import("./db");
  const result = await dbQuery(
    "SELECT * FROM categories WHERE hidden = false ORDER BY sort_order"
  );
  res.json(result.rows);
});

app.get("/bom/export/:projectId", requireAuth, async (req, res) => {
  const { query: dbQuery } = await import("./db");
  const result = await dbQuery(
    `SELECT m.name, c.display_name AS category, pb.quantity, pb.unit,
      p.unit_price, (pb.quantity * p.unit_price * m.waste_factor) AS total,
      s.name AS supplier, p.link
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order`,
    [req.params.projectId]
  );

  if (req.query.format === "csv") {
    const header = "Material,Category,Qty,Unit,Price,Total,Supplier,Link\n";
    const rows = result.rows
      .map(
        (r) =>
          `"${r.name}","${r.category}",${r.quantity},"${r.unit}",${r.unit_price ?? 0},${r.total ?? 0},"${r.supplier ?? ""}","${r.link ?? ""}"`
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bom_${req.params.projectId}.csv"`
    );
    return res.send(header + rows);
  }

  res.json(result.rows);
});

app.listen(PORT, () => {
  console.log(`DingCAD API running on port ${PORT}`);
});

export default app;
