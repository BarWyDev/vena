import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { getProfile, isProfileComplete } from "@/lib/profile";

const PROTECTED_ROUTES = ["/profile", "/donations"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const isProtected = PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route));

  if (isProtected) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    if (context.url.pathname !== "/profile" && supabase) {
      const profile = await getProfile(supabase, context.locals.user.id);
      if (!isProfileComplete(profile)) {
        return context.redirect("/profile");
      }
    }
  }

  return next();
});
