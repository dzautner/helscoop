import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

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

import UpgradeGate from "@/components/UpgradeGate";

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as any).location;
  (window as any).location = { href: "" };
});

describe("UpgradeGate", () => {
  it("renders headline for generic feature", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByText("upgrade.title")).toBeInTheDocument();
  });

  it("renders AI quota headline for aiMessages feature", () => {
    render(<UpgradeGate feature="aiMessages" requiredPlan="pro" currentPlan="free" aiLimit={10} />);
    expect(screen.getByText("upgrade.aiQuotaExhausted")).toBeInTheDocument();
  });

  it("renders AI quota description with limit", () => {
    render(<UpgradeGate feature="aiMessages" requiredPlan="pro" currentPlan="free" aiLimit={25} />);
    expect(screen.getByText(/upgrade\.aiQuotaDesc.*25/)).toBeInTheDocument();
  });

  it("renders pro CTA when requiredPlan is pro", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByText("upgrade.ctaPro")).toBeInTheDocument();
  });

  it("renders enterprise CTA when requiredPlan is enterprise", () => {
    render(<UpgradeGate feature="apiAccess" requiredPlan="enterprise" currentPlan="free" />);
    expect(screen.getByText("upgrade.ctaEnterprise")).toBeInTheDocument();
  });

  it("renders dismiss button with aria-label", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByLabelText("upgrade.dismiss")).toBeInTheDocument();
  });

  it("dismisses on dismiss button click", () => {
    const onDismiss = vi.fn();
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText("upgrade.dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("returns null after dismiss", () => {
    const { container } = render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    fireEvent.click(screen.getByLabelText("upgrade.dismiss"));
    expect(container.innerHTML).toBe("");
  });

  it("dismisses on ghost button click", () => {
    const onDismiss = vi.fn();
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" onDismiss={onDismiss} />);
    const buttons = screen.getAllByText("upgrade.dismiss");
    const ghostBtn = buttons.find((b) => b.closest("button")?.classList.contains("btn-ghost"));
    fireEvent.click(ghostBtn!);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("navigates to /pricing on CTA click", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    fireEvent.click(screen.getByText("upgrade.ctaPro"));
    expect(window.location.href).toBe("/pricing");
  });

  it("renders feature comparison table header", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByText("upgrade.featureComparison")).toBeInTheDocument();
  });

  it("renders all three plan names", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByText("upgrade.free")).toBeInTheDocument();
    expect(screen.getByText("upgrade.pro")).toBeInTheDocument();
    expect(screen.getByText("upgrade.enterprise")).toBeInTheDocument();
  });

  it("renders feature rows", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByText("upgrade.featureAiMessages")).toBeInTheDocument();
    expect(screen.getByText("upgrade.featurePremiumExport")).toBeInTheDocument();
    expect(screen.getByText("upgrade.featureCustomMaterials")).toBeInTheDocument();
    expect(screen.getByText("upgrade.featureApiAccess")).toBeInTheDocument();
  });

  it("shows unlimited text for enterprise features", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    const unlimiteds = screen.getAllByText("upgrade.unlimited");
    expect(unlimiteds.length).toBeGreaterThanOrEqual(1);
  });

  it("renders as modal overlay by default", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders with aria-modal on dialog", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("renders inline without dialog role", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" inline />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses on Escape key in modal mode", () => {
    const onDismiss = vi.fn();
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("dismisses on backdrop click", () => {
    const onDismiss = vi.fn();
    const { container } = render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" onDismiss={onDismiss} />);
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows numeric values for free plan AI messages", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders upgrade icon SVG", () => {
    render(<UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />);
    const dialog = screen.getByRole("dialog");
    const svgs = dialog.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });
});
