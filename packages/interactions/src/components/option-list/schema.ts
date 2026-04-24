import { z } from "zod";

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
