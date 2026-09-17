import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

// Every HTML page the site ships. `name` is the build entry name; `path` is
// the public URL used for canonical links and the sitemap.
const PAGES = [
  { name: 'main', file: 'index.html', path: '/' },
  { name: 'randomMenu', file: 'random-menu/index.html', path: '/random-menu/' },
];

// Adds the SEO tags each page would otherwise have to repeat by hand. Pages
// only declare <title> and <meta name="description">; Open Graph tags are
// derived from those so they can't drift apart. Tags that need an absolute
// URL (canonical, og:url, og:image) plus sitemap.xml are only produced when
// VITE_SITE_URL is set, rather than shipping a placeholder domain.
function seo(siteUrl) {
  const site = siteUrl ? siteUrl.replace(/\/+$/, '') : '';
  return {
    name: 'hewkao-seo',
    transformIndexHtml(html, ctx) {
      const pagePath = (ctx.path || '/index.html').replace(/index\.html$/, '');
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'HEWKAO';
      const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
      const tags = [
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        { tag: 'meta', attrs: { property: 'og:site_name', content: 'HEWKAO' } },
        { tag: 'meta', attrs: { property: 'og:locale', content: 'th_TH' } },
        { tag: 'meta', attrs: { property: 'og:title', content: title } },
        { tag: 'meta', attrs: { property: 'og:description', content: description } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      ];
      if (site) {
        const url = site + pagePath;
        tags.push(
          { tag: 'link', attrs: { rel: 'canonical', href: url } },
          { tag: 'meta', attrs: { property: 'og:url', content: url } },
          { tag: 'meta', attrs: { property: 'og:image', content: `${site}/og-image.png` } },
          { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
          { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        );
      }
      return tags.map(t => ({ ...t, injectTo: 'head' }));
    },
    generateBundle() {
      if (!site) {
        this.warn('VITE_SITE_URL is not set: skipped canonical/og:url/og:image tags and sitemap.xml. Set it to the live domain (e.g. https://example.com) for production builds.');
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nAllow: /\n' });
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const urls = PAGES.map(p => `  <url><loc>${site}${p.path}</loc><lastmod>${today}</lastmod></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const lanMode = command === 'serve' && mode === 'lan';
  return {
    // `npm run dev:lan` (mode 'lan') publishes the dev server on the LAN so a
    // phone or tablet on the same Wi-Fi can open it before anything is
    // deployed, and serves it over HTTPS because Geolocation only runs in a
    // secure context — over plain http://192.168.x.x the browser refuses to
    // even ask for location and HEWKAO never gets past the splash. localhost
    // is exempt from that rule, so plain `npm run dev` stays HTTP and keeps
    // working without the self-signed certificate's warning.
    server: { port: 5173, host: lanMode },
    // Vite only exposes env vars to client code whose name matches one of
    // these prefixes — normally just VITE_. MAPSKEY is a one-off addition so
    // the Google Maps key can keep that exact name (no VITE_ prefix) both
    // locally and in the host's env var settings; every other var still
    // needs VITE_. Never add a bare '' prefix here — that would expose every
    // env var (including unprefixed secrets) to the client bundle.
    envPrefix: ['VITE_', 'MAPSKEY'],
    // The certificate is self-signed, so the device asks once whether to trust
    // it. Never part of a production build.
    plugins: [seo(env.VITE_SITE_URL), ...(lanMode ? [basicSsl()] : [])],
    build: {
      rolldownOptions: {
        input: Object.fromEntries(PAGES.map(p => [p.name, fileURLToPath(new URL(p.file, import.meta.url))])),
      },
    },
  };
});
