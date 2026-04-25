-- Database-backed project template gallery with curated Finnish homeowner starts.

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_fi TEXT,
  name_en TEXT,
  description TEXT,
  description_fi TEXT,
  description_en TEXT,
  category TEXT NOT NULL CHECK (category IN ('sauna', 'garage', 'shed', 'terrace', 'other')),
  icon TEXT,
  scene_js TEXT NOT NULL,
  bom JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_url TEXT,
  estimated_cost INTEGER,
  difficulty TEXT NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  area_m2 REAL,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_community BOOLEAN NOT NULL DEFAULT false,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_gallery_popular
  ON templates(is_featured DESC, use_count DESC, created_at DESC)
  WHERE moderation_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_templates_moderation_status ON templates(moderation_status);
CREATE INDEX IF NOT EXISTS idx_templates_created_at ON templates(created_at DESC);

INSERT INTO templates (
  id, name, name_fi, name_en, description, description_fi, description_en,
  category, icon, scene_js, bom, thumbnail_url, estimated_cost, difficulty, area_m2,
  is_featured, is_community, moderation_status
) VALUES
(
  'pihasauna',
  'Pihasauna 3x4m',
  'Pihasauna 3x4m',
  'Yard sauna 3x4m',
  'Perinteinen suomalainen pihasauna hirsirunko',
  'Perinteinen suomalainen pihasauna hirsirungolla ja harjakatolla.',
  'Traditional Finnish yard sauna with timber walls and a gable roof.',
  'sauna',
  'sauna',
  $scene$// Pihasauna 3x4m
const floor = box(4, 0.2, 3);
const back = translate(box(4, 2.35, 0.12), 0, 1.3, -1.44);
const frontLeft = translate(box(1.2, 2.35, 0.12), -1.4, 1.3, 1.44);
const frontRight = translate(box(1.6, 2.35, 0.12), 1.2, 1.3, 1.44);
const left = translate(box(0.12, 2.35, 3), -1.94, 1.3, 0);
const right = translate(box(0.12, 2.35, 3), 1.94, 1.3, 0);
const roofA = translate(rotate(box(2.35, 0.06, 3.5), 0, 0, 0.55), -0.95, 2.85, 0);
const roofB = translate(rotate(box(2.35, 0.06, 3.5), 0, 0, -0.55), 0.95, 2.85, 0);
const chimney = translate(box(0.32, 0.7, 0.32), -0.8, 3.1, -0.4);
scene.add(floor, { material: "foundation", color: [0.63, 0.63, 0.6] });
scene.add(back, { material: "lumber", color: [0.78, 0.6, 0.36] });
scene.add(frontLeft, { material: "lumber", color: [0.78, 0.6, 0.36] });
scene.add(frontRight, { material: "lumber", color: [0.78, 0.6, 0.36] });
scene.add(left, { material: "lumber", color: [0.78, 0.6, 0.36] });
scene.add(right, { material: "lumber", color: [0.78, 0.6, 0.36] });
scene.add(roofA, { material: "roofing", color: [0.27, 0.25, 0.23] });
scene.add(roofB, { material: "roofing", color: [0.27, 0.25, 0.23] });
scene.add(chimney, { color: [0.42, 0.4, 0.37] });$scene$,
  '[{"material_id":"pine_48x148_c24","quantity":42,"unit":"jm"},{"material_id":"pine_48x98_c24","quantity":28,"unit":"jm"},{"material_id":"osb_9mm","quantity":12,"unit":"m2"},{"material_id":"insulation_100mm","quantity":12,"unit":"m2"},{"material_id":"concrete_block","quantity":24,"unit":"kpl"},{"material_id":"galvanized_roofing","quantity":16,"unit":"m2"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23181713"/><rect x="160" y="190" width="320" height="150" rx="10" fill="%23b9874a"/><path d="M130 200 320 95 510 200" fill="%23413b35"/><rect x="402" y="110" width="36" height="82" fill="%23625c55"/><circle cx="445" cy="78" r="22" fill="%238b8f92" opacity=".45"/></svg>$thumb$,
  8500,
  'intermediate',
  12,
  true,
  false,
  'approved'
),
(
  'autotalli',
  'Autotalli 6x4m',
  'Autotalli 6x4m',
  'Garage 6x4m',
  'Yhden auton autotalli nosto-ovella',
  'Yhden auton autotalli nosto-ovella ja loivalla katolla.',
  'Single-car garage with an overhead door and low roof.',
  'garage',
  'garage',
  $scene$// Autotalli 6x4m
const floor = box(6, 0.15, 4);
const back = translate(box(6, 2.8, 0.15), 0, 1.55, -1.925);
const left = translate(box(0.15, 2.8, 4), -2.925, 1.55, 0);
const right = translate(box(0.15, 2.8, 4), 2.925, 1.55, 0);
const frontHeader = translate(box(6, 0.7, 0.15), 0, 2.6, 1.925);
const door = translate(box(2.8, 2.15, 0.15), 0, 1.25, 1.94);
const roof = translate(box(6.5, 0.08, 4.5), 0, 3.0, 0);
scene.add(floor, { material: "foundation", color: [0.68, 0.68, 0.65] });
scene.add(back, { material: "lumber", color: [0.82, 0.72, 0.54] });
scene.add(left, { material: "lumber", color: [0.82, 0.72, 0.54] });
scene.add(right, { material: "lumber", color: [0.82, 0.72, 0.54] });
scene.add(frontHeader, { material: "lumber", color: [0.82, 0.72, 0.54] });
scene.add(door, { color: [0.35, 0.36, 0.36] });
scene.add(roof, { material: "roofing", color: [0.25, 0.26, 0.26] });$scene$,
  '[{"material_id":"pine_48x148_c24","quantity":65,"unit":"jm"},{"material_id":"pine_48x98_c24","quantity":45,"unit":"jm"},{"material_id":"osb_9mm","quantity":24,"unit":"m2"},{"material_id":"insulation_100mm","quantity":24,"unit":"m2"},{"material_id":"concrete_block","quantity":48,"unit":"kpl"},{"material_id":"galvanized_roofing","quantity":28,"unit":"m2"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23131517"/><rect x="118" y="150" width="404" height="190" rx="12" fill="%23c6a36a"/><rect x="255" y="216" width="130" height="124" fill="%23484b4d"/><rect x="96" y="130" width="448" height="42" rx="8" fill="%23393b3d"/></svg>$thumb$,
  12000,
  'advanced',
  24,
  true,
  false,
  'approved'
),
(
  'varasto',
  'Puutarhavarasto 3x2m',
  'Puutarhavarasto 3x2m',
  'Garden shed 3x2m',
  'Kompakti varastokoppi puutarhaan',
  'Kompakti varasto puutarhatyokaluille, pyorille ja kausitavaralle.',
  'Compact garden shed for tools, bikes and seasonal storage.',
  'shed',
  'shed',
  $scene$// Puutarhavarasto 3x2m
const floor = box(3, 0.1, 2);
const back = translate(box(3, 2.1, 0.1), 0, 1.15, -0.95);
const frontLeft = translate(box(0.8, 2.1, 0.1), -1.1, 1.15, 0.95);
const frontRight = translate(box(1.0, 2.1, 0.1), 1.0, 1.15, 0.95);
const left = translate(box(0.1, 2.1, 2), -1.45, 1.15, 0);
const right = translate(box(0.1, 2.1, 2), 1.45, 1.15, 0);
const roof = translate(rotate(box(3.4, 0.06, 2.4), 0.1, 0, 0), 0, 2.35, 0);
scene.add(floor, { material: "foundation", color: [0.58, 0.58, 0.56] });
scene.add(back, { material: "lumber", color: [0.68, 0.52, 0.34] });
scene.add(frontLeft, { material: "lumber", color: [0.68, 0.52, 0.34] });
scene.add(frontRight, { material: "lumber", color: [0.68, 0.52, 0.34] });
scene.add(left, { material: "lumber", color: [0.68, 0.52, 0.34] });
scene.add(right, { material: "lumber", color: [0.68, 0.52, 0.34] });
scene.add(roof, { material: "roofing", color: [0.31, 0.32, 0.29] });$scene$,
  '[{"material_id":"pine_48x98_c24","quantity":24,"unit":"jm"},{"material_id":"osb_9mm","quantity":8,"unit":"m2"},{"material_id":"galvanized_roofing","quantity":8,"unit":"m2"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23151916"/><rect x="190" y="175" width="260" height="155" rx="10" fill="%23936f45"/><path d="M170 180h300l-50-58H220z" fill="%233e423b"/><rect x="292" y="242" width="58" height="88" fill="%23402d1e"/></svg>$thumb$,
  3200,
  'beginner',
  6,
  false,
  false,
  'approved'
),
(
  'katos',
  'Terassi & katos 4x3m',
  'Terassi & katos 4x3m',
  'Terrace shelter 4x3m',
  'Avoin terassirakenne katteineen',
  'Avoin terassi- ja katosrakenne neljalla tolpalla.',
  'Open terrace shelter with four posts and a simple roof.',
  'terrace',
  'pergola',
  $scene$// Terassi & katos 4x3m
const deck = translate(box(4, 0.08, 3), 0, 0.35, 0);
const post1 = translate(box(0.14, 2.6, 0.14), -1.8, 1.55, -1.25);
const post2 = translate(box(0.14, 2.6, 0.14), 1.8, 1.55, -1.25);
const post3 = translate(box(0.14, 2.6, 0.14), -1.8, 1.55, 1.25);
const post4 = translate(box(0.14, 2.6, 0.14), 1.8, 1.55, 1.25);
const beamA = translate(box(4.3, 0.18, 0.14), 0, 2.85, -1.25);
const beamB = translate(box(4.3, 0.18, 0.14), 0, 2.85, 1.25);
const roof = translate(rotate(box(4.6, 0.05, 3.4), 0.08, 0, 0), 0, 3.1, 0);
scene.add(deck, { material: "lumber", color: [0.72, 0.56, 0.36] });
scene.add(post1, { material: "lumber", color: [0.64, 0.48, 0.3] });
scene.add(post2, { material: "lumber", color: [0.64, 0.48, 0.3] });
scene.add(post3, { material: "lumber", color: [0.64, 0.48, 0.3] });
scene.add(post4, { material: "lumber", color: [0.64, 0.48, 0.3] });
scene.add(beamA, { material: "lumber", color: [0.64, 0.48, 0.3] });
scene.add(beamB, { material: "lumber", color: [0.64, 0.48, 0.3] });
scene.add(roof, { material: "roofing", color: [0.39, 0.37, 0.33] });$scene$,
  '[{"material_id":"pine_48x148_c24","quantity":30,"unit":"jm"},{"material_id":"pine_48x98_c24","quantity":18,"unit":"jm"},{"material_id":"galvanized_roofing","quantity":14,"unit":"m2"},{"material_id":"screws_50mm","quantity":250,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23161513"/><rect x="150" y="296" width="340" height="38" fill="%23805e38"/><rect x="170" y="150" width="24" height="150" fill="%23a67845"/><rect x="446" y="150" width="24" height="150" fill="%23a67845"/><path d="M130 145h380l-35-52H165z" fill="%2342403a"/></svg>$thumb$,
  4800,
  'beginner',
  12,
  true,
  false,
  'approved'
),
(
  'kanala',
  'Kanala 2x1.5m',
  'Kanala 2x1.5m',
  'Chicken coop 2x1.5m',
  'Kompakti kanakoppi 4-6 kanalle, pesalaatikolla ja ulkotarhalla',
  'Kompakti kanakoppi 4-6 kanalle, pesalaatikolla ja ulkotarhalla.',
  'Compact chicken coop for 4-6 hens with nesting box and outside run.',
  'other',
  'kanala',
  $scene$// Kanala 2x1.5m
const coop = translate(box(2, 1.25, 1.5), -0.7, 1.05, 0);
const roof = translate(rotate(box(2.3, 0.06, 1.8), 0, 0, 0.2), -0.7, 1.75, 0);
const runA = translate(box(1.8, 0.08, 0.08), 1.25, 0.65, -0.7);
const runB = translate(box(1.8, 0.08, 0.08), 1.25, 0.65, 0.7);
const runPost1 = translate(box(0.07, 1, 0.07), 0.4, 0.75, -0.7);
const runPost2 = translate(box(0.07, 1, 0.07), 2.1, 0.75, 0.7);
scene.add(coop, { material: "lumber", color: [0.72, 0.52, 0.32] });
scene.add(roof, { material: "roofing", color: [0.32, 0.31, 0.28] });
scene.add(runA, { color: [0.42, 0.44, 0.4] });
scene.add(runB, { color: [0.42, 0.44, 0.4] });
scene.add(runPost1, { material: "lumber", color: [0.6, 0.42, 0.25] });
scene.add(runPost2, { material: "lumber", color: [0.6, 0.42, 0.25] });$scene$,
  '[{"material_id":"pine_48x98_c24","quantity":80,"unit":"jm"},{"material_id":"pine_48x148_c24","quantity":35,"unit":"jm"},{"material_id":"osb_18mm","quantity":12,"unit":"m2"},{"material_id":"galvanized_roofing","quantity":18,"unit":"m2"},{"material_id":"screws_50mm","quantity":500,"unit":"kpl"},{"material_id":"concrete_block","quantity":8,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23171412"/><rect x="140" y="190" width="190" height="120" rx="8" fill="%23a97744"/><path d="M125 195 235 125 345 195z" fill="%23403c36"/><rect x="345" y="225" width="150" height="75" fill="none" stroke="%23919482" stroke-width="10"/></svg>$thumb$,
  1800,
  'beginner',
  3,
  false,
  false,
  'approved'
),
(
  'grillikatos',
  'Grillikatos 3x3m',
  'Grillikatos 3x3m',
  'BBQ shelter 3x3m',
  'Avoin grillikatos kesapihalle',
  'Avoin 3x3 metrin grillikatos kesapihalle ja nuotiopaikalle.',
  'Open 3x3 metre BBQ shelter for the garden and fire pit.',
  'terrace',
  'pergola',
  $scene$// Grillikatos 3x3m
const base = translate(box(3, 0.08, 3), 0, 0.35, 0);
const post1 = translate(box(0.16, 2.45, 0.16), -1.25, 1.55, -1.25);
const post2 = translate(box(0.16, 2.45, 0.16), 1.25, 1.55, -1.25);
const post3 = translate(box(0.16, 2.45, 0.16), -1.25, 1.55, 1.25);
const post4 = translate(box(0.16, 2.45, 0.16), 1.25, 1.55, 1.25);
const roof = translate(rotate(box(3.6, 0.06, 3.6), 0.14, 0, 0), 0, 2.95, 0);
const grill = translate(box(0.6, 0.7, 0.6), 0, 0.75, 0);
scene.add(base, { material: "lumber", color: [0.7, 0.53, 0.34] });
scene.add(post1, { material: "lumber", color: [0.62, 0.45, 0.28] });
scene.add(post2, { material: "lumber", color: [0.62, 0.45, 0.28] });
scene.add(post3, { material: "lumber", color: [0.62, 0.45, 0.28] });
scene.add(post4, { material: "lumber", color: [0.62, 0.45, 0.28] });
scene.add(roof, { material: "roofing", color: [0.32, 0.31, 0.28] });
scene.add(grill, { color: [0.18, 0.18, 0.17] });$scene$,
  '[{"material_id":"pine_48x148_c24","quantity":28,"unit":"jm"},{"material_id":"pine_48x98_c24","quantity":20,"unit":"jm"},{"material_id":"galvanized_roofing","quantity":12,"unit":"m2"},{"material_id":"screws_50mm","quantity":220,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23191512"/><path d="M150 160h340l-50-65H200z" fill="%23434139"/><rect x="178" y="162" width="24" height="160" fill="%23a2713f"/><rect x="438" y="162" width="24" height="160" fill="%23a2713f"/><rect x="290" y="260" width="60" height="58" fill="%23292826"/></svg>$thumb$,
  4200,
  'beginner',
  9,
  true,
  false,
  'approved'
),
(
  'puuliiteri',
  'Puuliiteri 2x1m',
  'Puuliiteri 2x1m',
  'Firewood storage 2x1m',
  'Pieni ilmava liiteri polttopuille',
  'Pieni ilmava liiteri polttopuille ja pihavarastoinnille.',
  'Small ventilated shelter for firewood and yard storage.',
  'shed',
  'shed',
  $scene$// Puuliiteri 2x1m
const base = translate(box(2, 0.08, 1), 0, 0.25, 0);
const back = translate(box(2, 1.5, 0.08), 0, 1.0, -0.46);
const sideA = translate(box(0.08, 1.5, 1), -0.96, 1.0, 0);
const sideB = translate(box(0.08, 1.5, 1), 0.96, 1.0, 0);
const roof = translate(rotate(box(2.25, 0.05, 1.25), 0.18, 0, 0), 0, 1.78, 0);
const logs = translate(box(1.6, 0.35, 0.65), 0, 0.55, 0.12);
scene.add(base, { material: "lumber", color: [0.63, 0.46, 0.28] });
scene.add(back, { material: "lumber", color: [0.7, 0.52, 0.32] });
scene.add(sideA, { material: "lumber", color: [0.7, 0.52, 0.32] });
scene.add(sideB, { material: "lumber", color: [0.7, 0.52, 0.32] });
scene.add(roof, { material: "roofing", color: [0.35, 0.34, 0.31] });
scene.add(logs, { material: "lumber", color: [0.48, 0.31, 0.16] });$scene$,
  '[{"material_id":"pine_48x98_c24","quantity":18,"unit":"jm"},{"material_id":"galvanized_roofing","quantity":3,"unit":"m2"},{"material_id":"screws_50mm","quantity":120,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23161412"/><rect x="200" y="195" width="240" height="118" rx="8" fill="%23876137"/><path d="M190 190h260l-28-50H218z" fill="%233f3f38"/><rect x="228" y="245" width="184" height="32" rx="16" fill="%23513820"/></svg>$thumb$,
  900,
  'beginner',
  2,
  false,
  false,
  'approved'
),
(
  'kasvihuone',
  'Kasvihuone 3x2m',
  'Kasvihuone 3x2m',
  'Greenhouse 3x2m',
  'Pieni kasvihuone kirkkailla paneeleilla',
  'Pieni kasvihuone kirkkailla paneeleilla ja kevyella puurungolla.',
  'Small greenhouse with clear panels and a light timber frame.',
  'other',
  'greenhouse',
  $scene$// Kasvihuone 3x2m
const base = box(3, 0.08, 2);
const wallA = translate(box(3, 1.7, 0.05), 0, 0.95, -0.98);
const wallB = translate(box(3, 1.7, 0.05), 0, 0.95, 0.98);
const sideA = translate(box(0.05, 1.7, 2), -1.48, 0.95, 0);
const sideB = translate(box(0.05, 1.7, 2), 1.48, 0.95, 0);
const roofA = translate(rotate(box(1.75, 0.04, 2.25), 0, 0, 0.48), -0.72, 1.95, 0);
const roofB = translate(rotate(box(1.75, 0.04, 2.25), 0, 0, -0.48), 0.72, 1.95, 0);
scene.add(base, { material: "foundation", color: [0.55, 0.56, 0.52] });
scene.add(wallA, { color: [0.68, 0.9, 0.84], opacity: 0.45 });
scene.add(wallB, { color: [0.68, 0.9, 0.84], opacity: 0.45 });
scene.add(sideA, { color: [0.68, 0.9, 0.84], opacity: 0.45 });
scene.add(sideB, { color: [0.68, 0.9, 0.84], opacity: 0.45 });
scene.add(roofA, { color: [0.75, 0.92, 0.9], opacity: 0.5 });
scene.add(roofB, { color: [0.75, 0.92, 0.9], opacity: 0.5 });$scene$,
  '[{"material_id":"pine_48x98_c24","quantity":22,"unit":"jm"},{"material_id":"screws_50mm","quantity":180,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23111615"/><rect x="180" y="184" width="280" height="138" rx="10" fill="%238dd6c9" opacity=".45"/><path d="M160 190 320 100 480 190z" fill="%23a4eee7" opacity=".45"/><path d="M180 184h280M230 184v138M320 112v210M410 184v138" stroke="%23d9fff8" stroke-width="8" opacity=".6"/></svg>$thumb$,
  2600,
  'intermediate',
  6,
  false,
  false,
  'approved'
),
(
  'leikkimokki',
  'Leikkimokki 1.5x1.5m',
  'Leikkimokki 1.5x1.5m',
  'Playhouse 1.5x1.5m',
  'Pieni leikkimokki lapsille',
  'Pieni leikkimokki lapsille, ikkunalla ja kevyella kuistilla.',
  'Small playhouse for children with a window and light porch.',
  'other',
  'playhouse',
  $scene$// Leikkimokki 1.5x1.5m
const floor = box(1.5, 0.08, 1.5);
const body = translate(box(1.5, 1.45, 1.5), 0, 0.85, 0);
const roofA = translate(rotate(box(0.95, 0.05, 1.8), 0, 0, 0.5), -0.38, 1.7, 0);
const roofB = translate(rotate(box(0.95, 0.05, 1.8), 0, 0, -0.5), 0.38, 1.7, 0);
const porch = translate(box(1.1, 0.08, 0.55), 0, 0.28, 1.0);
scene.add(floor, { material: "foundation", color: [0.55, 0.55, 0.52] });
scene.add(body, { material: "lumber", color: [0.92, 0.64, 0.42] });
scene.add(roofA, { material: "roofing", color: [0.45, 0.22, 0.18] });
scene.add(roofB, { material: "roofing", color: [0.45, 0.22, 0.18] });
scene.add(porch, { material: "lumber", color: [0.68, 0.49, 0.3] });$scene$,
  '[{"material_id":"pine_48x98_c24","quantity":24,"unit":"jm"},{"material_id":"osb_9mm","quantity":8,"unit":"m2"},{"material_id":"galvanized_roofing","quantity":4,"unit":"m2"},{"material_id":"screws_50mm","quantity":160,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23171413"/><rect x="220" y="190" width="200" height="130" rx="10" fill="%23d88954"/><path d="M190 195 320 104 450 195z" fill="%2363352f"/><rect x="298" y="248" width="44" height="72" fill="%23472d24"/><rect x="358" y="220" width="38" height="34" fill="%23f0d6a0"/></svg>$thumb$,
  2200,
  'beginner',
  2.25,
  false,
  false,
  'approved'
),
(
  'laituri',
  'Laituri 4x2m',
  'Laituri 4x2m',
  'Dock 4x2m',
  'Kevyt puulaituri rantaan',
  'Kevyt 4x2 metrin puulaituri rantaan tai mokille.',
  'Light 4x2 metre timber dock for a shore or cabin.',
  'other',
  'dock',
  $scene$// Laituri 4x2m
const deck = translate(box(4, 0.12, 2), 0, 0.45, 0);
const beamA = translate(box(4.2, 0.18, 0.12), 0, 0.25, -0.8);
const beamB = translate(box(4.2, 0.18, 0.12), 0, 0.25, 0.8);
const post1 = translate(box(0.12, 1.2, 0.12), -1.7, -0.05, -0.8);
const post2 = translate(box(0.12, 1.2, 0.12), 1.7, -0.05, 0.8);
const water = translate(box(5.2, 0.03, 3.2), 0, 0.12, 0);
scene.add(water, { color: [0.12, 0.28, 0.36], opacity: 0.55 });
scene.add(deck, { material: "lumber", color: [0.62, 0.45, 0.26] });
scene.add(beamA, { material: "lumber", color: [0.42, 0.28, 0.17] });
scene.add(beamB, { material: "lumber", color: [0.42, 0.28, 0.17] });
scene.add(post1, { material: "lumber", color: [0.35, 0.24, 0.14] });
scene.add(post2, { material: "lumber", color: [0.35, 0.24, 0.14] });$scene$,
  '[{"material_id":"pine_48x148_c24","quantity":20,"unit":"jm"},{"material_id":"pine_48x98_c24","quantity":18,"unit":"jm"},{"material_id":"screws_50mm","quantity":220,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%230f1a1d"/><path d="M0 260c95-36 179 36 280 0s178 36 360 0v160H0z" fill="%231d5263"/><path d="M140 185h360v70H140z" fill="%23916a3e"/><path d="M150 205h340M150 235h340" stroke="%23503822" stroke-width="10"/></svg>$thumb$,
  1800,
  'beginner',
  8,
  false,
  false,
  'approved'
),
(
  'ulkosauna-pukuhuone',
  'Ulkosauna + pukuhuone 5x3m',
  'Ulkosauna + pukuhuone 5x3m',
  'Outdoor sauna + changing room 5x3m',
  'Isompi pihasauna pukuhuoneella',
  'Isompi pihasauna erillisella pukuhuoneella ja terassikaistalla.',
  'Larger outdoor sauna with a separate changing room and terrace strip.',
  'sauna',
  'sauna',
  $scene$// Ulkosauna + pukuhuone 5x3m
const floor = box(5, 0.18, 3);
const body = translate(box(5, 2.45, 3), 0, 1.35, 0);
const divider = translate(box(0.1, 2.25, 2.8), 0.65, 1.35, 0);
const roofA = translate(rotate(box(2.8, 0.06, 3.5), 0, 0, 0.48), -1.15, 2.9, 0);
const roofB = translate(rotate(box(2.8, 0.06, 3.5), 0, 0, -0.48), 1.15, 2.9, 0);
const porch = translate(box(5.2, 0.08, 0.8), 0, 0.38, 1.9);
scene.add(floor, { material: "foundation", color: [0.62, 0.62, 0.59] });
scene.add(body, { material: "lumber", color: [0.73, 0.54, 0.32] });
scene.add(divider, { material: "lumber", color: [0.58, 0.4, 0.22] });
scene.add(roofA, { material: "roofing", color: [0.25, 0.24, 0.22] });
scene.add(roofB, { material: "roofing", color: [0.25, 0.24, 0.22] });
scene.add(porch, { material: "lumber", color: [0.64, 0.45, 0.27] });$scene$,
  '[{"material_id":"pine_48x148_c24","quantity":70,"unit":"jm"},{"material_id":"pine_48x98_c24","quantity":48,"unit":"jm"},{"material_id":"osb_9mm","quantity":24,"unit":"m2"},{"material_id":"insulation_100mm","quantity":22,"unit":"m2"},{"material_id":"concrete_block","quantity":36,"unit":"kpl"},{"material_id":"galvanized_roofing","quantity":22,"unit":"m2"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23181713"/><rect x="120" y="180" width="400" height="150" rx="10" fill="%23a97442"/><path d="M95 185 320 92 545 185z" fill="%23393430"/><rect x="330" y="180" width="8" height="150" fill="%23563822"/><rect x="175" y="254" width="55" height="76" fill="%2331211a"/></svg>$thumb$,
  14500,
  'advanced',
  15,
  true,
  false,
  'approved'
),
(
  'autokatos-laajennus',
  'Autokatoksen laajennus 3x6m',
  'Autokatoksen laajennus 3x6m',
  'Carport extension 3x6m',
  'Kevyt autokatos tai laajennus pihalle',
  'Kevyt autokatos tai laajennus yhdelle autolle pihalle.',
  'Light carport or extension for one car in the yard.',
  'garage',
  'garage',
  $scene$// Autokatoksen laajennus 3x6m
const slab = box(3, 0.12, 6);
const post1 = translate(box(0.16, 2.45, 0.16), -1.3, 1.35, -2.5);
const post2 = translate(box(0.16, 2.45, 0.16), 1.3, 1.35, -2.5);
const post3 = translate(box(0.16, 2.45, 0.16), -1.3, 1.35, 2.5);
const post4 = translate(box(0.16, 2.45, 0.16), 1.3, 1.35, 2.5);
const roof = translate(rotate(box(3.5, 0.07, 6.4), 0.08, 0, 0), 0, 2.8, 0);
scene.add(slab, { material: "foundation", color: [0.62, 0.62, 0.6] });
scene.add(post1, { material: "lumber", color: [0.58, 0.43, 0.27] });
scene.add(post2, { material: "lumber", color: [0.58, 0.43, 0.27] });
scene.add(post3, { material: "lumber", color: [0.58, 0.43, 0.27] });
scene.add(post4, { material: "lumber", color: [0.58, 0.43, 0.27] });
scene.add(roof, { material: "roofing", color: [0.28, 0.29, 0.29] });$scene$,
  '[{"material_id":"pine_48x148_c24","quantity":44,"unit":"jm"},{"material_id":"pine_48x98_c24","quantity":26,"unit":"jm"},{"material_id":"galvanized_roofing","quantity":22,"unit":"m2"},{"material_id":"concrete_block","quantity":16,"unit":"kpl"},{"material_id":"screws_50mm","quantity":260,"unit":"kpl"}]'::jsonb,
  $thumb$data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="%23131517"/><rect x="190" y="300" width="260" height="28" fill="%236b6b68"/><rect x="205" y="160" width="24" height="142" fill="%23a17748"/><rect x="410" y="160" width="24" height="142" fill="%23a17748"/><path d="M170 150h300l-26-62H196z" fill="%23393b3d"/></svg>$thumb$,
  6500,
  'intermediate',
  18,
  true,
  false,
  'approved'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_fi = EXCLUDED.name_fi,
  name_en = EXCLUDED.name_en,
  description = EXCLUDED.description,
  description_fi = EXCLUDED.description_fi,
  description_en = EXCLUDED.description_en,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  scene_js = EXCLUDED.scene_js,
  bom = EXCLUDED.bom,
  thumbnail_url = EXCLUDED.thumbnail_url,
  estimated_cost = EXCLUDED.estimated_cost,
  difficulty = EXCLUDED.difficulty,
  area_m2 = EXCLUDED.area_m2,
  is_featured = EXCLUDED.is_featured,
  is_community = EXCLUDED.is_community,
  moderation_status = EXCLUDED.moderation_status,
  updated_at = now();
