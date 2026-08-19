import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) =>
    name.startsWith("sb-") && name.includes("-auth-token"),
  );
}

function copyResponseCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    to.cookies.set(name, value, options);
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Most public visitors have no Supabase session at all. Avoid creating an
  // auth client and validating claims for those requests so public pages can
  // start rendering immediately.
  if (!hasSupabaseAuthCookie(request)) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  // Keep the existing behavior where an authenticated visitor opening the
  // marketing homepage goes straight to the product dashboard, while the
  // homepage itself remains fast for anonymous visitors.
  if (request.nextUrl.pathname === "/" && data?.claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    copyResponseCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}
