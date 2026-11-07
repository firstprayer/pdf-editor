import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { CONTACT_EMAIL, PRIVACY_PAGE, TOOLS, toolUrl } from "../site/catalog.mjs";

const root = resolve(import.meta.dirname, "..");
const html = (item) => readFile(resolve(root, item.slug, "index.html"), "utf8");

test("every page links to the privacy policy and the contact address", async () => {
  for (const item of [...TOOLS, PRIVACY_PAGE]) {
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
  assert.equal(sitemap.match(/<loc>/g).length, TOOLS.length + 1);
});
