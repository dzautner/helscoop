import type { AssemblyGuide, AssemblyGuideStep } from "@/lib/assembly-guide";

export type TimelapseSpeed = 0.5 | 1 | 2 | 4;
export type TimelapseCameraMode = "orbit" | "follow" | "cinematic";

export interface ConstructionTimelapseStep {
  id: string;
  index: number;
  title: string;
  categoryLabel: string;
  scheduledDay: string;
  startDay: number;
  endDay: number;
  startSecond: number;
  durationSeconds: number;
  progressStart: number;
  progressEnd: number;
  materialCount: number;
  stepCost: number;
  runningCost: number;
  estimatedMinutes: number;
  layerIds: string[];
  annotation: string;
}

export interface ConstructionTimelapsePlan {
  steps: ConstructionTimelapseStep[];
  totalSeconds: number;
  totalDays: number;
  weekendEstimate: number;
  totalCost: number;
  cameraModes: TimelapseCameraMode[];
}

export interface TimelapseExportFrame {
  frame: number;
  timeSeconds: number;
  stepIndex: number;
  stepTitle: string;
  scheduledDay: string;
  progress: number;
  cameraMode: TimelapseCameraMode;
  visibleLayerIds: string[];
  annotation: string;
}

const MINUTES_PER_BUILD_DAY = 360;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function stepDurationSeconds(step: AssemblyGuideStep): number {
  return round(clamp(2 + step.estimatedMinutes / 90, 2, 4), 1);
}

function scheduledDayLabel(startDay: number, endDay: number): string {
  return startDay === endDay ? `Day ${startDay}` : `Day ${startDay}-${endDay}`;
}

function stepAnnotation(step: AssemblyGuideStep): string {
  const part = step.parts[0];
  if (!part) return step.description;
  const quantity = Number.isInteger(part.quantity) ? String(Math.round(part.quantity)) : part.quantity.toFixed(1);
  return `Adding ${quantity} ${part.unit} ${part.name}`;
}

export function buildConstructionTimelapse(guide: AssemblyGuide): ConstructionTimelapsePlan {
  let elapsedMinutes = 0;
  let elapsedSeconds = 0;
  let runningCost = 0;
  const totalSeconds = guide.steps.reduce((sum, step) => sum + stepDurationSeconds(step), 0);

  const steps = guide.steps.map((step) => {
    const startDay = Math.floor(elapsedMinutes / MINUTES_PER_BUILD_DAY) + 1;
    const endMinutes = elapsedMinutes + step.estimatedMinutes;
    const endDay = Math.max(startDay, Math.ceil(endMinutes / MINUTES_PER_BUILD_DAY));
    const durationSeconds = stepDurationSeconds(step);
    runningCost += step.approxCost;

    const item: ConstructionTimelapseStep = {
      id: step.id,
      index: step.index,
      title: step.title,
      categoryLabel: step.categoryLabel,
      scheduledDay: scheduledDayLabel(startDay, endDay),
      startDay,
      endDay,
      startSecond: round(elapsedSeconds, 1),
      durationSeconds,
      progressStart: totalSeconds > 0 ? round(elapsedSeconds / totalSeconds, 4) : 0,
      progressEnd: totalSeconds > 0 ? round((elapsedSeconds + durationSeconds) / totalSeconds, 4) : 1,
      materialCount: step.parts.length,
      stepCost: round(step.approxCost),
      runningCost: round(runningCost),
      estimatedMinutes: step.estimatedMinutes,
      layerIds: step.layerIds,
      annotation: stepAnnotation(step),
    };
    elapsedMinutes = endMinutes;
    elapsedSeconds += durationSeconds;
    return item;
  });

  return {
    steps,
    totalSeconds: round(totalSeconds, 1),
    totalDays: Math.max(1, Math.ceil(guide.totalMinutes / MINUTES_PER_BUILD_DAY)),
    weekendEstimate: Math.max(1, Math.ceil(Math.ceil(guide.totalMinutes / MINUTES_PER_BUILD_DAY) / 2)),
    totalCost: round(guide.totalCost),
    cameraModes: ["orbit", "follow", "cinematic"],
  };
}

export function stepIndexAtTime(plan: ConstructionTimelapsePlan, elapsedSeconds: number): number {
  if (plan.steps.length === 0) return 0;
  const clamped = clamp(elapsedSeconds, 0, Math.max(0, plan.totalSeconds - 0.001));
  const index = plan.steps.findIndex((step) => clamped >= step.startSecond && clamped < step.startSecond + step.durationSeconds);
  return index === -1 ? plan.steps.length - 1 : index;
}

