import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const mockUser = {
  id: "1",
  email: "a@b.com",
  display_name: "A",
  avatar_url: "",
};

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: "idle" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets authenticated user on refresh when skip auth is enabled", async () => {
    const prev = import.meta.env.VITE_SKIP_AUTH;
    import.meta.env.VITE_SKIP_AUTH = "1";
    await useAuthStore.getState().refresh();
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user?.email).toBe("dev@bossim.local");
    import.meta.env.VITE_SKIP_AUTH = prev;
  });

  it("clears user on logout", async () => {
    useAuthStore.setState({
      user: mockUser,
      status: "authenticated",
    });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("does not flip to loading when already authenticated", async () => {
    vi.stubGlobal("window", {
      electronBridge: {
        authGetSession: async () => ({
          user: mockUser,
          status: "authenticated" as const,
        }),
      },
    });

    useAuthStore.setState({
      user: mockUser,
      status: "authenticated",
    });
    await useAuthStore.getState().refresh();
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user?.email).toBe("a@b.com");
  });
});
