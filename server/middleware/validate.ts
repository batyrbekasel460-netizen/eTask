import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export const validate = (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
  if (!result.success) {
    return res.status(422).json({
      error: "Проверьте введённые данные",
      fields: result.error.issues.map((issue) => ({ path: issue.path.slice(1).join("."), message: issue.message })),
    });
  }
  const value = result.data as { body?: unknown; params?: unknown; query?: unknown };
  if (value.body !== undefined) req.body = value.body;
  if (value.params !== undefined) Object.assign(req.params, value.params);
  if (value.query !== undefined) Object.assign(req.query, value.query);
  next();
};
