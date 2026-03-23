import Navigo from "navigo";
import { getAccessToken } from "./authSession.js";
import { mountJournalPage } from "./pages/journalPage.js";
import { mountLoginPage } from "./pages/loginPage.js";
import { mountSignupPage } from "./pages/signupPage.js";
import { mountForgotPasswordPage } from "./pages/forgotPasswordPage.js";
import { mountResetPasswordPage } from "./pages/resetPasswordPage.js";
import { mountSettingsPage } from "./pages/settings.js";

let activeUnmount = null;

function getOutlet() {
  return document.getElementById("app-outlet");
}

function clearPage() {
  if (typeof activeUnmount === "function") {
    activeUnmount();
    activeUnmount = null;
  }
  const out = getOutlet();
  if (out) out.innerHTML = "";
}

/**
 * @param {(root: HTMLElement) => (void|(() => void))} renderFn
 */
function mount(renderFn) {
  clearPage();
  const out = getOutlet();
  if (!out) return;
  const teardown = renderFn(out);
  activeUnmount = typeof teardown === "function" ? teardown : null;
}

/** @param {{ onNavigate?: (router: object) => void }} [options] */
export function createAppRouter(options) {
  const { onNavigate } = options || {};
  const router = new Navigo("/", { hash: false });

  router.hooks({
    after() {
      onNavigate?.(router);
    },
  });

  const authBefore = (done) => {
    if (!getAccessToken()) {
      router.navigate("/login");
      done(false);
      return;
    }
    done();
  };

  router.on(
    "/",
    () => {
      mount((root) => mountJournalPage(root));
    },
    { before: authBefore }
  );

  router.on(
    "/settings",
    () => {
      mount((root) => mountSettingsPage(root, () => onNavigate?.(router)));
    },
    { before: authBefore }
  );

  const guestBefore = (done) => {
    if (getAccessToken()) {
      router.navigate("/");
      done(false);
      return;
    }
    done();
  };

  router.on(
    "/login",
    () => {
      mount((root) => mountLoginPage(root, router, () => onNavigate?.(router)));
    },
    { before: guestBefore }
  );

  router.on(
    "/signup",
    () => {
      mount((root) => mountSignupPage(root, router, () => onNavigate?.(router)));
    },
    { before: guestBefore }
  );

  router.on(
    "/forgot-password",
    () => {
      mount((root) => mountForgotPasswordPage(root));
    },
    { before: guestBefore }
  );

  router.on("/reset-password", (match) => {
    const rawQs = match?.queryString ?? "";
    const qs = new URLSearchParams(
      rawQs || (typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "")
    );
    const token = qs.get("token") || "";
    mount((root) => mountResetPasswordPage(root, router, token));
  });

  router.notFound(() => {
    router.navigate("/");
  });

  return router;
}
