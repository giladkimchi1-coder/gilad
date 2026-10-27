import { redirect } from "next/navigation";
import { currentRole } from "@/lib/supabase/server";
import AppShell from "./AppShell";

export default async function Home() {
  const { sb, me } = await currentRole();
  if (!me) {
    const { data } = await sb.auth.getUser();
    if (!data.user) redirect("/login");
  }
  if (!me?.role) {
    return (
      <main className="login">
        <div className="panel">
          <h1>יומן אתר בינפלד</h1>
          <p>נכנסת בהצלחה, אבל עוד לא קיבלת הרשאה לאפליקציה.</p>
          <p className="muted small">בקש מגלעד להגדיר לך תפקיד (מנהל, הנהלת חשבונות, מנהל עבודה או רכש).</p>
        </div>
      </main>
    );
  }
  return <AppShell me={me} />;
}
