"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMsg(/signups not allowed|not found/i.test(error.message) ? "המייל הזה לא רשום באפליקציה. בקש מגלעד להוסיף אותך." : /rate|seconds/i.test(error.message) ? "נשלחו יותר מדי קישורים. חכה כמה דקות ונסה שוב." : "השליחה נכשלה: " + error.message);
    } else setState("sent");
  };

  return (
    <main className="login">
      <form className="panel" onSubmit={send}>
        <h1>יומן אתר בינפלד</h1>
        {state === "sent" ? (
          <>
            <p>שלחנו קישור כניסה ל-<b className="num">{email}</b>.</p>
            <p className="muted small">פתח את המייל באותו מכשיר ולחץ על הקישור. אם הוא לא הגיע תוך דקה, בדוק בספאם.</p>
            <button type="button" className="ghost" onClick={() => setState("idle")}>שלח שוב</button>
          </>
        ) : (
          <>
            <label className="f">
              כתובת מייל
              <input type="email" required autoComplete="email" inputMode="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </label>
            <button className="primary" type="submit" disabled={state === "sending"}>{state === "sending" ? "שולח…" : "שלח לי קישור כניסה"}</button>
            {state === "error" && <div className="banner warn">{msg}</div>}
            <p className="muted small">בלי סיסמה: נשלח אליך מייל עם קישור, ולחיצה עליו מכניסה אותך.</p>
          </>
        )}
      </form>
    </main>
  );
}
