import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live") return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers } });
  const finish = (result = response) => {
    result.headers.set("Content-Security-Policy", csp);
    result.headers.set("Cache-Control", "private, no-store, max-age=0");
    result.headers.set("X-Robots-Tag", "noindex, nofollow");
    return result;
  };
  const path = request.nextUrl.pathname;
  const publicPath =
    path === "/robots.txt" ||
    ["/signin", "/signup", "/reset-password", "/unsubscribe", "/api/"].some(
      (prefix) => path === prefix || path.startsWith(prefix === "/api/" ? prefix : `${prefix}/`),
    );
  if (publicPath) return finish(); // Every API separately authenticates or validates a provider signature.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.APP_ORIGIN)
    return finish(NextResponse.redirect(new URL("/signin?reason=setup", request.url)));
  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        httpOnly: true,
        secure: process.env.APP_ORIGIN.startsWith("https:"),
        sameSite: "lax",
        path: "/",
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" }),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          headers.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers } });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.APP_ORIGIN?.startsWith("https:"),
              sameSite: "lax",
              path: "/",
            }),
          );
        },
      },
    },
  );
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email_confirmed_at) {
      const redirect = NextResponse.redirect(new URL("/signin", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return finish(redirect);
    }
  } catch {
    return finish(NextResponse.redirect(new URL("/signin?reason=unavailable", request.url)));
  }
  return finish();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
