import { z } from "zod";

export function usageSince(input: string) {
  const days = z.coerce
    .number()
    .refine((value) => [7, 30, 90].includes(value))
    .parse(input);
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1);
}
