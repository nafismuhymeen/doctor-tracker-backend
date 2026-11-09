import fs from "node:fs/promises";
import path from "node:path";
import { openApiSpec } from "../docs/openapi.js";

async function exportOpenApi() {
    const outputPath = path.resolve(process.cwd(), "openapi.json");
    const formatted = JSON.stringify(openApiSpec, null, 2);
    await fs.writeFile(outputPath, formatted, "utf-8");
    console.log(`OpenAPI specification exported successfully to: ${outputPath}`);
}

exportOpenApi().catch((err) => {
    console.error("Failed to export OpenAPI specification:", err);
    process.exit(1);
});

