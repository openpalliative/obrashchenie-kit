import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const root = process.cwd();
export const readJson = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const fixtureFirst = (name) => [`_site/data/v1/${name}.json`, `tests/fixtures/${name}.json`].find((p) => existsSync(join(root, p)));
export const kitItems = (name) => readJson(fixtureFirst(name)).items;
const lib = ["vendor/pal-norms/lib/deadlines.js", "tests/fixtures/vendor/pal-norms/lib/deadlines.js"].map((p) => join(root, p)).find(existsSync);
export const deadlines = await import(pathToFileURL(lib).href);
const vendorFile = (repo, name) => [`vendor/${repo}/v1/${name}.json`, `tests/fixtures/vendor/${repo}/v1/${name}.json`].find((p) => existsSync(join(root, p)));
export const vendorEnv = (repo, name) => readJson(vendorFile(repo, name));
