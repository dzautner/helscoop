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

import SceneApiReference from "@/components/SceneApiReference";

beforeEach(() => { vi.clearAllMocks(); });

describe("SceneApiReference", () => {
  it("renders the panel", () => {
    const { container } = render(<SceneApiReference />);
    expect(container.querySelector(".api-ref-panel")).toBeInTheDocument();
  });

  it("renders Scene API title", () => {
    render(<SceneApiReference />);
    expect(screen.getByText("Scene API")).toBeInTheDocument();
  });

  it("renders section tabs", () => {
    render(<SceneApiReference />);
    expect(screen.getByText("apiRef.primitives")).toBeInTheDocument();
    expect(screen.getByText("apiRef.transforms")).toBeInTheDocument();
    expect(screen.getByText("apiRef.booleans")).toBeInTheDocument();
    expect(screen.getByText("scene.add")).toBeInTheDocument();
    expect(screen.getByText("apiRef.materials")).toBeInTheDocument();
    expect(screen.getByText("apiRef.cookbook")).toBeInTheDocument();
    expect(screen.getByText("apiRef.coords")).toBeInTheDocument();
  });

  it("shows primitives section by default", () => {
    render(<SceneApiReference />);
    expect(screen.getByText("Primitive shapes")).toBeInTheDocument();
    expect(screen.getByText("box(width, height, depth)")).toBeInTheDocument();
  });

  it("renders box function signature and params", () => {
    render(<SceneApiReference />);
    expect(screen.getByText("box(width, height, depth)")).toBeInTheDocument();
    expect(screen.getByText("Width along X axis (meters)")).toBeInTheDocument();
  });

  it("renders cylinder function", () => {
    render(<SceneApiReference />);
    expect(screen.getByText("cylinder(radius, height)")).toBeInTheDocument();
  });

  it("renders sphere function", () => {
    render(<SceneApiReference />);
    expect(screen.getByText("sphere(radius)")).toBeInTheDocument();
  });

  it("switches to transforms tab", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.transforms"));
    expect(screen.getByText("Transform functions")).toBeInTheDocument();
    expect(screen.getByText("translate(mesh, x, y, z)")).toBeInTheDocument();
    expect(screen.getByText("rotate(mesh, rx, ry, rz)")).toBeInTheDocument();
  });

  it("switches to booleans tab", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.booleans"));
    expect(screen.getByText("Boolean operations")).toBeInTheDocument();
    expect(screen.getByText("union(a, b)")).toBeInTheDocument();
    expect(screen.getByText("subtract(a, b)")).toBeInTheDocument();
    expect(screen.getByText("intersect(a, b)")).toBeInTheDocument();
  });

  it("switches to scene.add tab", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("scene.add"));
    expect(screen.getByText("Adding to the scene")).toBeInTheDocument();
    expect(screen.getByText("scene.add(mesh, options?)")).toBeInTheDocument();
  });

  it("switches to materials tab", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.materials"));
    expect(screen.getByText("Built-in materials")).toBeInTheDocument();
    expect(screen.getByText("foundation")).toBeInTheDocument();
    expect(screen.getByText("lumber")).toBeInTheDocument();
    expect(screen.getByText("roofing")).toBeInTheDocument();
  });

  it("renders material swatches", () => {
    const { container } = render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.materials"));
    const swatches = container.querySelectorAll(".api-ref-material-swatch");
    expect(swatches.length).toBe(7);
  });

  it("renders material hint", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.materials"));
    expect(screen.getByText("apiRef.materialHint")).toBeInTheDocument();
  });

  it("switches to cookbook tab", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.cookbook"));
    expect(screen.getByText("Common patterns")).toBeInTheDocument();
    expect(screen.getByText("Cut a door from a wall")).toBeInTheDocument();
    expect(screen.getByText("Add a window")).toBeInTheDocument();
    expect(screen.getByText("Create a pitched roof")).toBeInTheDocument();
  });

  it("switches to coords tab", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.coords"));
    expect(screen.getByText("apiRef.coordSystem")).toBeInTheDocument();
    expect(screen.getByText("apiRef.coordHint")).toBeInTheDocument();
  });

  it("search filters functions", () => {
    render(<SceneApiReference />);
    const input = screen.getByPlaceholderText("editor.searchDocs");
    fireEvent.change(input, { target: { value: "cylinder" } });
    expect(screen.getByText("cylinder(radius, height)")).toBeInTheDocument();
    expect(screen.queryByText("box(width, height, depth)")).not.toBeInTheDocument();
  });

  it("search shows no results message", () => {
    render(<SceneApiReference />);
    const input = screen.getByPlaceholderText("editor.searchDocs");
    fireEvent.change(input, { target: { value: "xyznonexistent" } });
    expect(screen.getByText(/apiRef\.noResults/)).toBeInTheDocument();
  });

  it("hides tabs during search", () => {
    render(<SceneApiReference />);
    const input = screen.getByPlaceholderText("editor.searchDocs");
    fireEvent.change(input, { target: { value: "box" } });
    expect(screen.queryByText("apiRef.primitives")).not.toBeInTheDocument();
  });

  it("search clear button resets search", () => {
    const { container } = render(<SceneApiReference />);
    const input = screen.getByPlaceholderText("editor.searchDocs");
    fireEvent.change(input, { target: { value: "box" } });
    const clearBtn = container.querySelector(".api-ref-search-clear")!;
    fireEvent.click(clearBtn);
    expect(screen.getByText("apiRef.primitives")).toBeInTheDocument();
  });

  it("search matches cookbook entries", () => {
    render(<SceneApiReference />);
    const input = screen.getByPlaceholderText("editor.searchDocs");
    fireEvent.change(input, { target: { value: "pitched roof" } });
    expect(screen.getByText("Create a pitched roof")).toBeInTheDocument();
  });

  it("calls onInsertCode when copy button clicked", () => {
    const onInsert = vi.fn();
    render(<SceneApiReference onInsertCode={onInsert} />);
    const copyBtns = screen.getAllByLabelText("Copy to clipboard");
    fireEvent.click(copyBtns[0]);
    expect(onInsert).toHaveBeenCalledWith("const wall = box(4, 2.8, 0.15);");
  });

  it("renders copy-to-editor buttons in cookbook", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.cookbook"));
    const editorBtns = screen.getAllByLabelText("Copy to editor");
    expect(editorBtns.length).toBeGreaterThan(0);
  });

  it("renders return type for functions", () => {
    render(<SceneApiReference />);
    const returns = screen.getAllByText(/→ Mesh/);
    expect(returns.length).toBeGreaterThan(0);
  });

  it("renders coord note text", () => {
    render(<SceneApiReference />);
    fireEvent.click(screen.getByText("apiRef.coords"));
    expect(screen.getByText(/Y is up/)).toBeInTheDocument();
  });
});
