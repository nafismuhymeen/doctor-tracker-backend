import type { IAuditChange } from "./audit.model.js";

export const SENSITIVE_FIELDS = new Set([
    "password",
    "passwordHash",
    "token",
    "tokens",
    "accessToken",
    "refreshToken",
    "notes",
    "diagnosis",
    "chiefComplaint",
    "prescriptions",
    "addenda",
]);

export const PII_FIELDS = new Set(["phone", "email"]);

interface DiffOptions {
    entityType?: string;
}

/**
 * Compares two objects and produces a sanitized changes array for the audit log.
 * - Sensitive fields (secrets, clinical content) are NEVER recorded.
 * - Patient PII fields (phone, email) are recorded with redacted values.
 * - Non-sensitive fields record real from/to values.
 */
export function diffObjects(
    before: Record<string, any> = {},
    after: Record<string, any> = {},
    options: DiffOptions = {}
): IAuditChange[] {
    const changes: IAuditChange[] = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
        // Skip metadata / mongoose internal fields
        if (key === "_id" || key === "__v" || key === "createdAt" || key === "updatedAt") {
            continue;
        }

        // Sensitive fields: never record values in changes
        if (SENSITIVE_FIELDS.has(key)) {
            continue;
        }

        const fromVal = before[key];
        const toVal = after[key];

        // Format dates, ObjectIds, etc. for simple comparison
        const fromStr = JSON.stringify(fromVal ?? null);
        const toStr = JSON.stringify(toVal ?? null);

        if (fromStr !== toStr) {
            // Patient PII redaction
            if (options.entityType === "Patient" && PII_FIELDS.has(key)) {
                changes.push({
                    field: key,
                    from: fromVal !== undefined ? "[redacted]" : undefined,
                    to: toVal !== undefined ? "[redacted]" : undefined,
                });
            } else {
                changes.push({
                    field: key,
                    from: fromVal,
                    to: toVal,
                });
            }
        }
    }

    return changes;
}
