import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockTrack = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars) return `${key}:${JSON.stringify(vars)}`;
      return key;
    },
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

vi.mock("@/lib/presentation-export", () => ({
  PRESENTATION_PRESETS: [
    { id: "front", cameraIndex: 0, labelKey: "presentation.front", descriptionKey: "presentation.frontDesc" },
    { id: "iso", cameraIndex: 3, labelKey: "presentation.iso", descriptionKey: "presentation.isoDesc" },
  ],
  getPresentationPreset: (id: string) => ({
    id,
    cameraIndex: 0,
    labelKey: `presentation.${id}`,
    descriptionKey: `presentation.${id}Desc`,
  }),
  buildPresentationUrl: (_origin: string, token: string, preset: string) =>
    `https://example.com/p/${token}?preset=${preset}`,
  formatPresentationCurrency: (amount: number) => `${amount} €`,
  sanitizePresentationFilename: (name: string, preset: string) => `${name}_${preset}.png`,
}));

import SharePresentationPanel from "@/components/SharePresentationPanel";
import type { BomItem } from "@/types";

const mockBom: BomItem[] = [
  { material_id: "m1", quantity: 5, unit: "kpl", total: 250 },
  { material_id: "m2", quantity: 3, unit: "m2", total: 150 },
];

const mockCaptureApiRef = { current: null };
const mockOnCopySuccess = vi.fn();
const mockOnCopyError = vi.fn();

beforeEach(() => { vi.clearAllMocks(); });

describe("SharePresentationPanel", () => {
  it("renders section with aria-label", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByLabelText("presentation.title")).toBeInTheDocument();
  });

  it("renders eyebrow text", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByText("presentation.eyebrow")).toBeInTheDocument();
  });

  it("renders title and description", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByText("presentation.title")).toBeInTheDocument();
    expect(screen.getByText("presentation.description")).toBeInTheDocument();
  });

  it("renders total estimate", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByText("presentation.estimate")).toBeInTheDocument();
    expect(screen.getByText("400 €")).toBeInTheDocument();
  });

  it("renders preset radio buttons", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);
  });

  it("selects iso preset by default", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    const isoRadio = screen.getAllByRole("radio").find((r) => r.getAttribute("aria-checked") === "true");
    expect(isoRadio).toBeTruthy();
  });

  it("renders copy button", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByText("presentation.copyPresentation")).toBeInTheDocument();
  });

  it("renders download button", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByText("presentation.downloadWatermarked")).toBeInTheDocument();
  });

  it("disables download when no capture API", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={{ current: null }}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    const downloadBtn = screen.getByText("presentation.downloadWatermarked").closest("button")!;
    expect(downloadBtn).toBeDisabled();
  });

  it("renders asset info", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByText("presentation.assetViewer")).toBeInTheDocument();
    expect(screen.getByText(/presentation\.assetBom/)).toBeInTheDocument();
  });

  it("has radiogroup with aria-label", () => {
    render(
      <SharePresentationPanel
        shareToken="abc123"
        projectName="Test Project"
        bom={mockBom}
        captureApiRef={mockCaptureApiRef}
        onCopySuccess={mockOnCopySuccess}
        onCopyError={mockOnCopyError}
      />,
    );
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-label", "presentation.cameraPresets");
  });
});
