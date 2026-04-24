import { z } from "zod";

/**
 * QuestionFlow is a multi-step structured prompt. The LLM provides the steps
 * and options; the user answers each step. Response maps step id → selected
 * option ids (array to cover both single + multi select).
 *
 * The icon field that lives in the runtime React prop is intentionally NOT
 * part of the wire schema; renderers can attach icons locally.
 */

export const QuestionFlowOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  disabled: z.boolean().optional(),
});

export const QuestionFlowStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  options: z.array(QuestionFlowOptionSchema).min(1),
  selectionMode: z.enum(["single", "multi"]).optional(),
});

export const QuestionFlowRequestSchema = z
  .object({
    id: z.string().min(1),
    steps: z.array(QuestionFlowStepSchema).min(1),
  })
  .strict();

export type QuestionFlowRequest = z.infer<typeof QuestionFlowRequestSchema>;

export const QuestionFlowResponseSchema = z
  .object({
    answers: z.record(z.string(), z.array(z.string()).min(1)),
  })
  .strict();

export type QuestionFlowResponse = z.infer<typeof QuestionFlowResponseSchema>;
