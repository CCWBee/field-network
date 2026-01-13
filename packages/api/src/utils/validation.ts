import { z } from 'zod';

/**
 * Safe URL validator that only allows http:// and https:// protocols
 * Prevents javascript:, data:, and other potentially malicious URI schemes
 */
export const safeUrl = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  { message: 'URL must use http or https protocol' }
);

/**
 * Schema for saved addresses stored as JSON in the database
 */
export const SavedAddressItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: z.string().optional(),
  created_at: z.string().datetime(),
});

export const SavedAddressesSchema = z.array(SavedAddressItemSchema);

/**
 * Safely parse JSON with schema validation
 * Returns default value on parse failure instead of throwing
 */
export function safeJsonParse<T>(
  json: string,
  schema: z.ZodSchema<T>,
  defaultValue: T
): T {
  try {
    const parsed = JSON.parse(json);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn('JSON schema validation failed:', result.error.message);
    return defaultValue;
  } catch (error) {
    console.warn('JSON parse failed:', error);
    return defaultValue;
  }
}

/**
 * Webhook event types schema for JSON parsing
 */
export const WebhookEventTypesSchema = z.array(z.enum([
  'task.published',
  'task.claimed',
  'task.submitted',
  'task.accepted',
  'task.cancelled',
  'task.expired',
  'submission.finalised',
  'submission.accepted',
  'submission.rejected',
  'dispute.opened',
  'dispute.resolved',
]));
