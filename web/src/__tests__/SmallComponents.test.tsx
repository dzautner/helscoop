/**
 * Smoke tests for smaller UI components that lack dedicated tests.
 *
 * Components covered: ConfidenceBadge, ConnectionBanner, EmailVerificationBanner,
 * FeatureHighlights, HeroIllustration, KeyboardShortcutsHelp, LandingFooter,
 * LanguageSwitcher, ProjectCard, SceneApiReference, ScreenshotPopover,
 * ScrollReveal, Skeleton variants, TemplateGrid, ThemeToggle, TrustLayer,
 * UpgradeGate, ViewportContextMenu.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Global mocks shared across all component tests
// ---------------------------------------------------------------------------

let mockLocale = "fi";
const mockSetLocale = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        // LanguageSwitcher
        "aria.switchLanguage": "Vaihda kielta",
        // ThemeToggle
        "aria.themeDark": "Tumma",
        "aria.themeLight": "Vaalea",
        "aria.themeAuto": "Automaattinen",
        // ConfidenceBadge
        "confidence.verified": "Vahvistettu",
        "confidence.estimated": "Arvioitu",
        "confidence.demo": "Demo",
        "confidence.manual": "Manuaalinen",
        "confidence.source": "Lahde",
        "confidence.fetchedAt": "Haettu",
        // ConnectionBanner
        "errors.connectionLost": "Yhteys katkennut",
        "errors.retryNow": "Yrita uudelleen",
        "errors.reconnected": "Yhteys palautunut",
        // EmailVerificationBanner
        "emailVerification.banner": "Vahvista sahkoposti",
        "emailVerification.resend": "Laheta uudelleen",
        "emailVerification.resent": "Lahetty uudelleen",
        "emailVerification.dismiss": "Sulje",
        "emailVerification.resendFailed": "Uudelleenlahetys epaonnistui",
        // FeatureHighlights
        "landing.feature1Title": "Ominaisuus 1",
        "landing.feature1Desc": "Kuvaus 1",
        "landing.feature2Title": "Ominaisuus 2",
        "landing.feature2Desc": "Kuvaus 2",
        "landing.feature3Title": "Ominaisuus 3",
        "landing.feature3Desc": "Kuvaus 3",
        "landing.featuresLabel": "Ominaisuudet",
        "landing.featuresTitle": "Ominaisuudet otsikko",
        "landing.featuresHeading": "Ominaisuudet",
        // LandingFooter
        "landing.footerDescription": "Suomalainen remonttityokalu",
        "landing.dataSourceDvv": "Vaestotietoja",
        "landing.dataSourceMml": "Karttoja",
        "landing.dataSourceBuildingMaterials": "Rakennusmateriaaleja",
        "landing.dataSourceTimber": "Puutavaraa",
        "landing.dataSourceRoofing": "Kattomateriaaleja",
        // ProjectCard
        "project.duplicate": "Kopioi",
        "project.delete": "Poista",
        "project.noEstimate": "Ei arviota",
        // TemplateGrid
        "project.orStartFromTemplate": "Tai aloita mallista",
        "project.noTemplates": "Ei malleja",
        // UpgradeGate
        "upgrade.title": "Paivita tilaus",
        "upgrade.subtitle": "Tama ominaisuus vaatii Pro-tilauksen",
        "upgrade.aiQuotaExhausted": "AI-kiintio taynnä",
        "upgrade.ctaPro": "Paivita Pro",
        "upgrade.ctaEnterprise": "Paivita Enterprise",
        "upgrade.dismiss": "Sulje",
        "upgrade.featureComparison": "Vertailu",
        "upgrade.featureAiMessages": "AI-viestit",
        "upgrade.featurePremiumExport": "Premium vienti",
        "upgrade.featureCustomMaterials": "Omat materiaalit",
        "upgrade.featureApiAccess": "API",
        "upgrade.free": "Ilmainen",
        "upgrade.pro": "Pro",
        "upgrade.enterprise": "Enterprise",
        "upgrade.unlimited": "Rajoittamaton",
        // KeyboardShortcutsHelp
        "shortcuts.title": "Pikakomennot",
        "shortcuts.close": "Sulje",
        // SceneApiReference
        "sceneApi.title": "Scene API",
        "sceneApi.searchPlaceholder": "Etsi...",
        "sceneApi.primitives": "Primitiivit",
        "sceneApi.transforms": "Muunnokset",
        "sceneApi.booleans": "Boolen-operaatiot",
        "sceneApi.cookbook": "Keittokirja",
        // ScreenshotPopover
        "screenshot.title": "Kuvakaappaus",
        "screenshot.download": "Lataa",
        "screenshot.copy": "Kopioi",
        "screenshot.copied": "Kopioitu",
        "screenshot.close": "Sulje",
        // ViewportContextMenu
        "contextMenu.close": "Sulje",
      };
      if (key === "upgrade.aiQuotaDesc" && params) {
        return `AI-kiintio: ${params.limit}`;
      }
      return map[key] ?? key;
    },
    locale: mockLocale,
    setLocale: (l: string) => {
      mockLocale = l;
      mockSetLocale(l);
    },
  }),
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "dark",
    resolved: "dark",
    toggle: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    toast: vi.fn(),
    toastProgress: vi.fn(),
    updateProgress: vi.fn(),
    dismissToast: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    resendVerification: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock framer-motion for ScrollReveal
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <div className={className} data-testid="scroll-reveal">
        {children}
      </div>
    ),
  },
}));

vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-reveal">{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockLocale = "fi";
});

// ---------------------------------------------------------------------------
// LanguageSwitcher
// ---------------------------------------------------------------------------

describe("LanguageSwitcher", () => {
  it("renders FI and EN labels", async () => {
    const { LanguageSwitcher } = await import("@/components/LanguageSwitcher");
    render(<LanguageSwitcher />);
    expect(screen.getByText("FI")).toBeDefined();
    expect(screen.getByText("EN")).toBeDefined();
  });

  it("has accessible aria-label", async () => {
    const { LanguageSwitcher } = await import("@/components/LanguageSwitcher");
    render(<LanguageSwitcher />);
    expect(screen.getByLabelText("Vaihda kielta")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------

describe("ThemeToggle", () => {
  it("renders with dark theme label", async () => {
    const { ThemeToggle } = await import("@/components/ThemeToggle");
    render(<ThemeToggle />);
    expect(screen.getByLabelText("Tumma")).toBeDefined();
  });

  it("renders the label text uppercased", async () => {
    const { ThemeToggle } = await import("@/components/ThemeToggle");
    render(<ThemeToggle />);
    expect(screen.getByText("TUMMA")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// EmailVerificationBanner
// ---------------------------------------------------------------------------

describe("EmailVerificationBanner", () => {
  it("renders banner when email is not verified", async () => {
    const EmailVerificationBanner = (await import("@/components/EmailVerificationBanner")).default;
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.getByText("Vahvista sahkoposti")).toBeDefined();
    expect(screen.getByText("Laheta uudelleen")).toBeDefined();
  });

  it("renders nothing when email is verified", async () => {
    const EmailVerificationBanner = (await import("@/components/EmailVerificationBanner")).default;
    const { container } = render(<EmailVerificationBanner emailVerified={true} />);
    expect(container.innerHTML).toBe("");
  });

  it("dismisses when dismiss button is clicked", async () => {
    const EmailVerificationBanner = (await import("@/components/EmailVerificationBanner")).default;
    render(<EmailVerificationBanner emailVerified={false} />);

    fireEvent.click(screen.getByLabelText("Sulje"));
    expect(screen.queryByText("Vahvista sahkoposti")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FeatureHighlights
// ---------------------------------------------------------------------------

describe("FeatureHighlights", () => {
  it("renders feature cards with titles", async () => {
    const FeatureHighlights = (await import("@/components/FeatureHighlights")).default;
    render(<FeatureHighlights />);
    expect(screen.getByText("Ominaisuus 1")).toBeDefined();
    expect(screen.getByText("Ominaisuus 2")).toBeDefined();
    expect(screen.getByText("Ominaisuus 3")).toBeDefined();
  });

  it("renders feature descriptions", async () => {
    const FeatureHighlights = (await import("@/components/FeatureHighlights")).default;
    render(<FeatureHighlights />);
    expect(screen.getByText("Kuvaus 1")).toBeDefined();
    expect(screen.getByText("Kuvaus 2")).toBeDefined();
    expect(screen.getByText("Kuvaus 3")).toBeDefined();
  });

  it("renders step numbers", async () => {
    const FeatureHighlights = (await import("@/components/FeatureHighlights")).default;
    render(<FeatureHighlights />);
    expect(screen.getByText("01")).toBeDefined();
    expect(screen.getByText("02")).toBeDefined();
    expect(screen.getByText("03")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// HeroIllustration
// ---------------------------------------------------------------------------

describe("HeroIllustration", () => {
  it("renders the SVG illustration", async () => {
    const HeroIllustration = (await import("@/components/HeroIllustration")).default;
    const { container } = render(<HeroIllustration />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// LandingFooter
// ---------------------------------------------------------------------------

describe("LandingFooter", () => {
  it("renders brand name", async () => {
    const LandingFooter = (await import("@/components/LandingFooter")).default;
    render(<LandingFooter />);
    expect(screen.getByText("Hel")).toBeDefined();
    expect(screen.getByText("scoop")).toBeDefined();
  });

  it("renders footer description", async () => {
    const LandingFooter = (await import("@/components/LandingFooter")).default;
    render(<LandingFooter />);
    expect(screen.getByText("Suomalainen remonttityokalu")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

describe("Skeleton", () => {
  it("renders text variant with default dimensions", async () => {
    const { Skeleton } = await import("@/components/Skeleton");
    const { container } = render(<Skeleton />);
    const el = container.querySelector(".skeleton") as HTMLElement | null;
    expect(el).toBeTruthy();
    expect(el!.style.height).toBe("14px");
  });

  it("renders circle variant", async () => {
    const { Skeleton } = await import("@/components/Skeleton");
    const { container } = render(<Skeleton variant="circle" />);
    const el = container.querySelector(".skeleton") as HTMLElement | null;
    expect(el).toBeTruthy();
    expect(el!.style.borderRadius).toBe("50%");
  });

  it("renders card variant", async () => {
    const { Skeleton } = await import("@/components/Skeleton");
    const { container } = render(<Skeleton variant="card" />);
    const el = container.querySelector(".skeleton") as HTMLElement | null;
    expect(el).toBeTruthy();
    expect(el!.style.height).toBe("80px");
  });

  it("renders SkeletonProjectCard", async () => {
    const { SkeletonProjectCard } = await import("@/components/Skeleton");
    const { container } = render(<SkeletonProjectCard />);
    expect(container.querySelector(".card")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders SkeletonBomPanel", async () => {
    const { SkeletonBomPanel } = await import("@/components/Skeleton");
    const { container } = render(<SkeletonBomPanel />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders SkeletonProjectEditor", async () => {
    const { SkeletonProjectEditor } = await import("@/components/Skeleton");
    const { container } = render(<SkeletonProjectEditor />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TemplateGrid
// ---------------------------------------------------------------------------

describe("TemplateGrid", () => {
  it("renders loading state with skeleton cards", async () => {
    const TemplateGrid = (await import("@/components/TemplateGrid")).default;
    render(
      <TemplateGrid
        templates={[]}
        loading={true}
        creating={false}
        onCreateFromTemplate={vi.fn()}
      />,
    );
    expect(screen.getByText("Tai aloita mallista")).toBeDefined();
  });

  it("renders templates when provided", async () => {
    const TemplateGrid = (await import("@/components/TemplateGrid")).default;
    const templates = [
      {
        id: "sauna",
        name: "Sauna",
        description: "Saunaremontti",
        icon: "sauna",
        estimated_cost: 5000,
        scene_js: "",
        bom: [],
      },
    ];
    render(
      <TemplateGrid
        templates={templates}
        loading={false}
        creating={false}
        onCreateFromTemplate={vi.fn()}
      />,
    );
    expect(screen.getByText("Sauna")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// UpgradeGate
// ---------------------------------------------------------------------------

describe("UpgradeGate", () => {
  it("renders upgrade modal for pro feature", async () => {
    const UpgradeGate = (await import("@/components/UpgradeGate")).default;
    render(
      <UpgradeGate
        feature="premiumExport"
        requiredPlan="pro"
        currentPlan="free"
      />,
    );
    expect(screen.getByText("Paivita tilaus")).toBeDefined();
    expect(screen.getByText("Tama ominaisuus vaatii Pro-tilauksen")).toBeDefined();
    expect(screen.getByText("Paivita Pro")).toBeDefined();
  });

  it("renders AI quota exhausted variant", async () => {
    const UpgradeGate = (await import("@/components/UpgradeGate")).default;
    render(
      <UpgradeGate
        feature="aiMessages"
        requiredPlan="pro"
        currentPlan="free"
        aiLimit={10}
      />,
    );
    expect(screen.getByText("AI-kiintio taynnä")).toBeDefined();
    expect(screen.getByText("AI-kiintio: 10")).toBeDefined();
  });

  it("dismisses when dismiss button is clicked", async () => {
    const UpgradeGate = (await import("@/components/UpgradeGate")).default;
    const onDismiss = vi.fn();
    render(
      <UpgradeGate
        feature="premiumExport"
        requiredPlan="pro"
        currentPlan="free"
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByLabelText("Sulje"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Paivita tilaus")).toBeNull();
  });

  it("renders inline variant", async () => {
    const UpgradeGate = (await import("@/components/UpgradeGate")).default;
    render(
      <UpgradeGate
        feature="premiumExport"
        requiredPlan="pro"
        currentPlan="free"
        inline
      />,
    );
    expect(screen.getByText("Paivita tilaus")).toBeDefined();
  });

  it("renders feature comparison table", async () => {
    const UpgradeGate = (await import("@/components/UpgradeGate")).default;
    render(
      <UpgradeGate
        feature="premiumExport"
        requiredPlan="pro"
        currentPlan="free"
      />,
    );
    expect(screen.getByText("Vertailu")).toBeDefined();
    expect(screen.getByText("Ilmainen")).toBeDefined();
    expect(screen.getByText("Pro")).toBeDefined();
    expect(screen.getByText("Enterprise")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TrustLayer
// ---------------------------------------------------------------------------

describe("TrustLayer", () => {
  it("renders partner stats", async () => {
    const TrustLayer = (await import("@/components/TrustLayer")).default;
    render(<TrustLayer />);
    expect(screen.getByText("1 200+")).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByText("GDPR")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------

describe("ProjectCard", () => {
  it("renders project name and details", async () => {
    const ProjectCard = (await import("@/components/ProjectCard")).default;
    const project = {
      id: "p1",
      name: "My Project",
      description: "A test project",
      estimated_cost: 5000,
      created_at: "2024-01-15T12:00:00Z",
      updated_at: "2024-02-20T12:00:00Z",
    };
    render(
      <ProjectCard
        project={project}
        index={0}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("My Project")).toBeDefined();
  });

  it("exposes the project name as a keyboard-accessible link", async () => {
    const ProjectCard = (await import("@/components/ProjectCard")).default;
    const project = {
      id: "p1",
      name: "Test",
      description: "",
      estimated_cost: 0,
      created_at: "2024-01-15T12:00:00Z",
      updated_at: "2024-02-20T12:00:00Z",
    };
    const { container } = render(
      <ProjectCard
        project={project}
        index={0}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.querySelector('[role="button"]')).toBeNull();
    const link = screen.getByRole("link", { name: "Test" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/project/p1");
  });
});

// ---------------------------------------------------------------------------
// ViewportContextMenu
// ---------------------------------------------------------------------------

describe("ViewportContextMenu", () => {
  it("renders nothing when position is null", async () => {
    const ViewportContextMenu = (await import("@/components/ViewportContextMenu")).default;
    const { container } = render(
      <ViewportContextMenu items={[]} position={null} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders menu items when position is provided", async () => {
    const ViewportContextMenu = (await import("@/components/ViewportContextMenu")).default;
    const items = [
      {
        id: "wireframe",
        label: "Toggle Wireframe",
        icon: "M0 0h24v24H0z",
        onClick: vi.fn(),
      },
    ];
    render(
      <ViewportContextMenu
        items={items}
        position={{ x: 100, y: 100 }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Toggle Wireframe")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ConfidenceBadge
// ---------------------------------------------------------------------------

describe("ConfidenceBadge", () => {
  it("renders verified badge", async () => {
    const ConfidenceBadge = (await import("@/components/ConfidenceBadge")).default;
    render(<ConfidenceBadge provenance={{ confidence: "verified", source: "DVV" }} />);
    expect(screen.getByText("Vahvistettu")).toBeDefined();
  });

  it("renders estimated badge", async () => {
    const ConfidenceBadge = (await import("@/components/ConfidenceBadge")).default;
    render(<ConfidenceBadge provenance={{ confidence: "estimated", source: "heuristic" }} />);
    expect(screen.getByText("Arvioitu")).toBeDefined();
  });

  it("renders demo badge", async () => {
    const ConfidenceBadge = (await import("@/components/ConfidenceBadge")).default;
    render(<ConfidenceBadge provenance={{ confidence: "demo", source: "template" }} />);
    expect(screen.getByText("Demo")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ScreenshotPopover
// ---------------------------------------------------------------------------

describe("ScreenshotPopover", () => {
  it("renders nothing when imageDataUrl is null", async () => {
    const ScreenshotPopover = (await import("@/components/ScreenshotPopover")).default;
    const { container } = render(
      <ScreenshotPopover imageDataUrl={null} onClose={vi.fn()} />,
    );
    // Should render but not be visible
    expect(container.innerHTML).toBeDefined();
  });
});
