import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import UserMenu from "@/components/UserMenu";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        "nav.settings": "Settings",
        "nav.logout": "Log out",
        "userMenu.avatarAriaLabel": "User menu for {{name}}",
        "userMenu.menuAriaLabel": "{{name}} menu",
      };
      let value = translations[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{{${k}}}`, String(v));
        }
      }
      return value;
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  setToken: vi.fn(),
}));

// next/link renders a plain <a> in jsdom
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const USER_NAME = "Ada Lovelace";

function openMenu() {
  const trigger = screen.getByRole("button", { name: `User menu for ${USER_NAME}` });
  fireEvent.click(trigger);
}

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the avatar button with correct aria attributes when closed", () => {
    render(<UserMenu userName={USER_NAME} />);
    const btn = screen.getByRole("button", { name: `User menu for ${USER_NAME}` });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.getAttribute("aria-haspopup")).toBe("true");
  });

  it("shows initials derived from the user name", () => {
    render(<UserMenu userName={USER_NAME} />);
    expect(screen.getByRole("button", { name: `User menu for ${USER_NAME}` }).textContent).toBe("AL");
  });

  it("opens the menu on avatar click and sets aria-expanded", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    expect(screen.getByRole("menu")).toBeDefined();
    const btn = screen.getByRole("button", { name: `User menu for ${USER_NAME}` });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders Settings and Log out menu items when open", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeDefined();
  });

  it("closes the menu when Escape is pressed", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ArrowDown moves focus from first to second item", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    act(() => { items[0].focus(); });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("ArrowDown wraps from last item to first", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    act(() => { items[items.length - 1].focus(); });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp moves focus from second to first item", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    act(() => { items[1].focus(); });
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("ArrowUp wraps from first item to last", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    act(() => { items[0].focus(); });
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("Home focuses the first menu item", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    act(() => { items[items.length - 1].focus(); });
    fireEvent.keyDown(document, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("End focuses the last menu item", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    act(() => { items[0].focus(); });
    fireEvent.keyDown(document, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("menu items have tabIndex -1 (roving focus managed via JS)", () => {
    render(<UserMenu userName={USER_NAME} />);
    openMenu();
    const items = screen.getAllByRole("menuitem");
    for (const item of items) {
      expect(item.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("closes the menu when backdrop is clicked", () => {
    const { container } = render(<UserMenu userName={USER_NAME} />);
    openMenu();
    // The backdrop is the fixed full-screen div rendered just before the card
    const backdrop = container.querySelector<HTMLElement>(
      'div[style*="position: fixed"]'
    )!;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not render the menu initially", () => {
    render(<UserMenu userName={USER_NAME} />);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
