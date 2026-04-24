import type { InteractionComponentManifest } from "../../types.ts";
import { QUESTION_FLOW_DESCRIPTION } from "./description.ts";
import {
  renderQuestionFlowDowngrade,
  summarizeQuestionFlow,
  parseQuestionFlowDowngradeCallback,
} from "./downgrade.ts";
import {
  QuestionFlowRequestSchema,
  QuestionFlowResponseSchema,
  type QuestionFlowRequest,
  type QuestionFlowResponse,
} from "./schema.ts";

export const QUESTION_FLOW_MANIFEST: InteractionComponentManifest<
  QuestionFlowRequest,
  QuestionFlowResponse
> = {
  name: "question_flow",
  schemaVersion: 1,
  requestSchema: QuestionFlowRequestSchema,
  responseSchema: QuestionFlowResponseSchema,
  description: QUESTION_FLOW_DESCRIPTION,
  summarize: summarizeQuestionFlow,
  exampleRequest: {
    id: "qf-deploy",
    steps: [
      {
        id: "target",
        title: "Deploy target?",
        options: [
          { id: "prod", label: "Production" },
          { id: "staging", label: "Staging" },
        ],
      },
    ],
  },
  exampleResponse: { answers: { target: ["prod"] } },
};

export {
  QUESTION_FLOW_DESCRIPTION,
  renderQuestionFlowDowngrade,
  parseQuestionFlowDowngradeCallback,
  summarizeQuestionFlow,
};
export {
  QuestionFlowRequestSchema,
  QuestionFlowResponseSchema,
  QuestionFlowOptionSchema,
  QuestionFlowStepSchema,
} from "./schema.ts";
export type {
  QuestionFlowRequest,
  QuestionFlowResponse,
} from "./schema.ts";
