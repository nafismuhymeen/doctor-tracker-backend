/**
 * Escapes characters with special meaning in regular expressions
 * to prevent regex injection attacks and unintended pattern matching.
 */
export const escapeRegex = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

