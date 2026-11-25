import pino from "pino";
import { env } from "./env.js";
import { getRequestContext } from "../utils/request-context.js";

export const logger = pino({
    level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "development" ? "debug" : "info",
    mixin() {
        const ctx = getRequestContext();
        if (!ctx) return {};
        return {
            ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
            ...(ctx.actor?.id ? { userId: ctx.actor.id } : {}),
        };
    },
    transport:
        env.NODE_ENV === "development"
            ? {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "SYS:standard",
                      ignore: "pid,hostname",
                  },
              }
            : undefined,
});

