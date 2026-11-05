#!/usr/bin/env node
/**
 * 把 vite build --mode demo 的产物合成一个自包含的 HTML（脚本、样式、图片全部内联），
 * 双击即可在浏览器里打开，不需要服务器。输出 dist-demo/mdes-demo.html。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist-demo");
let html = readFileSync(path.join(dir, "index.html"), "utf8");
const read = (ref) => readFileSync(path.join(dir, ref.replace(/^\//, "")), "utf8");

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) => {
  const code = read(src).replace(/<\/script/gi, "<\\/script");
  return `<script type="module">${code}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => `<style>${read(href)}</style>`);
if (/src="\/assets|href="\/assets/.test(html)) throw new Error("仍有未内联的资源");

const out = path.join(dir, "mdes-demo.html");
writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)}（${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB）`);
