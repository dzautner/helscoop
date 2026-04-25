/**
 * Extended ChatPanel tests covering:
 * - Loading state rendering during API call
 * - Message display ordering
 * - Error handling when API fails (402 credits, network errors)
 * - Diff preview toggle
 * - Reference image context indicator
 * - Grouped message styling
 * - Credit update event dispatch
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

Element.prototype.scrollIntoView = vi.fn();

const mockToast = vi.fn();
const mockTrack = vi.fn();
const mockChat = vi.fn();
const mockPlaySound = vi.fn();

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

vi.mock("@/hooks/useAmbientSound", () => ({
  useAmbientSound: () => ({ play: mockPlaySound }),
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
import { ApiError } from "@/lib/api";

beforeEach(() => {
  mockToast.mockReset();
  mockTrack.mockReset();
  mockChat.mockReset();
  mockPlaySound.mockReset();
  localStorage.clear();
});

const defaultProps = {
  sceneJs: "scene.add(box(1,1,1));",
  onApplyCode: vi.fn(),
};

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------
describe("ChatPanel extended: loading state", () => {
  it("shows shimmer bar while waiting for API response", async () => {
    let resolveChat: (value: unknown) => void;
    const chatPromise = new Promise((resolve) => {
      resolveChat = resolve;
    });
    mockChat.mockReturnValueOnce(chatPromise);

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "Add a roof" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Shimmer bar should appear during loading
    await waitFor(() => {
      expect(document.querySelector(".chat-shimmer-bar")).toBeTruthy();
    });

    // Resolve the promise
    await act(async () => {
      resolveChat!({ role: "assistant", content: "Done!" });
    });

    // Shimmer should disappear
    await waitFor(() => {
      expect(document.querySelector(".chat-shimmer-bar")).toBeFalsy();
    });
  });

  it("disables input while loading", async () => {
    let resolveChat: (value: unknown) => void;
    const chatPromise = new Promise((resolve) => {
      resolveChat = resolve;
    });
    mockChat.mockReturnValueOnce(chatPromise);

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(input.disabled).toBe(true);
    });

    await act(async () => {
      resolveChat!({ role: "assistant", content: "ok" });
    });

    await waitFor(() => {
      expect(input.disabled).toBe(false);
    });
  });

  it("disables send button while loading", async () => {
    let resolveChat: (value: unknown) => void;
    const chatPromise = new Promise((resolve) => {
      resolveChat = resolve;
    });
    mockChat.mockReturnValueOnce(chatPromise);

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const sendBtn = screen.getByLabelText("editor.chatSendLabel");
    await waitFor(() => {
      expect(sendBtn).toBeDisabled();
    });

    await act(async () => {
      resolveChat!({ role: "assistant", content: "ok" });
    });
  });
});

// ---------------------------------------------------------------------------
// Message ordering
// ---------------------------------------------------------------------------
describe("ChatPanel extended: message display ordering", () => {
  it("displays messages in chronological order (user then assistant)", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "Response 1" });
    render(<ChatPanel {...defaultProps} />);

    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "Message 1" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Response 1")).toBeInTheDocument();
    });

    // Check order: user message appears before assistant message
    const msgs = document.querySelectorAll(".chat-msg");
    expect(msgs.length).toBe(2);
    expect(msgs[0].classList.contains("chat-msg-user")).toBe(true);
    expect(msgs[1].classList.contains("chat-msg-ai")).toBe(true);
  });

  it("maintains correct order across multiple exchanges", async () => {
    mockChat
      .mockResolvedValueOnce({ role: "assistant", content: "Reply A" })
      .mockResolvedValueOnce({ role: "assistant", content: "Reply B" });

    render(<ChatPanel {...defaultProps} />);

    // Send first message
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "Msg A" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Reply A")).toBeInTheDocument();
    });

    // Send second message
    fireEvent.change(input, { target: { value: "Msg B" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Reply B")).toBeInTheDocument();
    });

    const msgs = document.querySelectorAll(".chat-msg");
    expect(msgs.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe("ChatPanel extended: error handling", () => {
  it("shows insufficient credits message on 402 error", async () => {
    mockChat.mockRejectedValueOnce(
      new ApiError("Insufficient credits", 402, "Payment Required"),
    );

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("credits.insufficient", "error");
    });
  });

  it("shows generic error message for non-402 errors", async () => {
    mockChat.mockRejectedValueOnce(new Error("Server down"));

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("Server down", "error");
    });
  });

  it("displays error fallback message in chat on failure", async () => {
    mockChat.mockRejectedValueOnce(new Error("fail"));

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("editor.chatError")).toBeInTheDocument();
    });
  });

  it("re-enables input after error", async () => {
    mockChat.mockRejectedValueOnce(new Error("fail"));

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(input.disabled).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Diff preview
// ---------------------------------------------------------------------------
describe("ChatPanel extended: diff preview", () => {
  it("toggles diff preview on button click", async () => {
    const code = "```javascript\nscene.add(box(2,2,2));\n```";
    mockChat.mockResolvedValueOnce({ role: "assistant", content: code });

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "change box" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("editor.previewDiff")).toBeInTheDocument();
    });

    // Click to expand diff
    fireEvent.click(screen.getByText("editor.previewDiff"));

    await waitFor(() => {
      const diffPreview = document.querySelector(".chat-diff-preview");
      expect(diffPreview).toBeTruthy();
    });

    // Click again to collapse
    fireEvent.click(screen.getByText("editor.previewDiff"));

    await waitFor(() => {
      const diffPreview = document.querySelector(".chat-diff-preview");
      expect(diffPreview).toBeFalsy();
    });
  });
});

// ---------------------------------------------------------------------------
// Reference image context
// ---------------------------------------------------------------------------
describe("ChatPanel extended: reference images", () => {
  it("shows reference photo count when images are provided", () => {
    render(
      <ChatPanel
        {...defaultProps}
        referenceImages={[
          {
            id: "img-1",
            project_id: "proj-1",
            original_filename: "house.jpg",
            content_type: "image/jpeg",
            byte_size: 123_456,
            width: 800,
            height: 600,
            uploaded_at: "2025-01-01",
            urls: {
              original: "/photos/img-1/original",
              thumb_200: "/photos/img-1/thumb-200",
              thumb_800: "/photos/img-1/thumb-800",
            },
          },
          {
            id: "img-2",
            project_id: "proj-1",
            original_filename: "roof.jpg",
            content_type: "image/jpeg",
            byte_size: 234_567,
            width: 1024,
            height: 768,
            uploaded_at: "2025-01-02",
            urls: {
              original: "/photos/img-2/original",
              thumb_200: "/photos/img-2/thumb-200",
              thumb_800: "/photos/img-2/thumb-800",
            },
          },
        ]}
      />,
    );

    const indicator = screen.getByLabelText("2 reference photos available to AI chat");
    expect(indicator).toBeInTheDocument();
    expect(indicator.textContent).toContain("2 house photos");
  });

  it("does not show reference photo indicator when no images", () => {
    render(<ChatPanel {...defaultProps} />);
    expect(
      screen.queryByLabelText(/reference photos available/),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sound effect
// ---------------------------------------------------------------------------
describe("ChatPanel extended: sound effects", () => {
  it("plays chatReply sound on successful response", async () => {
    mockChat.mockResolvedValueOnce({ role: "assistant", content: "ok" });

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockPlaySound).toHaveBeenCalledWith("chatReply");
    });
  });

  it("does not play sound on error", async () => {
    mockChat.mockRejectedValueOnce(new Error("fail"));

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("editor.chatError")).toBeInTheDocument();
    });

    expect(mockPlaySound).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Credit events
// ---------------------------------------------------------------------------
describe("ChatPanel extended: credit events", () => {
  it("dispatches helscoop:credits-updated event when credits in response", async () => {
    const listener = vi.fn();
    window.addEventListener("helscoop:credits-updated", listener);

    mockChat.mockResolvedValueOnce({
      role: "assistant",
      content: "ok",
      credits: { cost: 1, balance: 49 },
    });

    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(listener).toHaveBeenCalledTimes(1);
    });

    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ cost: 1, balance: 49 });

    window.removeEventListener("helscoop:credits-updated", listener);
  });
});

// ---------------------------------------------------------------------------
// Grouped messages
// ---------------------------------------------------------------------------
describe("ChatPanel extended: message grouping", () => {
  it("groups consecutive messages from the same role", async () => {
    // Set up localStorage with consecutive assistant messages
    const messages = [
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "assistant", content: "A2" },
    ];
    localStorage.setItem("helscoop-chat-group-test", JSON.stringify(messages));

    render(<ChatPanel {...defaultProps} projectId="group-test" />);

    // The second assistant message should have the grouped class
    const aiMsgs = document.querySelectorAll(".chat-msg-ai");
    expect(aiMsgs.length).toBe(2);
    expect(aiMsgs[1].classList.contains("chat-msg-grouped")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Placeholder text
// ---------------------------------------------------------------------------
describe("ChatPanel extended: placeholder text", () => {
  it("uses describeChange placeholder when no messages", () => {
    render(<ChatPanel {...defaultProps} />);
    const input = screen.getByLabelText("editor.chatInputLabel") as HTMLTextAreaElement;
    expect(input.placeholder).toBe("editor.describeChange");
  });

  it("uses continueConversation placeholder when messages exist", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    localStorage.setItem("helscoop-chat-placeholder-test", JSON.stringify(messages));

    render(<ChatPanel {...defaultProps} projectId="placeholder-test" />);
    const input = screen.getByLabelText("editor.chatInputLabel") as HTMLTextAreaElement;
    expect(input.placeholder).toBe("editor.continueConversation");
  });
});
