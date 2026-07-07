import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to mock the dynamic import inside notification.ts.
// Vitest supports vi.mock with factory for module mocking.
const mockSendNotification = vi.fn();
const mockIsPermissionGranted = vi.fn();
const mockRequestPermission = vi.fn();

vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: mockSendNotification,
  isPermissionGranted: mockIsPermissionGranted,
  requestPermission: mockRequestPermission,
}));

import { sendLyraProactiveNotification } from "./notification";

describe("sendLyraProactiveNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends notification when permission already granted", async () => {
    mockIsPermissionGranted.mockResolvedValue(true);

    await sendLyraProactiveNotification();

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockSendNotification).toHaveBeenCalledWith({
      title: "Lyra",
      body: "💬 我想给你放一首",
    });
  });

  it("requests permission lazily and sends when granted", async () => {
    mockIsPermissionGranted.mockResolvedValue(false);
    mockRequestPermission.mockResolvedValue("granted");

    await sendLyraProactiveNotification();

    expect(mockRequestPermission).toHaveBeenCalledOnce();
    expect(mockSendNotification).toHaveBeenCalledWith({
      title: "Lyra",
      body: "💬 我想给你放一首",
    });
  });

  it("silently skips sending when permission denied", async () => {
    mockIsPermissionGranted.mockResolvedValue(false);
    mockRequestPermission.mockResolvedValue("denied");

    await sendLyraProactiveNotification();

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("does not include song name in body (spec §4.4)", async () => {
    mockIsPermissionGranted.mockResolvedValue(true);

    await sendLyraProactiveNotification();

    const call = mockSendNotification.mock.calls[0][0] as { title: string; body: string };
    expect(call.body).toBe("💬 我想给你放一首");
    expect(call.title).toBe("Lyra");
  });
});
