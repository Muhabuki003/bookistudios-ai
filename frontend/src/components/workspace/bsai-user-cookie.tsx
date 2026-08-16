"use client";

import { useEffect } from "react";

/**
 * Shared cross-subdomain identity cookie for the OpenDesign daemon
 * (design.bsaiagents.com). The daemon scopes projects by this cookie's
 * value, so it MUST be kept in sync with the logged-in account:
 *  - set on login / workspace load
 *  - cleared on logout
 */
export const BSAI_USER_COOKIE = "bsai_user";

function cookieDomain() {
  // Localhost/dev fallback — production is bsaiagents.com.
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".bsaiagents.com")) {
    return ".bsaiagents.com";
  }
  return window.location.hostname;
}

export function setBsaiUserCookie(email: string) {
  document.cookie =
    BSAI_USER_COOKIE +
    "=" +
    encodeURIComponent(email) +
    "; Domain=" +
    cookieDomain() +
    "; Path=/; Max-Age=2592000; SameSite=Lax";
}

export function clearBsaiUserCookie() {
  document.cookie =
    BSAI_USER_COOKIE +
    "=; Domain=" +
    cookieDomain() +
    "; Path=/; Max-Age=0; SameSite=Lax";
}

/** Mount once in the workspace layout: keeps the cookie in sync on every load. */
export function BsaiUserCookie() {
  useEffect(() => {
    fetch("/api/v1/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (me && me.email) setBsaiUserCookie(me.email);
      })
      .catch(() => {});
  }, []);
  return null;
}
