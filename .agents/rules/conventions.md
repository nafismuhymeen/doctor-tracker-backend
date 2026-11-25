---
trigger: always_on
---

# Backend conventions

- Express 5 + Mongoose + Zod, ESM (`.js` import suffixes), strict TypeScript.
- Each feature is a module: routes -> controller -> service -> schema -> model. No DB access in controllers.
- Validate all input with Zod in the schema file. Throw ApiError for expected failures; keep the existing response shape.
- Never interpolate user input into $regex without escaping.
- Every new endpoint needs: auth middleware, role check, Zod validation, and a test.
- Before finishing: run `yarn typecheck` (and tests once they exist) and fix all errors.
