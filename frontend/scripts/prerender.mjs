// Runs after the build. Writes each public page (src/features/site/business.ts PAGES) as static HTML, so it
// reads the same without JavaScript: Meta's checks and search engines see the full page. The app takes over
// in the browser. shell.html keeps the empty page for every other path (/signin, /app/...), which vercel.json
// and nginx.conf serve, so those don't show the homepage while the app loads.
import { readFile, rm, writeFile } from "node:fs/promises";

const BUNDLE = "dist-prerender";
const { ORGANIZATION, PAGES, SITE_URL, render } = await import(`../${BUNDLE}/prerender.js`);

const template = await readFile("dist/index.html", "utf8");
await writeFile("dist/shell.html", template);

const escape = (text) =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

// Fails the build if the template no longer has what we replace, rather than shipping a page without it.
function replaceOnce(html, pattern, value) {
  if (!pattern.test(html)) throw new Error(`prerender: index.html has no match for ${pattern}`);
  return html.replace(pattern, () => value);
}

for (const page of PAGES) {
  let html = template;
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escape(page.title)}</title>`);
  for (const [attribute, value] of [
    ['name="description"', page.description],
    ['property="og:title"', page.title],
    ['property="og:description"', page.description],
    ['property="og:url"', SITE_URL + page.path],
  ])
    html = replaceOnce(
      html,
      new RegExp(`<meta\\s+${attribute}\\s+content="[^"]*"\\s*/>`),
      `<meta ${attribute} content="${escape(value)}" />`,
    );
  if (page.path === "/") {
    // "<" escaped so the JSON can never close the script tag early.
    const json = JSON.stringify(ORGANIZATION).replaceAll("<", "\\u003c");
    html = replaceOnce(
      html,
      /<\/head>/,
      `  <script type="application/ld+json">${json}</script>\n  </head>`,
    );
  }
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root">${render(page.path)}</div>`);
  await writeFile(`dist/${page.file}`, html);
}

await rm(BUNDLE, { recursive: true, force: true });
console.log(`prerender: wrote ${PAGES.length} pages and shell.html`);
