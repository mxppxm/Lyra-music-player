import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Settings } from "./Settings";

vi.mock("./secrets", () => ({
  SECRET_KEYS: {
    anthropicApiKey: "provider.anthropic.apiKey",
    deepseekApiKey: "provider.deepseek.apiKey",
    zhipuApiKey: "provider.zhipu.apiKey",
    libraryRootPath: "library.rootPath",
  },
  setSecret: vi.fn(),
  getSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));

vi.mock("../library/libraryScan", () => ({
  importLibrary: vi.fn(() => Promise.resolve(0)),
}));

import { setSecret, getSecret } from "./secrets";
import { importLibrary } from "../library/libraryScan";

beforeEach(() => {
  (setSecret as any).mockReset();
  (getSecret as any).mockReset();
  (importLibrary as any).mockReset();
  (importLibrary as any).mockResolvedValue(0);
});

describe("Settings", () => {
  it("does not render when closed", () => {
    render(<Settings open={false} onClose={() => {}} />);
    expect(screen.queryByLabelText(/anthropic/i)).toBeNull();
  });

  it("loads existing secrets on open", async () => {
    (getSecret as any).mockImplementation((k: string) =>
      k === "provider.anthropic.apiKey" ? Promise.resolve("sk-a") : Promise.resolve(null)
    );
    render(<Settings open={true} onClose={() => {}} />);
    await waitFor(() =>
      expect((screen.getByLabelText(/anthropic/i) as HTMLInputElement).value).toBe("sk-a")
    );
  });

  it("loads stored library path on open", async () => {
    (getSecret as any).mockImplementation((k: string) =>
      k === "library.rootPath" ? Promise.resolve("/Users/x/Music") : Promise.resolve(null)
    );
    render(<Settings open={true} onClose={() => {}} />);
    await waitFor(() =>
      expect((screen.getByLabelText(/music library folder/i) as HTMLInputElement).value).toBe(
        "/Users/x/Music"
      )
    );
  });

  it("saves all three secrets on Save click and calls onClose", async () => {
    (getSecret as any).mockResolvedValue(null);
    (setSecret as any).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<Settings open={true} onClose={onClose} />);

    const aInput = await screen.findByLabelText(/anthropic/i);
    const dInput = screen.getByLabelText(/deepseek/i);
    const zInput = screen.getByLabelText(/zhipu/i);
    fireEvent.change(aInput, { target: { value: "sk-new-a" } });
    fireEvent.change(dInput, { target: { value: "sk-new-d" } });
    fireEvent.change(zInput, { target: { value: "sk-new-z" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(setSecret).toHaveBeenCalledWith("provider.anthropic.apiKey", "sk-new-a");
      expect(setSecret).toHaveBeenCalledWith("provider.deepseek.apiKey", "sk-new-d");
      expect(setSecret).toHaveBeenCalledWith("provider.zhipu.apiKey", "sk-new-z");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("saves library path and calls importLibrary on Save when path is set", async () => {
    (getSecret as any).mockResolvedValue(null);
    (setSecret as any).mockResolvedValue(undefined);
    (importLibrary as any).mockResolvedValue(3);
    const onClose = vi.fn();
    render(<Settings open={true} onClose={onClose} />);

    const libInput = await screen.findByLabelText(/music library folder/i);
    fireEvent.change(libInput, { target: { value: "/Users/x/Music" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(setSecret).toHaveBeenCalledWith("library.rootPath", "/Users/x/Music");
      expect(importLibrary).toHaveBeenCalledWith("/Users/x/Music");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("Cancel button closes without saving", async () => {
    (getSecret as any).mockResolvedValue(null);
    const onClose = vi.fn();
    render(<Settings open={true} onClose={onClose} />);
    await screen.findByLabelText(/anthropic/i);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(setSecret).not.toHaveBeenCalled();
  });
});
