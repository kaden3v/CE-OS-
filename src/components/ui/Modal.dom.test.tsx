// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(cleanup);

const escape = () => fireEvent.keyDown(document, { key: "Escape" });

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByText("body")).toBeNull();
  });

  it("renders into document.body, not in place", () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="Ported">
        <p>body</p>
      </Modal>,
    );
    // The overlay must escape the page's stacking context — see ui/Portal.tsx.
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("labels the dialog with its own title", () => {
    render(
      <Modal open onClose={() => {}} title="Delete order">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe("Delete order");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Closes">
        <p>body</p>
      </Modal>,
    );
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click but not on a click inside the dialog", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Backdrop">
        <p>body</p>
      </Modal>,
    );
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();

    // The backdrop is a sibling of the dialog, marked role="presentation".
    const backdrop = screen.getByRole("dialog").parentElement!.querySelector('[role="presentation"]');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the backdrop out of the accessibility tree", () => {
    render(
      <Modal open onClose={() => {}} title="Backdrop">
        <p>body</p>
      </Modal>,
    );
    // Decorative: it must not read as an interactive element to assistive tech.
    const backdrop = screen.getByRole("dialog").parentElement!.querySelector('[role="presentation"]');
    expect(backdrop).not.toBeNull();
    expect(screen.getByRole("dialog").getAttribute("onclick")).toBeNull();
  });

  it("Escape closes only the innermost modal", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <Modal open onClose={outer} title="Outer">
          <p>outer body</p>
        </Modal>
        <Modal open onClose={inner} title="Inner">
          <p>inner body</p>
        </Modal>
      </>,
    );
    escape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("locks page scroll while open and restores it on close", () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Lock">
        <p>body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal open={false} onClose={() => {}} title="Lock">
        <p>body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("restores focus to the trigger when it closes", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <Modal open onClose={() => {}} title="Focus">
        <button>inside</button>
      </Modal>,
    );
    expect(document.activeElement).not.toBe(trigger);

    rerender(
      <Modal open={false} onClose={() => {}} title="Focus">
        <button>inside</button>
      </Modal>,
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
