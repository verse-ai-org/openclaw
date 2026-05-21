import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import {
  defineBundledChannelEntry,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/channel-entry-contract";

import { assertHostCompatibility } from "./src/compat.js";
import { WeixinConfigSchema } from "./src/config/config-schema.js";

function assertWeixinHostCompatibility(api: OpenClawPluginApi): void {
  assertHostCompatibility(api.runtime?.version);
}

export default defineBundledChannelEntry({
  id: "openclaw-weixin",
  name: "Weixin",
  description: "Weixin channel (getUpdates long-poll + sendMessage)",
  importMetaUrl: import.meta.url,
  configSchema: buildChannelConfigSchema(WeixinConfigSchema),
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "weixinPlugin",
  },
  registerCliMetadata(api: OpenClawPluginApi) {
    assertWeixinHostCompatibility(api);
  },
  registerFull(api: OpenClawPluginApi) {
    assertWeixinHostCompatibility(api);
  },
});
