import { describe, it, expect } from "vitest";
import { envBool } from "../src/config/env.js";

describe("envBool helper", () => {
    describe("with default = false (envBool(false))", () => {
        const schema = envBool(false);

        it("parses 'false' as false", () => {
            expect(schema.parse("false")).toBe(false);
        });

        it("parses '0' as false", () => {
            expect(schema.parse("0")).toBe(false);
        });

        it("parses 'true' as true", () => {
            expect(schema.parse("true")).toBe(true);
        });

        it("parses '1' as true", () => {
            expect(schema.parse("1")).toBe(true);
        });

        it("parses ' TRUE ' as true", () => {
            expect(schema.parse(" TRUE ")).toBe(true);
        });

        it("parses undefined as default (false)", () => {
            expect(schema.parse(undefined)).toBe(false);
        });

        it("parses '' as false", () => {
            expect(schema.parse("")).toBe(false);
        });

        it("parses other truthy aliases 'yes' and 'on' as true", () => {
            expect(schema.parse("yes")).toBe(true);
            expect(schema.parse("YES")).toBe(true);
            expect(schema.parse("on")).toBe(true);
            expect(schema.parse("ON")).toBe(true);
        });

        it("parses arbitrary string as false", () => {
            expect(schema.parse("random_string")).toBe(false);
        });
    });

    describe("with default = true (envBool(true))", () => {
        const schema = envBool(true);

        it("parses 'false' as false", () => {
            expect(schema.parse("false")).toBe(false);
        });

        it("parses '0' as false", () => {
            expect(schema.parse("0")).toBe(false);
        });

        it("parses 'true' as true", () => {
            expect(schema.parse("true")).toBe(true);
        });

        it("parses '1' as true", () => {
            expect(schema.parse("1")).toBe(true);
        });

        it("parses ' TRUE ' as true", () => {
            expect(schema.parse(" TRUE ")).toBe(true);
        });

        it("parses undefined as default (true)", () => {
            expect(schema.parse(undefined)).toBe(true);
        });

        it("parses '' as false", () => {
            expect(schema.parse("")).toBe(false);
        });
    });
});
