import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

const compose = read("docker-compose.yml");
const datasource = read("monitoring/grafana/provisioning/datasources/datasource.yml");

const routePrefixMatch = compose.match(/--web\.route-prefix=([^\r\n'\s]+)/);
assert.ok(routePrefixMatch, "docker-compose should configure a Prometheus route prefix");

const routePrefix = routePrefixMatch[1];
const datasourceUrlMatch = datasource.match(/^\s*url:\s*(.+)\s*$/m);
assert.ok(datasourceUrlMatch, "Grafana datasource should define a Prometheus URL");

const datasourceUrl = datasourceUrlMatch[1].trim();
assert.ok(
  datasourceUrl.endsWith(routePrefix),
  `Grafana datasource URL (${datasourceUrl}) must end with the Prometheus route prefix (${routePrefix})`,
);

console.log("Grafana datasource matches the Prometheus route prefix.");
