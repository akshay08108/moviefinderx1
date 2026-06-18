import { cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = new URL("./public/", import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  ["index.html", "styles.css", "script.js"].map((file) =>
    cp(new URL(file, import.meta.url), new URL(file, outputDirectory)),
  ),
);

console.log("Static site built in public/");
