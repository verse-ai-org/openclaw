import { describe, expect, it } from "vitest";
import { mapWwoWeatherCodeToCondition } from "./weather-widget-tool.js";

describe("mapWwoWeatherCodeToCondition", () => {
  it("maps common WWO codes", () => {
    expect(mapWwoWeatherCodeToCondition("113")).toBe("clear");
    expect(mapWwoWeatherCodeToCondition("116")).toBe("partly-cloudy");
    expect(mapWwoWeatherCodeToCondition("119")).toBe("cloudy");
    expect(mapWwoWeatherCodeToCondition("122")).toBe("overcast");
    expect(mapWwoWeatherCodeToCondition("143")).toBe("fog");
    expect(mapWwoWeatherCodeToCondition("176")).toBe("rain");
    expect(mapWwoWeatherCodeToCondition("296")).toBe("drizzle");
    expect(mapWwoWeatherCodeToCondition("389")).toBe("thunderstorm");
  });

  it("handles invalid input", () => {
    expect(mapWwoWeatherCodeToCondition("")).toBe("cloudy");
    expect(mapWwoWeatherCodeToCondition("not-a-number")).toBe("cloudy");
  });
});
