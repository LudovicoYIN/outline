import { z } from "zod";
import { Client } from "@shared/types";
import { BaseSchema } from "@server/routes/api/schema";

export const EmailSchema = BaseSchema.extend({
  body: z.object({
    username: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
      .optional(),
    email: z.email().optional(),
    password: z.string().min(8).max(256).optional(),
    client: z.enum(Client).prefault(Client.Web),
    preferOTP: z.boolean().prefault(false),
  }).refine((body) => body.username || body.email, {
    message: "A username is required",
  }),
});

export type EmailReq = z.infer<typeof EmailSchema>;

const callbackDataSchema = z
  .object({
    token: z.string().optional(),
    code: z.string().optional(),
    email: z.email().optional(),
    client: z.enum(Client).optional(),
    follow: z.string().prefault(""),
  })
  .refine(
    (data: { code?: string; email?: string; token?: string }) =>
      !(data.code && !data.email) && !(data.email && !data.code && !data.token),
    {
      error: "Both code and email must be provided together",
    }
  );

export const EmailCallbackSchema = BaseSchema.extend({
  query: callbackDataSchema,
  body: callbackDataSchema,
});

export type EmailCallbackReq = z.infer<typeof EmailCallbackSchema>;
