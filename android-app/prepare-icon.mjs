import { createHash, webcrypto } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const { subtle } = webcrypto;
const androidDirectory = path.resolve(import.meta.dirname);
const workspace = path.resolve(androidDirectory, "..");
const vaultDirectory = path.join(workspace, "private-vault");
const outputPath = path.join(androidDirectory, "app", "src", "main", "res", "drawable", "app_icon.webp");
const homepageKey = Buffer.from("sBxpnrXnPGYpkslUIz32CS9SljnEKbiQe1yxw9rs81I=", "base64");

const manifest = JSON.parse(await readFile(path.join(vaultDirectory, "manifest.json"), "utf8"));
const photo = manifest.photos.find((item) => item.id === "memory-3");
if (!photo) throw new Error("The heart icon photo is missing from private-vault.");

const key = await subtle.importKey("raw", homepageKey, { name: "AES-GCM" }, false, ["decrypt"]);
const encrypted = await readFile(path.join(vaultDirectory, photo.file));
const plaintext = Buffer.from(await subtle.decrypt(
  { name: "AES-GCM", iv: Buffer.from(photo.iv, "base64") },
  key,
  encrypted,
));
const digest = createHash("sha256").update(plaintext).digest("hex");
if (digest !== photo.sha256) throw new Error("The generated icon failed its integrity check.");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, plaintext);
console.log(`Prepared Android heart icon: ${outputPath}`);
