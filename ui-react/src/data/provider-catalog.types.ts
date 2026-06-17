/**
 * provider-catalog.types.ts
 *
 * Runtime schema + types for the provider catalog delivered by bossim-service
 * (group=providers, key=catalog). Used to validate the remote payload at the
 * network boundary before it replaces the built-in fallback catalog.
 *
 * Logos are NOT part of the delivered catalog: they are bundled image assets
 * resolved client-side by provider id (see PROVIDER_LOGO in auth-choice-groups).
 */

import { z } from "zod";

export const authMethodTypeSchema = z.enum([
  "api-key",
  "oauth",
  "custom",
  "proxy",
]);

export const authMethodDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string().optional(),
  type: authMethodTypeSchema,
  envVar: z.string().optional(),
  consoleUrl: z.string().optional(),
  keyPlaceholder: z.string().optional(),
  defaultModelId: z.string().optional(),
});

export const authProviderGroupDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string().optional(),
  featured: z.boolean().optional(),
  methods: z.array(authMethodDefSchema),
});

export const providerCatalogSchema = z.object({
  groups: z.array(authProviderGroupDefSchema).min(1),
  emoji: z.record(z.string(), z.string()).default({}),
  modelCandidates: z.record(z.string(), z.array(z.string())).default({}),
});

export type ProviderCatalog = z.infer<typeof providerCatalogSchema>;
