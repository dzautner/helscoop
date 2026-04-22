import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";

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

import { ToastProvider, useToast } from "@/components/ToastProvider";

beforeEach(() => {
  vi.clearAllMocks();
});

function TestConsumer() {
  const { toast, toastProgress, updateProgress, dismissToast } = useToast();
  return (
    <div>
      <button data-testid="show-info" onClick={() => toast("Info message")}>Info</button>
      <button data-testid="show-success" onClick={() => toast("Success!", "success")}>Success</button>
      <button data-testid="show-error" onClick={() => toast("Error!", "error")}>Error</button>
      <button data-testid="show-action" onClick={() => toast("With action", "info", { action: { label: "Undo", onClick: vi.fn() } })}>Action</button>
      <button data-testid="show-progress" onClick={() => { const id = toastProgress("Uploading", 30); (window as any).__progressId = id; }}>Progress</button>
      <button data-testid="update-progress" onClick={() => updateProgress((window as any).__progressId, 80, "Almost done")}>Update</button>
      <button data-testid="dismiss" onClick={() => dismissToast(0)}>Dismiss</button>
    </div>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("ToastProvider", () => {
  it("renders children", () => {
    render(<ToastProvider><span>child</span></ToastProvider>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("renders a status container for toasts", () => {
    render(<ToastProvider><span>content</span></ToastProvider>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows info toast", () => {
    render(<ToastProvider><TestConsumer /></ToastProvider>);
    act(() => {
      screen.getByTestId("show-info").click();
    });
    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("shows success toast", () => {
    render(<ToastProvider><TestConsumer /></ToastProvider>);
    act(() => {
      screen.getByTestId("show-success").click();
    });
    expect(screen.getByText("Success!")).toBeInTheDocument();
  });

  it("shows error toast", () => {
    render(<ToastProvider><TestConsumer /></ToastProvider>);
    act(() => {
      screen.getByTestId("show-error").click();
    });
    expect(screen.getByText("Error!")).toBeInTheDocument();
  });

  it("shows toast with action button", () => {
    render(<ToastProvider><TestConsumer /></ToastProvider>);
    act(() => {
      screen.getByTestId("show-action").click();
    });
    expect(screen.getByText("With action")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("shows progress toast with percentage", () => {
    render(<ToastProvider><TestConsumer /></ToastProvider>);
    act(() => {
      screen.getByTestId("show-progress").click();
    });
    expect(screen.getByText("Uploading")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  it("toast returns an id", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id: number;
    act(() => {
      id = result.current.toast("test");
    });
    expect(typeof id!).toBe("number");
  });

  it("toastProgress returns an id", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id: number;
    act(() => {
      id = result.current.toastProgress("uploading", 0);
    });
    expect(typeof id!).toBe("number");
  });
});

describe("useToast", () => {
  it("throws when used outside ToastProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useToast());
    }).toThrow("useToast must be used within a ToastProvider");
    consoleError.mockRestore();
  });

  it("provides toast, toastProgress, updateProgress, dismissToast", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(typeof result.current.toast).toBe("function");
    expect(typeof result.current.toastProgress).toBe("function");
    expect(typeof result.current.updateProgress).toBe("function");
    expect(typeof result.current.dismissToast).toBe("function");
  });
});
