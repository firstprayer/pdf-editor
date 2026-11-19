import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { CONTACT_EMAIL, EDITOR_PAGES, PRIVACY_PAGE, TOOLS, toolUrl } from "../site/catalog.mjs";

const root = resolve(import.meta.dirname, "..");
const html = (item) => readFile(resolve(root, item.slug, "index.html"), "utf8");

test("every page links to the privacy policy and the contact address", async () => {
  for (const item of [...TOOLS, ...EDITOR_PAGES, PRIVACY_PAGE]) {
    const page = await html(item);
    const expected = item.slug ? "../privacy/" : "./privacy/";
    assert.ok(page.includes(`<a href="${expected}">Privacy policy</a>`), item.id);
    assert.ok(page.includes(`mailto:${CONTACT_EMAIL}`), item.id);
  }
});

test("the privacy page has one H1 and is in the sitemap", async () => {
  const page = await html(PRIVACY_PAGE);
  assert.equal(page.match(/<h1\b/g).length, 1);
  const sitemap = await readFile(resolve(root, "public/sitemap.xml"), "utf8");
  assert.ok(sitemap.includes(`<loc>${toolUrl(PRIVACY_PAGE)}</loc>`));
  assert.equal(sitemap.match(/<loc>/g).length, TOOLS.length + EDITOR_PAGES.length + 1);
});

test("llms.txt lists every page and the privacy point, and every page links to it", async () => {
  const llms = await readFile(resolve(root, "public/llms.txt"), "utf8");
  assert.ok(llms.startsWith("# PDF Editor\n"));
  for (const item of [...TOOLS, ...EDITOR_PAGES, PRIVACY_PAGE])
    assert.ok(llms.includes(`](${toolUrl(item)})`), item.id);
  assert.match(llms, /never uploaded/);
  for (const item of [...TOOLS, ...EDITOR_PAGES, PRIVACY_PAGE]) {
    assert.ok(
      (await html(item)).includes('href="https://firstprayer.github.io/pdf-editor/llms.txt"'),
      item.id,
    );
  }
});

test("editor task pages load the editor, keep their claims honest and stay out of the site bar", async () => {
  const ids = new Set();
  for (const item of EDITOR_PAGES) {
    const page = await html(item);
    assert.ok(!ids.has(item.id) && !TOOLS.some((tool) => tool.id === item.id), item.id);
    ids.add(item.id);
    assert.ok(page.includes('<script type="module" src="/src/main.jsx">'), item.id);
    assert.equal(page.match(/<h1\b/g).length, 1, item.id);
    assert.match(page, /never uploaded/, item.id);
    assert.doesNotMatch(page, /legally binding/i, item.id);
    assert.ok(!page.includes(`href="../${item.slug}/" aria-current`), item.id);
  }
  const sign = await html(EDITOR_PAGES.find((item) => item.id === "sign"));
  assert.match(sign, /not a certificate-based digital signature/);
  const home = await html(TOOLS[0]);
  for (const item of EDITOR_PAGES) assert.ok(home.includes(`href="./${item.slug}/"`), item.id);
});
