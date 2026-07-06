import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Settings } from "./Settings";

vi.mock("./secrets", () => ({
  SECRET_KEYS: {
    anthropicApiKey: "provider.anthropic.apiKey",
    deepseekApiKey: "provider.deepseek.apiKey",
  },
  setSecret: vi.fn(),
  getSecret: vi.fn(),
  deleteSecret: vi.fn(),
}));

import { setSecret, getSecret } from "./secrets";

beforeEach(() => {
  (setSecret as any).mockReset();
  (getSecret as any).mockReset();
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

  it("saves both secrets on Save click and calls onClose", async () => {
    (getSecret as any).mockResolvedValue(null);
    (setSecret as any).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<Settings open={true} onClose={onClose} />);

    const aInput = await screen.findByLabelText(/anthropic/i);
    const dInput = screen.getByLabelText(/deepseek/i);
    fireEvent.change(aInput, { target: { value: "sk-new-a" } });
    fireEvent.change(dInput, { target: { value: "sk-new-d" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(setSecret).toHaveBeenCalledWith("provider.anthropic.apiKey", "sk-new-a");
      expect(setSecret).toHaveBeenCalledWith("provider.deepseek.apiKey", "sk-new-d");
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
