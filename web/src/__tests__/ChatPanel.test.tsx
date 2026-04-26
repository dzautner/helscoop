import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

Element.prototype.scrollIntoView = vi.fn();

const mockToast = vi.fn();
const mockTrack = vi.fn();
const mockChat = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useCursorGlow", () => ({
  useCursorGlow: () => ({
    ref: { current: null },
    onMouseMove: vi.fn(),
    onMouseLeave: vi.fn(),
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

vi.mock("@/lib/api", () => ({
  api: { chat: (...args: unknown[]) => mockChat(...args) },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/components/ConfirmDialog", () => ({
  default: ({
    open,
    onConfirm,
    onCancel,
    children,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void;
    onCancel: () => void;
    children?: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>confirm</button>
        <button onClick={onCancel}>cancel</button>
        {children}
      </div>
    ) : null,
}));

import ChatPanel from "@/components/ChatPanel";
import type { BomItem, Material } from "@/types";

beforeEach(() => {
  mockToast.mockReset();
  mockTrack.mockReset();
  mockChat.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const defaultProps = {
  sceneJs: "scene.add(box(1,1,1));",
  onApplyCode: vi.fn(),
};

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "pine_48x148_c24",
    name: "Pine C24",
    name_fi: "Pine C24",
    name_en: "Pine C24",
    category_name: "Lumber",
    category_name_fi: "Sahatavara",
    image_url: null,
    design_unit: "jm",
    substitution_group: "framing_48",
    pricing: [{ unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true }],
    ...overrides,
  };
}

function makeBomItem(overrides: Partial<BomItem> = {}): BomItem {
  return {
    material_id: "pine_48x148_c24",
    material_name: "Pine C24",
    category_name: "Lumber",
    quantity: 10,
    unit: "jm",
    unit_price: 5,
    total: 50,
    supplier: "K-Rauta",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
describe("ChatPanel — rendering", () => {
  it("renders input bar and send button", () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByLabelText("editor.chatInputLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("editor.chatSendLabel")).toBeInTheDocument();
  });

  it("renders suggestion chips when input is empty", () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByText("editor.suggestionRoof")).toBeInTheDocument();
    expect(screen.getByText("editor.suggestionWindow")).toBeInTheDocument();
    expect(screen.getByText("editor.suggestionGarage")).toBeInTheDocument();
  });

  it("hides suggestion chips when input has text", () => {
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(screen.queryByText("editor.suggestionRoof")).not.toBeInTheDocument();
  });

  it("uses describeChange placeholder initially", () => {
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel") as HTMLTextAreaElement;
    expect(input.placeholder).toBe("editor.describeChange");
  });

  it("send button is disabled when input is empty", () => {
    render(<ChatPanel {...defaultProps} />);
    const btn = screen.getByLabelText("editor.chatSendLabel");
    expect(btn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------
describe("ChatPanel — suggestion chips", () => {
  it("clicking a chip fills the input", () => {
    render(<ChatPanel {...defaultProps} />);
    fireEvent.click(screen.getByText("editor.suggestionRoof"));
    const input = screen.getByLabelText("editor.chatInputLabel") as HTMLTextAreaElement;
    expect(input.value).toBe("editor.suggestionRoof");
  });
});

// ---------------------------------------------------------------------------
// Sending messages
// ---------------------------------------------------------------------------
describe("ChatPanel — sending messages", () => {
  it("sends message on Enter key", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "Done!" });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "Add a roof" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Add a roof")).toBeInTheDocument();
    expect(screen.getByText("Done!")).toBeInTheDocument();
  });

  it("does not send on Shift+Enter", () => {
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("does not send when input is whitespace only", () => {
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("clears input after sending", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "ok" });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
    await screen.findByText("ok");
  });

  it("tracks chat_message_sent event", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "ok" });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockTrack).toHaveBeenCalledWith("chat_message_sent", expect.any(Object));
    await screen.findByText("ok");
  });

  it("shows error message on API failure", async () => {
    mockChat.mockRejectedValueOnce(new Error("Network error"));
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "fail" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("Network error", "error");
    });
    expect(screen.getByText("editor.chatError")).toBeInTheDocument();
  });

  it("calls onMessageCountChange when messages change", async () => {
    const onMessageCountChange = vi.fn();
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "ok" });
    render(<ChatPanel {...defaultProps} onMessageCountChange={onMessageCountChange} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onMessageCountChange).toHaveBeenCalledWith(2);
    });
  });

  it("includes material substitution opportunities in chat context", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "Use the cheaper substitute." });
    render(
      <ChatPanel
        {...defaultProps}
        bom={[makeBomItem()]}
        materials={[
          makeMaterial(),
          makeMaterial({
            id: "spruce_48x148_c24",
            name: "Spruce C24",
            name_fi: "Spruce C24",
            name_en: "Spruce C24",
            pricing: [{ unit_price: 3, unit: "jm", supplier_name: "STARK", is_primary: true }],
          }),
        ]}
      />,
    );

    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "Any cheaper alternatives?" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockChat).toHaveBeenCalledTimes(1);
    });
    expect(mockChat.mock.calls[0][2]).toMatchObject({
      substitutionSuggestions: [
        {
          materialId: "pine_48x148_c24",
          substituteId: "spruce_48x148_c24",
          savings: 20,
          savingsPercent: 40,
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Code extraction and apply
// ---------------------------------------------------------------------------
describe("ChatPanel — code apply flow", () => {
  it("shows apply button for messages with code blocks", async () => {
    const code = "```javascript\nscene.add(box(1,1,1));\n```";
    mockChat.mockResolvedValueOnce({ role: "assistant", content: `Here: ${code}` });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "add box" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("editor.applyToScene")).toBeInTheDocument();
    });
  });

  it("shows object count hint", async () => {
    const code = "```javascript\nscene.add(box(1,1,1));\nscene.add(sphere(1));\n```";
    mockChat.mockResolvedValueOnce({ role: "assistant", content: code });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "add stuff" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      const hint = document.querySelector(".chat-apply-hint");
      expect(hint).toBeTruthy();
      expect(hint!.textContent).toContain("2");
    });
  });

  it("opens confirm dialog on apply click", async () => {
    const code = "```javascript\nscene.add(box(1,1,1));\n```";
    mockChat.mockResolvedValueOnce({ role: "assistant", content: code });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "box" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("editor.applyToScene")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("editor.applyToScene"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("calls onApplyCode after confirming", async () => {
    const onApplyCode = vi.fn();
    const code = "```javascript\nscene.add(box(1,1,1));\n```";
    mockChat.mockResolvedValueOnce({ role: "assistant", content: code });
    render(<ChatPanel {...defaultProps} onApplyCode={onApplyCode} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "box" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("editor.applyToScene")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("editor.applyToScene"));
    fireEvent.click(screen.getByText("confirm"));
    expect(onApplyCode).toHaveBeenCalledWith("scene.add(box(1,1,1));");
  });

  it("cancels confirm dialog without applying", async () => {
    const onApplyCode = vi.fn();
    const code = "```javascript\nscene.add(box(1,1,1));\n```";
    mockChat.mockResolvedValueOnce({ role: "assistant", content: code });
    render(<ChatPanel {...defaultProps} onApplyCode={onApplyCode} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "box" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("editor.applyToScene")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("editor.applyToScene"));
    fireEvent.click(screen.getByText("cancel"));
    expect(onApplyCode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Expand / collapse
// ---------------------------------------------------------------------------
describe("ChatPanel — expand/collapse", () => {
  it("shows minimize button when expanded with messages", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "hi" });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("hi")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("editor.chatMinimize")).toBeInTheDocument();
  });

  it("has messages log role when expanded", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "hi" });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("log")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------
describe("ChatPanel — localStorage persistence", () => {
  it("persists messages to localStorage when projectId is set", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "saved" });
    render(<ChatPanel {...defaultProps} projectId="proj-1" />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("saved")).toBeInTheDocument();
    });

    const stored = localStorage.getItem("helscoop-chat-proj-1");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].content).toBe("test");
    expect(parsed[1].content).toBe("saved");
  });

  it("restores messages from localStorage on mount", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    localStorage.setItem("helscoop-chat-proj-2", JSON.stringify(messages));
    render(<ChatPanel {...defaultProps} projectId="proj-2" />);
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("world")).toBeInTheDocument();
  });

  it("ignores and clears invalid stored messages instead of crashing", () => {
    localStorage.setItem("helscoop-chat-broken", JSON.stringify({ role: "user", content: "not an array" }));

    render(<ChatPanel {...defaultProps} projectId="broken" />);

    expect(screen.getByLabelText("editor.chatInputLabel")).toBeInTheDocument();
    expect(localStorage.getItem("helscoop-chat-broken")).toBeNull();
  });

  it("filters malformed stored message entries", () => {
    localStorage.setItem(
      "helscoop-chat-partial",
      JSON.stringify([
        { role: "user", content: "keep me" },
        { role: "assistant", content: 42 },
        { role: "system", content: "drop me" },
      ]),
    );

    render(<ChatPanel {...defaultProps} projectId="partial" />);

    expect(screen.getByText("keep me")).toBeInTheDocument();
    expect(screen.queryByText("drop me")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("helscoop-chat-partial")!)).toEqual([{ role: "user", content: "keep me" }]);
  });

  it("survives unavailable localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    render(<ChatPanel {...defaultProps} projectId="blocked" />);

    expect(screen.getByLabelText("editor.chatInputLabel")).toBeInTheDocument();
  });

  it("reloads chat history when projectId changes without leaking the previous project", async () => {
    localStorage.setItem("helscoop-chat-proj-a", JSON.stringify([{ role: "user", content: "project a" }]));
    localStorage.setItem("helscoop-chat-proj-b", JSON.stringify([{ role: "assistant", content: "project b" }]));

    const { rerender } = render(<ChatPanel {...defaultProps} projectId="proj-a" />);
    expect(screen.getByText("project a")).toBeInTheDocument();

    rerender(<ChatPanel {...defaultProps} projectId="proj-b" />);

    await waitFor(() => {
      expect(screen.queryByText("project a")).not.toBeInTheDocument();
      expect(screen.getByText("project b")).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem("helscoop-chat-proj-b")!)).toEqual([{ role: "assistant", content: "project b" }]);
  });

  it("does not persist when projectId is not set", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "ok" });
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("ok")).toBeInTheDocument();
    });
    expect(localStorage.length).toBe(0);
  });
});
