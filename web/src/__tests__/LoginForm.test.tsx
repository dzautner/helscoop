/**
 * Unit tests for the LoginForm component.
 *
 * Tests cover: login/register form rendering, form validation, password
 * strength indicator, error display, terms checkbox, mode toggle between
 * login and register, loading state, and accessibility attributes.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/691
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginForm from "@/components/LoginForm";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock LocaleProvider
vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const map: Record<string, string> = {
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
        "auth.googleSignIn": "Kirjaudu Googlella",
        "auth.googleSignInError": "Google-kirjautuminen epaonnistui",
        "auth.appleSignIn": "Kirjaudu Applella",
        "auth.appleSignInError": "Apple-kirjautuminen epaonnistui",
        "auth.orContinueWith": "tai jatka",
        "legal.acceptTerms": "Hyvaksyn kayttohehdot ja tietosuojakaytannon",
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
        "upgrade.aiQuotaDesc": `AI limit: ${params?.limit ?? "10"}`,
      };
      return map[key] ?? key;
    },
  }),
}));

// Mock useAnalytics
vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({
    track: vi.fn(),
  }),
}));

// Mock api module
const mockLogin = vi.fn();
const mockRegister = vi.fn();
const mockGoogleLogin = vi.fn();
const mockAppleLogin = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    login: (...args: unknown[]) => mockLogin(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    googleLogin: (...args: unknown[]) => mockGoogleLogin(...args),
    appleLogin: (...args: unknown[]) => mockAppleLogin(...args),
  },
  setToken: vi.fn(),
}));

// Mock child components that are not under test
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const defaultProps = {
  onLogin: vi.fn(),
  pendingBuilding: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogin.mockReset();
  mockRegister.mockReset();
  mockGoogleLogin.mockReset();
  mockAppleLogin.mockReset();
});

// ---------------------------------------------------------------------------
// 1. Login form rendering
// ---------------------------------------------------------------------------
describe("LoginForm — login mode", () => {
  it("renders login title by default", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByText("Kirjaudu sisaan")).toBeDefined();
  });

  it("renders email and password inputs", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByLabelText("Sahkoposti")).toBeDefined();
    expect(screen.getByLabelText("Salasana")).toBeDefined();
  });

  it("renders login button", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Kirjaudu" })).toBeDefined();
  });

  it("does not render name input in login mode", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.queryByLabelText("Nimi")).toBeNull();
  });

  it("renders forgot password link in login mode", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByText("Unohditko salasanan?")).toBeDefined();
  });

  it("renders switch-to-register link", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByText("Ei tilia? Rekisteroidy")).toBeDefined();
  });

  it("renders Google and Apple OAuth buttons prominently", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Kirjaudu Googlella/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Kirjaudu Applella/ })).toBeDefined();
  });

  it("shows pending building address in subtitle", () => {
    render(
      <LoginForm
        {...defaultProps}
        pendingBuilding={{
          address: "Ribbingintie 109",
          coordinates: { lat: 60.17, lon: 24.94 },
          building_info: { type: "omakotitalo", year_built: 1985, material: "puu", floors: 2, area_m2: 135, heating: "kaukolampo" },
          scene_js: "",
          bom_suggestion: [],
          confidence: "verified",
          data_sources: [],
        }}
      />,
    );
    expect(screen.getByText(/Ribbingintie 109/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Register mode
// ---------------------------------------------------------------------------
describe("LoginForm — register mode", () => {
  it("switches to register mode when toggle is clicked", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    expect(screen.getByText("Luo tili")).toBeDefined();
  });

  it("renders name input in register mode", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    expect(screen.getByLabelText("Nimi")).toBeDefined();
  });

  it("renders terms checkbox in register mode", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    expect(screen.getByRole("checkbox")).toBeDefined();
  });

  it("renders register button in register mode", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    expect(screen.getByRole("button", { name: "Rekisteroidy" })).toBeDefined();
  });

  it("switches back to login mode", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    fireEvent.click(screen.getByText("Onko jo tili? Kirjaudu"));
    expect(screen.getByText("Kirjaudu sisaan")).toBeDefined();
  });

  it("clears errors when switching modes", () => {
    render(<LoginForm {...defaultProps} />);
    // Switch to register, submit without terms to trigger error
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));

    // Fill required fields
    fireEvent.change(screen.getByLabelText("Nimi"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Sahkoposti"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "Password1!" } });

    // Submit without checking terms
    fireEvent.submit(screen.getByRole("button", { name: "Rekisteroidy" }).closest("form")!);

    // Error should appear
    expect(screen.getByRole("alert")).toBeDefined();

    // Switch back to login — error should disappear
    fireEvent.click(screen.getByText("Onko jo tili? Kirjaudu"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Password strength indicator
// ---------------------------------------------------------------------------
describe("LoginForm — password strength", () => {
  it("shows weak indicator for short passwords", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "abc" } });
    expect(screen.getByText("Heikko")).toBeDefined();
  });

  it("shows medium indicator for password with length and number", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "password1" } });
    expect(screen.getByText("Keskitaso")).toBeDefined();
  });

  it("shows strong indicator for complex password", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "MyPass1!x" } });
    expect(screen.getByText("Vahva")).toBeDefined();
  });

  it("does not show strength indicator in login mode", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "password" } });
    expect(screen.queryByText("Heikko")).toBeNull();
    expect(screen.queryByText("Keskitaso")).toBeNull();
    expect(screen.queryByText("Vahva")).toBeNull();
  });

  it("renders password strength meter with aria attributes", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "MyPass1!x" } });
    const meter = screen.getByRole("meter");
    expect(meter).toBeDefined();
    expect(meter.getAttribute("aria-label")).toBe("Salasanan vahvuus");
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// 4. Form submission
// ---------------------------------------------------------------------------
describe("LoginForm — form submission", () => {
  it("calls api.login on login submit", async () => {
    mockLogin.mockResolvedValue({ token: "jwt-token", token_expires_at: 9999999999 });

    render(<LoginForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Sahkoposti"), { target: { value: "user@test.com" } });
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Kirjaudu" }).closest("form")!);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("user@test.com", "password123");
    });
  });

  it("calls onLogin after successful login", async () => {
    const onLogin = vi.fn();
    mockLogin.mockResolvedValue({ token: "jwt-token", token_expires_at: 9999999999 });

    render(<LoginForm onLogin={onLogin} pendingBuilding={null} />);
    fireEvent.change(screen.getByLabelText("Sahkoposti"), { target: { value: "user@test.com" } });
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Kirjaudu" }).closest("form")!);

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  it("displays error message on login failure", async () => {
    mockLogin.mockRejectedValue(new Error("Invalid credentials"));

    render(<LoginForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Sahkoposti"), { target: { value: "user@test.com" } });
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button", { name: "Kirjaudu" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Invalid credentials")).toBeDefined();
    });
  });

  it("displays generic error when error is not an Error instance", async () => {
    mockLogin.mockRejectedValue("something went wrong");

    render(<LoginForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Sahkoposti"), { target: { value: "user@test.com" } });
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button", { name: "Kirjaudu" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Kirjautuminen epaonnistui")).toBeDefined();
    });
  });

  it("rejects register without accepting terms", () => {
    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    fireEvent.change(screen.getByLabelText("Nimi"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Sahkoposti"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "StrongPass1!" } });

    fireEvent.submit(screen.getByRole("button", { name: "Rekisteroidy" }).closest("form")!);

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Sinun taytyy hyvaksya kayttoehdot")).toBeDefined();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("calls api.register when terms are accepted", async () => {
    mockRegister.mockResolvedValue({ token: "jwt-token", token_expires_at: 9999999999 });

    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByText("Ei tilia? Rekisteroidy"));
    fireEvent.change(screen.getByLabelText("Nimi"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText("Sahkoposti"), { target: { value: "test@test.com" } });
    fireEvent.change(screen.getByLabelText("Salasana"), { target: { value: "StrongPass1!" } });
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.submit(screen.getByRole("button", { name: "Rekisteroidy" }).closest("form")!);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith("test@test.com", "StrongPass1!", "Test User");
    });
  });

  it("uses Apple Sign In popup result to authenticate", async () => {
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID = "fi.helscoop.web";
    mockAppleLogin.mockResolvedValue({ token: "jwt-token", token_expires_at: 9999999999 });
    Object.defineProperty(window, "AppleID", {
      configurable: true,
      value: {
        auth: {
          init: vi.fn(),
          signIn: vi.fn().mockResolvedValue({
            authorization: { id_token: "apple-id-token" },
            user: { name: { firstName: "Apple", lastName: "User" }, email: "apple@test.com" },
          }),
        },
      },
    });

    render(<LoginForm {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Kirjaudu Applella/ }));

    await waitFor(() => {
      expect(mockAppleLogin).toHaveBeenCalledWith(
        "apple-id-token",
        { name: { firstName: "Apple", lastName: "User" }, email: "apple@test.com" },
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Address search slot
// ---------------------------------------------------------------------------
describe("LoginForm — address search", () => {
  it("renders address search slot when provided", () => {
    render(
      <LoginForm
        {...defaultProps}
        addressSearch={<div data-testid="custom-search">Search</div>}
      />,
    );
    expect(screen.getByTestId("custom-search")).toBeDefined();
  });

  it("does not render address search section when not provided", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.queryByText("Etsi osoitteella")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Branding elements
// ---------------------------------------------------------------------------
describe("LoginForm — branding", () => {
  it("renders hero illustration", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByTestId("hero-illustration")).toBeDefined();
  });

  it("renders trust layer", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByTestId("trust-layer")).toBeDefined();
  });

  it("renders language switcher", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByTestId("language-switcher")).toBeDefined();
  });

  it("renders theme toggle", () => {
    render(<LoginForm {...defaultProps} />);
    expect(screen.getByTestId("theme-toggle")).toBeDefined();
  });

  it("renders privacy and terms links", () => {
    render(<LoginForm {...defaultProps} />);
    const privacyLinks = screen.getAllByText("tietosuojakaytanto");
    const termsLinks = screen.getAllByText("kayttohehdot");
    expect(privacyLinks.length).toBeGreaterThanOrEqual(1);
    expect(termsLinks.length).toBeGreaterThanOrEqual(1);
  });
});