export function elapsedSecondsForStep(plan: ConstructionTimelapsePlan, stepIndex: number): number {
  const step = plan.steps[clamp(stepIndex, 0, Math.max(0, plan.steps.length - 1))];
  return step?.startSecond ?? 0;
}

export function buildTimelapseFrames(
  plan: ConstructionTimelapsePlan,
  cameraMode: TimelapseCameraMode,
  fps = 6,
): TimelapseExportFrame[] {
  if (plan.steps.length === 0 || plan.totalSeconds <= 0) return [];
  const safeFps = Math.max(1, fps);
  const frameCount = Math.max(1, Math.ceil(plan.totalSeconds * safeFps) + 1);
  return Array.from({ length: frameCount }, (_, frame) => {
    const timeSeconds = Math.min(plan.totalSeconds, frame / safeFps);
    const stepIndex = stepIndexAtTime(plan, timeSeconds);
    const step = plan.steps[stepIndex];
    return {
      frame,
      timeSeconds: round(timeSeconds, 3),
      stepIndex,
      stepTitle: step.title,
      scheduledDay: step.scheduledDay,
      progress: round(Math.min(1, timeSeconds / plan.totalSeconds), 4),
      cameraMode,
      visibleLayerIds: plan.steps.slice(0, stepIndex + 1).flatMap((entry) => entry.layerIds),
      annotation: step.annotation,
    };
  });
}

export function buildTimelapseExportJson(
  plan: ConstructionTimelapsePlan,
  cameraMode: TimelapseCameraMode,
  fps = 6,
): string {
  const safeFps = Math.max(1, fps);
  return JSON.stringify({
    version: 1,
    type: "helscoop-construction-timelapse",
    totalSeconds: plan.totalSeconds,
    totalDays: plan.totalDays,
    cameraMode,
    fps: safeFps,
    steps: plan.steps,
    frames: buildTimelapseFrames(plan, cameraMode, safeFps),
  }, null, 2);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTimelapseSvg(plan: ConstructionTimelapsePlan, cameraMode: TimelapseCameraMode): string {
  const width = 1280;
  const height = 720;
  const barWidth = 980;
  const barX = 150;
  const stepRows = plan.steps.slice(0, 12);
  const rows = stepRows.map((step, index) => {
    const x = barX + step.progressStart * barWidth;
    const w = Math.max(12, (step.progressEnd - step.progressStart) * barWidth);
    const y = 210 + index * 30;
    return `<rect x="${round(x)}" y="${y}" width="${round(w)}" height="18" rx="9" fill="#e5a04b">
      <animate attributeName="opacity" values="0.18;1;0.55" begin="${step.startSecond}s" dur="${step.durationSeconds}s" fill="freeze" />
    </rect>
    <text x="150" y="${y + 14}" fill="#f5efe3" font-size="14">${escapeXml(step.scheduledDay)} - ${escapeXml(step.title)}</text>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="1280" height="720" fill="#111512" />
  <radialGradient id="glow" cx="50%" cy="28%" r="55%">
    <stop offset="0%" stop-color="#4a7c59" stop-opacity="0.42" />
    <stop offset="100%" stop-color="#111512" stop-opacity="0" />
  </radialGradient>
  <rect width="1280" height="720" fill="url(#glow)" />
  <text x="80" y="92" fill="#f5efe3" font-family="monospace" font-size="40" font-weight="700">Helscoop construction time-lapse</text>
  <text x="80" y="132" fill="#c9c0ae" font-family="monospace" font-size="18">${plan.steps.length} steps - ${plan.totalDays} build days - ${plan.weekendEstimate} weekends - ${escapeXml(cameraMode)} camera</text>
  <rect x="${barX}" y="164" width="${barWidth}" height="14" rx="7" fill="#2b332d" />
  <rect x="${barX}" y="164" width="0" height="14" rx="7" fill="#e5a04b">
    <animate attributeName="width" from="0" to="${barWidth}" dur="${Math.max(1, plan.totalSeconds)}s" fill="freeze" />
  </rect>
  ${rows}
  <text x="80" y="660" fill="#8f9c8f" font-family="monospace" font-size="15">SVG storyboard export. Use the JSON frame plan for PNG/video assembly.</text>
</svg>
`;
}

export function formatTimelapseDuration(seconds: number): string {
  if (seconds < 60) return `${round(seconds, 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return rem ? `${minutes}m ${rem}s` : `${minutes}m`;
}
