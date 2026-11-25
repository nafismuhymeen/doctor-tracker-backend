import { z } from "zod";

export const auditQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    actorId: z.string().trim().optional(),
    entityType: z.string().trim().optional(),
    entityId: z.string().trim().optional(),
    action: z.string().trim().optional(),
    outcome: z.enum(["success", "failure"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;

export const auditIdParamSchema = z.object({
    id: z.string().trim().min(1, "Audit log ID is required"),
});

export type AuditIdParamInput = z.infer<typeof auditIdParamSchema>;

