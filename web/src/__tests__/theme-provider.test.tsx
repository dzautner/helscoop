import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider, useTheme, DARK_MOODS } from "@/components/ThemeProvider";

let mockMediaMatches = true;
let changeHandler: ((e: { matches: boolean }) => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mockMediaMatches = true;
  changeHandler = null;
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-mood");
  document.documentElement.classList.remove("theme-transitioning");

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      get matches() {
        return mockMediaMatches;
      },
      addEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
        changeHandler = handler;
      },
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function TestConsumer() {
  const { theme, resolved, mood, toggle, setTheme, setMood } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolved}</span>
      <span data-testid="mood">{mood}</span>
      <button data-testid="toggle" onClick={toggle}>toggle</button>
      <button data-testid="set-light" onClick={() => setTheme("light")}>light</button>
      <button data-testid="set-auto" onClick={() => setTheme("auto")}>auto</button>
      <button data-testid="set-mood-cool" onClick={() => setMood("cool")}>cool</button>
      <button data-testid="set-mood-black" onClick={() => setMood("black")}>black</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(<ThemeProvider><span>child</span></ThemeProvider>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("defaults to dark theme", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("defaults to warm mood", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(screen.getByTestId("mood").textContent).toBe("warm");
  });

  it("toggles through dark → light → auto cycle", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("light");
    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("auto");
    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("setTheme updates theme and persists to localStorage", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("set-light").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(localStorage.getItem("helscoop-theme")).toBe("light");
  });

  it("resolves auto to dark when system prefers dark", () => {
    mockMediaMatches = true;
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("set-auto").click();
    });
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("resolves auto to light when system prefers light", () => {
    mockMediaMatches = false;
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("set-auto").click();
    });
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("setMood updates mood and persists to localStorage", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("set-mood-cool").click();
    });
    expect(screen.getByTestId("mood").textContent).toBe("cool");
    expect(localStorage.getItem("helscoop-mood")).toBe("cool");
  });

  it("reads stored theme from localStorage on mount", () => {
    localStorage.setItem("helscoop-theme", "light");
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("reads stored mood from localStorage on mount", () => {
    localStorage.setItem("helscoop-mood", "black");
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(screen.getByTestId("mood").textContent).toBe("black");
  });

  it("renders with defaults when localStorage reads are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("mood").textContent).toBe("warm");
  });

  it("sets data-theme attribute on document", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-mood attribute for dark theme", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    expect(document.documentElement.getAttribute("data-mood")).toBe("warm");
  });

  it("clears data-mood for light theme", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("set-light").click();
    });
    expect(document.documentElement.getAttribute("data-mood")).toBe("");
  });

  it("toggle persists to localStorage", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("toggle").click();
    });
    expect(localStorage.getItem("helscoop-theme")).toBe("light");
  });

  it("theme changes still work when localStorage writes are blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("set-light").click();
      screen.getByTestId("set-mood-cool").click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("mood").textContent).toBe("cool");
  });

  it("responds to system preference changes", () => {
    render(<ThemeProvider><TestConsumer /></ThemeProvider>);
    act(() => {
      screen.getByTestId("set-auto").click();
    });
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    act(() => {
      mockMediaMatches = false;
      changeHandler?.({ matches: false });
    });
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });
});

describe("DARK_MOODS", () => {
  it("has warm, cool, and black", () => {
    expect(DARK_MOODS).toEqual(["warm", "cool", "black"]);
  });
});

describe("useTheme outside provider", () => {
  it("returns default values without provider", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolved).toBe("dark");
    expect(result.current.mood).toBe("warm");
  });
});
