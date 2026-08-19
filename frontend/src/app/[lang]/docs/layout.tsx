import type { PageMapItem } from "nextra";
import { getPageMap } from "nextra/page-map";
import { Layout } from "nextra-theme-docs";

import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { getLocaleByLang } from "@/core/i18n/locale";
import "nextra-theme-docs/style.css";

const i18n = [
  { locale: "en", name: "English" },
  { locale: "zh", name: "中文" },
];

function formatPageRoute(base: string, items: PageMapItem[]): PageMapItem[] {
  return items.map((item) => {
    if ("route" in item && !item.route.startsWith(base)) {
      item.route = `${base}${item.route}`;
    }
    if ("children" in item && item.children) {
      item.children = formatPageRoute(base, item.children);
    }
    return item;
  });
}

// The Nextra page map also picks up the app's own routes (billing, pricing,
// workspace, login, confirm-email, blog, posts). Prefixed with /<lang>/docs
// they render as sidebar links that 404 — keep the docs sidebar to actual
// docs content only.
const APP_ROUTE_FILTER =
  /^\/(?:billing|pricing|workspace|login|confirm-email|blog|posts)(?:\/|$)/;

function isAppRoute(route: string): boolean {
  const stripped = route.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  return APP_ROUTE_FILTER.test(stripped);
}

function filterAppRoutes(items: PageMapItem[]): PageMapItem[] {
  return items
    .filter((item) => !("route" in item) || !isAppRoute(item.route))
    .map((item) => {
      if ("children" in item && item.children) {
        return { ...item, children: filterAppRoutes(item.children) };
      }
      return item;
    });
}

export default async function DocLayout({ children, params }) {
  const { lang } = await params;
  const locale = getLocaleByLang(lang);
  const pages = await getPageMap(`/${lang}`);
  const pageMap = formatPageRoute(`/${lang}/docs`, filterAppRoutes(pages));

  return (
    <Layout
      navbar={
        <Header
          className="sticky max-w-full px-10"
          homeURL="/"
          locale={locale}
        />
      }
      pageMap={pageMap}
      docsRepositoryBase="https://github.com/Muhabuki003/bookistudios-ai/tree/main/frontend/src/content"
      footer={<Footer className="mt-0" />}
      i18n={i18n}
      // ... Your additional layout options
    >
      {children}
    </Layout>
  );
}
