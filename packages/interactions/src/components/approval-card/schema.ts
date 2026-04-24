import { z } from "zod";

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
