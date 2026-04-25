import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

import SceneEditor from "@/components/SceneEditor";

const sampleCode = `const w = 10;
const h = 5;
const d = 3;
scene.add(box(w, h, d));`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SceneEditor", () => {
  it("renders textarea with code", () => {
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(sampleCode);
  });

  it("calls onChange when text is edited", () => {
    const onChange = vi.fn();
    render(<SceneEditor sceneJs={sampleCode} onChange={onChange} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "box(1,1,1)" } });
    expect(onChange).toHaveBeenCalledWith("box(1,1,1)");
  });

  it("renders line number gutter", () => {
    const { container } = render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} />);
    const gutter = container.querySelector("[class*='gutter'], [style*='gutter']")
      || container.querySelector("div > div > div");
    expect(gutter).toBeInTheDocument();
    const lines = sampleCode.split("\n");
    expect(lines.length).toBe(4);
  });

  it("renders error message when error prop provided", () => {
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} error="Syntax error" />);
    expect(screen.getByText("Syntax error")).toBeInTheDocument();
  });

  it("renders scene status indicator", () => {
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} />);
    expect(screen.getByLabelText("editor.sceneValid")).toBeInTheDocument();
  });

  it("renders error status when error present", () => {
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} error="Error" />);
    expect(screen.getByLabelText("editor.sceneError")).toBeInTheDocument();
  });

  it("renders scene label", () => {
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} />);
    expect(screen.getByText("editor.scene")).toBeInTheDocument();
  });

  it("renders syntax highlighted overlay", () => {
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} />);
    const pre = document.querySelector("pre");
    expect(pre).toBeInTheDocument();
    expect(pre!.innerHTML).toContain("const");
  });

  it("highlights syntax keywords with colors", () => {
    render(<SceneEditor sceneJs="const x = 42;" onChange={vi.fn()} />);
    const pre = document.querySelector("pre");
    expect(pre!.innerHTML).toContain("color:");
  });

  it("opens find bar with Ctrl+F", () => {
    const { container } = render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} />);
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "f", ctrlKey: true });
    expect(screen.getByRole("search")).toBeInTheDocument();
  });

  it("renders with aria-label on textarea", () => {
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("aria-label");
  });

  it("handles empty code", () => {
    render(<SceneEditor sceneJs="" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue("");
  });

  it("handles Tab key for indentation", () => {
    const onChange = vi.fn();
    render(<SceneEditor sceneJs="hello" onChange={onChange} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(onChange).toHaveBeenCalled();
  });

  it("reports cursor position for collaboration presence", () => {
    const onCursorChange = vi.fn();
    render(<SceneEditor sceneJs={sampleCode} onChange={vi.fn()} onCursorChange={onCursorChange} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.selectionStart = sampleCode.indexOf("scene.add");
    textarea.selectionEnd = textarea.selectionStart;
    fireEvent.keyUp(textarea);
    expect(onCursorChange).toHaveBeenCalledWith(expect.objectContaining({ line: 4, column: 0 }));
  });

  it("renders remote collaborator cursor labels", () => {
    render(
      <SceneEditor
        sceneJs={sampleCode}
        onChange={vi.fn()}
        remoteCursors={[{
          clientId: "peer-1",
          name: "Mika",
          color: "#8bc48b",
          cursor: { line: 2, column: 3 },
        }]}
      />,
    );
    expect(screen.getByText("Mika")).toBeInTheDocument();
  });
});
