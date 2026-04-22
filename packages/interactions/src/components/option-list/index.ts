import type { InteractionComponentManifest } from "../../types.ts";
import { OPTION_LIST_DESCRIPTION } from "./description.ts";
import {
  renderOptionListDowngrade,
  summarizeOptionList,
  parseOptionListDowngradeCallback,
} from "./downgrade.ts";
import {
  OptionListRequestSchema,
  OptionListResponseSchema,
  type OptionListRequest,
  type OptionListResponse,
} from "./schema.ts";

export const OPTION_LIST_MANIFEST: InteractionComponentManifest<
  OptionListRequest,
  OptionListResponse
> = {
  name: "option_list",
  schemaVersion: 1,
  requestSchema: OptionListRequestSchema,
  responseSchema: OptionListResponseSchema,
  description: OPTION_LIST_DESCRIPTION,
  summarize: summarizeOptionList,
  exampleRequest: {
    id: "ol-env",
    title: "Which environment?",
    options: [
      { id: "dev", label: "Development" },
      { id: "staging", label: "Staging" },
      { id: "prod", label: "Production" },
    ],
  },
  exampleResponse: { selected: ["staging"] },
};

export {
  OPTION_LIST_DESCRIPTION,
  renderOptionListDowngrade,
  parseOptionListDowngradeCallback,
  summarizeOptionList,
};
export {
  OptionListRequestSchema,
  OptionListResponseSchema,
  OptionListOptionSchema,
} from "./schema.ts";
export type {
  OptionListRequest,
  OptionListResponse,
} from "./schema.ts";
