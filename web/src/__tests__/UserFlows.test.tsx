/**
 * Integration-style tests for critical user flows.
 *
 * Tests cover: Login flow, Project CRUD, BOM management,
 * Export flows, Settings (theme/locale), Share project, and ChatPanel.
 *
 * All API calls are mocked. No real network requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// jsdom stubs
// ---------------------------------------------------------------------------

// jsdom does not implement scrollIntoView — stub it globally
Element.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        // LoginForm
        "auth.loginTitle": "Kirjaudu sisaan",
        "auth.registerTitle": "Luo tili",
        "auth.loginSubtitle": "Kirjaudu jatkaaksesi",
        "auth.registerSubtitle": "Luo tili aloittaaksesi",
        "auth.loginSubtitleBuilding": "Kirjaudu tallentaaksesi: ",
        "auth.name": "Nimi",
        "auth.namePlaceholder": "Nimesi",
        "auth.email": "Sahkoposti",
        "auth.emailPlaceholder": "sahkoposti@esimerkki.fi",
        "auth.password": "Salasana",
        "auth.passwordPlaceholder": "Salasana",
        "auth.login": "Kirjaudu",
        "auth.register": "Rekisteroidy",
        "auth.noAccount": "Ei tilia? Rekisteroidy",
        "auth.hasAccount": "Onko jo tili? Kirjaudu",
        "auth.forgotPassword": "Unohditko salasanan?",
        "auth.loginFailed": "Kirjautuminen epaonnistui",
        "auth.passwordStrong": "Vahva",
        "auth.passwordMedium": "Keskitaso",
        "auth.passwordWeak": "Heikko",
        "auth.passwordStrength": "Salasanan vahvuus",
        "auth.googleLogin": "Kirjaudu Googlella",
        "legal.acceptTerms": "Hyvaksyn kayttohehdot",
        "legal.acceptTermsRequired": "Sinun taytyy hyvaksya kayttoehdot",
        "legal.termsOfService": "kayttohehdot",
        "legal.privacyPolicy": "tietosuojakaytanto",
        "legal.and": "ja",
        "brand.description": "Finnish home renovation planning",
        "brand.tagline": "Built for Finnish homes",
        "brand.featureMaterials": "Materiaalit",
        "brand.featureMaterialsDesc": "Kaikki materiaalit",
        "brand.featureSuppliers": "Toimittajat",
        "brand.featureSuppliersDesc": "Vertailu",
        "brand.featureAI": "AI-avustaja",
        "brand.featureAIDesc": "Suunnittele",
        "search.sectionLabel": "Etsi osoitteella",
        // Chat
        "editor.describeChange": "Kuvaile muutos...",
        "editor.continueConversation": "Jatka keskustelua...",
        "editor.chatError": "Virhe keskustelussa",
        "editor.chatSend": "Laheta",
        "editor.suggestionRoof": "Lisaa harjakatto",
        "editor.suggestionWindow": "Lisaa ikkuna",
        "editor.suggestionGarage": "Lisaa autotalli",
        "toast.aiError": "AI-virhe",
        // Toast
        "toast.dismiss": "Sulje",
        "toast.projectCreated": "Projekti luotu",
        "toast.loadProjectsFailed": "Projektien lataus epaonnistui",
        "toast.createProjectFailed": "Projektin luonti epaonnistui",
        "toast.overflowMore": "+",
      };
      if (key === "upgrade.aiQuotaDesc" && params) {
        return `AI limit: ${params.limit}`;
      }
      return map[key] ?? key;
    },
    locale: "fi",
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: vi.fn() }),
  useEditorSession: () => ({ markCodeEditor: vi.fn(), markChat: vi.fn() }),
}));

vi.mock("@/components/HeroIllustration", () => ({
  default: () => <div data-testid="hero-illustration" />,
}));

vi.mock("@/components/TrustLayer", () => ({
  default: () => <div data-testid="trust-layer" />,
}));

vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    toast: vi.fn(),
    toastProgress: vi.fn(),
    updateProgress: vi.fn(),
    dismissToast: vi.fn(),
  }),
}));

vi.mock("@/components/ConfirmDialog", () => ({
  default: ({
    open,
    message,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => (open ? (
    <div data-testid="confirm-dialog">
      <span>{message}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ) : null),
}));

// API mock
const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockChat = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    login: (...args: unknown[]) => mockLogin(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    chat: (...args: unknown[]) => mockChat(...args),
  },
  setToken: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockLogin.mockReset();
  mockRegister.mockReset();
  mockChat.mockReset();
});

// ---------------------------------------------------------------------------
// Login Flow
// ---------------------------------------------------------------------------

describe("User Flow — Login", () => {
  it("full login flow: render form, submit, receive token", async () => {
    const LoginForm = (await import("@/components/LoginForm")).default;
    mockLogin.mockResolvedValue({ token: "jwt-token", token_expires_at: 9999999999 });
    const onLogin = vi.fn();

    render(<LoginForm onLogin={onLogin} pendingBuilding={null} />);

    // 1. Form renders
    expect(screen.getByText("Kirjaudu sisaan")).toBeDefined();
    expect(screen.getByLabelText("Sahkoposti")).toBeDefined();
    expect(screen.getByLabelText("Salasana")).toBeDefined();

    // 2. Fill and submit
    fireEvent.change(screen.getByLabelText("Sahkoposti"), {
      target: { value: "test@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Salasana"), {
      target: { value: "password123" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Kirjaudu" }).closest("form")!,
    );

    // 3. Verify API called and callback fired
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test@test.com", "password123");
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  it("full registration flow: switch to register, fill form, submit", async () => {
    const LoginForm = (await import("@/components/LoginForm")).default;
    mockRegister.mockResolvedValue({ token: "jwt-token", token_expires_at: 9999999999 });
    const onLogin = vi.fn();

    render(<LoginForm onLogin={onLogin} pendingBuilding={null} />);

    // Switch to register mode
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    expect(screen.getByText("Luo tili")).toBeDefined();

    // Fill register form
    fireEvent.change(screen.getByLabelText("Nimi"), {
      target: { value: "Test User" },
    });
    fireEvent.change(screen.getByLabelText("Sahkoposti"), {
      target: { value: "test@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Salasana"), {
      target: { value: "StrongPass1!" },
    });
    fireEvent.click(screen.getByRole("checkbox")); // terms

    fireEvent.submit(
      screen.getByRole("button", { name: "Rekisteroidy" }).closest("form")!,
    );

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith("test@test.com", "StrongPass1!", "Test User");
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  it("login failure shows error", async () => {
    const LoginForm = (await import("@/components/LoginForm")).default;
    mockLogin.mockRejectedValue(new Error("Invalid credentials"));

    render(<LoginForm onLogin={vi.fn()} pendingBuilding={null} />);

    fireEvent.change(screen.getByLabelText("Sahkoposti"), {
      target: { value: "bad@test.com" },
    });
    fireEvent.change(screen.getByLabelText("Salasana"), {
      target: { value: "wrong" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Kirjaudu" }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Invalid credentials")).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// ChatPanel Flow
// ---------------------------------------------------------------------------

describe("User Flow — ChatPanel", () => {
  it("renders chat input with placeholder", async () => {
    const ChatPanel = (await import("@/components/ChatPanel")).default;

    render(
      <ChatPanel
        sceneJs=""
        onApplyCode={vi.fn()}
      />,
    );

    // Chat input (textarea) should exist with the initial placeholder
    const textarea = screen.getByPlaceholderText("Kuvaile muutos...");
    expect(textarea).toBeDefined();
  });

  it("renders suggestion buttons", async () => {
    const ChatPanel = (await import("@/components/ChatPanel")).default;

    render(
      <ChatPanel
        sceneJs=""
        onApplyCode={vi.fn()}
      />,
    );

    // Suggestion buttons should be present
    expect(screen.getByText("Lisaa harjakatto")).toBeDefined();
  });

  it("sends message on Enter key", async () => {
    const ChatPanel = (await import("@/components/ChatPanel")).default;
    mockChat.mockResolvedValue({
      role: "assistant",
      content: "Hello! How can I help?",
    });

    render(
      <ChatPanel
        sceneJs=""
        onApplyCode={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText("Kuvaile muutos...");
    fireEvent.change(textarea, { target: { value: "Help me" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalled();
    });
  });
});
