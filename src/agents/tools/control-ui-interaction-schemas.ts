/**
 * Canonical Zod schemas for Control UI interaction tools (approval_card, option_list, question_flow).
 * Kept in-repo (not a separate package) so packaged Node/Electron loads plain JS, not .ts under node_modules.
 */
import { z } from "zod";

// --- approval_card ---

export const ApprovalCardMetadataItemSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const ApprovalCardRequestSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    metadata: z.array(ApprovalCardMetadataItemSchema).optional(),
    variant: z.enum(["default", "destructive"]).optional(),
    confirmLabel: z.string().optional(),
    cancelLabel: z.string().optional(),
  })
  .strict();

export type ApprovalCardRequest = z.infer<typeof ApprovalCardRequestSchema>;

export const ApprovalCardResponseSchema = z
  .object({
    decision: z.enum(["approved", "denied"]),
  })
  .strict();

export type ApprovalCardResponse = z.infer<typeof ApprovalCardResponseSchema>;

// --- option_list ---

export const OptionListOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  disabled: z.boolean().optional(),
});

export const OptionListRequestSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    options: z.array(OptionListOptionSchema).min(1),
    selectionMode: z.enum(["single", "multi"]).optional(),
    minSelections: z.number().int().min(0).optional(),
    maxSelections: z.number().int().min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.minSelections !== undefined &&
      data.maxSelections !== undefined &&
      data.minSelections > data.maxSelections
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minSelections"],
        message: "`minSelections` cannot be greater than `maxSelections`.",
      });
    }
    const ids = new Set<string>();
    data.options.forEach((opt, idx) => {
      if (ids.has(opt.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options", idx, "id"],
          message: `Duplicate option id "${opt.id}" is not allowed.`,
        });
      }
      ids.add(opt.id);
    });
  });

export type OptionListRequest = z.infer<typeof OptionListRequestSchema>;

export const OptionListResponseSchema = z
  .object({
    selected: z.array(z.string().min(1)),
  })
  .strict();

export type OptionListResponse = z.infer<typeof OptionListResponseSchema>;

// --- question_flow ---

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
