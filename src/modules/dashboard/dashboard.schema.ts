import { z } from "zod";

export const dashboardQuerySchema = z
    .object({
        range: z.enum(["7d", "30d", "90d", "1y", "all"]).default("30d"),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
    })
    .refine(
        (data) =>
            !data.startDate ||
            !data.endDate ||
            data.startDate <= data.endDate,
        {
            message: "Start date cannot be later than end date",
            path: ["endDate"],
        }
    );

export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>;

