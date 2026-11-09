import type { Role } from "../../modules/users/user.model.js";

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: Role;
                doctorId?: string;
            };
            id?: string;
        }
    }
}

export { };
