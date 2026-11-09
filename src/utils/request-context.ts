import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";

export interface RequestActor {
    id: string;
    role: string;
    email: string;
}

export interface RequestContext {
    actor: RequestActor | null;
    ip: string;
    userAgent: string;
    requestId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export const requestContextMiddleware: RequestHandler = (req, _res, next) => {
    const context: RequestContext = {
        actor: null,
        ip:
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
            req.ip ||
            "",
        userAgent: req.headers["user-agent"] || "",
        requestId:
            (req as any).id ||
            (req.headers["x-request-id"] as string) ||
            "",
    };

    asyncLocalStorage.run(context, () => {
        next();
    });
};

export function getRequestContext(): RequestContext | undefined {
    return asyncLocalStorage.getStore();
}

export function setRequestActor(actor: RequestActor | null): void {
    const store = asyncLocalStorage.getStore();
    if (store) {
        store.actor = actor;
    }
}

