import type { Request } from "express";

export type Role = "director" | "deputy" | "manager" | "expert";
export type AuthUser = { id: string; username: string; role: Role; departmentId: string | null };
export type AuthRequest = Request & { user?: AuthUser };
