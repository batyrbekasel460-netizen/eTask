import type { ErrorRequestHandler } from "express";
import { logger } from "../logger.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;
  if (res.headersSent) return;
  if (error?.status && error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: error.message });
  if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Некорректный JSON" });
  if (error?.type === "entity.too.large" || error?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Превышен допустимый размер данных" });
  if (error?.code === "LIMIT_UNEXPECTED_FILE") return res.status(422).json({ error: "Недопустимое вложение" });
  if (error?.code === "23505") return res.status(409).json({ error: "Запись уже существует" });
  if (error?.code === "23503") return res.status(422).json({ error: "Связанная запись не найдена" });
  logger.error({err:error,requestId:res.getHeader("X-Request-Id"),method:_req.method,path:_req.path},"Unhandled request error");
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
};
