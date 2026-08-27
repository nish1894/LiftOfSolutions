import { z, type ZodType } from "zod";
import { AppError } from "./errors.js";

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError("VALIDATION_ERROR", "Request validation failed.", 422, {
      issues: z.treeifyError(result.error),
    });
  return result.data;
}

export const uuid = z.uuid();
