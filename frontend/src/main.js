import "./style.css";
import { fetchSession } from "./api.js";
import { setSession } from "./authSession.js";
import { createAppRouter } from "./router.js";
import { renderNav } from "./nav.js";

/** After Google OAuth, backend redirects with ?accessToken= — store JWT and strip from address bar. */
function consumeAccessTokenFromQuery() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("accessToken");
  if (!token?.trim()) return;
  url.searchParams.delete("accessToken");
  const search = url.searchParams.toString();
  const path = url.pathname || "/";
  window.history.replaceState(null, "", search ? `${path}?${search}` : path);
  setSession(token.trim(), null);
}

async function bootstrap() {
  consumeAccessTokenFromQuery();

  try {
    const res = await fetchSession();
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) {
        setSession(data.accessToken, data.user);
      }
    }
  } catch {
    /* offline or server down */
  }

  const router = createAppRouter({
    onNavigate(r) {
      renderNav(r);
      r.updatePageLinks();
    },
  });

  renderNav(router);
  router.updatePageLinks();
  router.resolve();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Bootstrap failed", err);
});
