import type { Request } from "express";

export type Role = "admin" | "director" | "deputy" | "manager" | "expert";
export type AuthUser = { id: string; username: string; role: Role; departmentId: string | null };
export type AuthRequest = Request & { user?: AuthUser };

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
