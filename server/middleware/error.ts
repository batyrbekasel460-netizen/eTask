import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  if (error?.status === 403) return res.status(403).json({ error: "Недостаточно прав" });
  if (error?.code === "23505") return res.status(409).json({ error: "Запись уже существует" });
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
};
