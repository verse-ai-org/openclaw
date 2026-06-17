import { describe, expect, it, beforeEach } from "vitest";
import { useAuthStore } from "@/store/auth.store";

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: "idle" });
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
      user: {
        id: "1",
        email: "a@b.com",
        display_name: "A",
        avatar_url: "",
      },
      status: "authenticated",
    });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("does not flip to loading when already authenticated", async () => {
    useAuthStore.setState({
      user: {
        id: "1",
        email: "a@b.com",
        display_name: "A",
        avatar_url: "",
      },
      status: "authenticated",
    });
    await useAuthStore.getState().refresh();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });
});
