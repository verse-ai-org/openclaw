/**
 * `settings.store` reads `location` while loading; Vitest's node env has no `location`.
 */
Object.defineProperty(globalThis, "location", {
  value: {
    hostname: "localhost",
    port: "5174",
    protocol: "http:",
    pathname: "/",
    href: "http://localhost:5174/",
  },
  writable: true,
  configurable: true,
});

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    clear: () => {
      m.clear();
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
};

Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage(), configurable: true });
