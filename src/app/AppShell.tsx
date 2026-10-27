"use client";
import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { shareAdapter } from "@/lib/whatsapp";
import { MARKUP } from "@/legacy/markup";
import { createServices, type Me } from "@/legacy/services";
import { startApp } from "@/legacy/app.js";

let started = false;

export default function AppShell({ me }: { me: Me }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (started || !root.current) return;
    started = true;
    root.current.innerHTML = MARKUP;
    const sb = supabaseBrowser();
    const signOut = async () => {
      await sb.auth.signOut();
      location.href = "/login";
    };
    startApp({ ...createServices(sb, me), appUrl: location.origin, extras: { signOut, whatsapp: shareAdapter } });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [me]);

  return <div ref={root} />;
}
