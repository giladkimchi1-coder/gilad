"use client";
import { useState } from "react";

// Local setup only: saves the Anthropic key into .env.local (see /api/setup/key).
export default function SetupKey() {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/setup/key", { method: "POST", body: JSON.stringify({ key: key.trim() }) });
    const b = await r.json().catch(() => ({}));
    setMsg(r.ok ? "✓ המפתח נשמר. אפשר לחזור לצ'אט." : b.error || "השמירה נכשלה");
    if (r.ok) setKey("");
  };
  return (
    <main className="login">
      <form className="panel" onSubmit={save}>
        <h1>מפתח Anthropic</h1>
        <label className="f">
          הדבק כאן את המפתח (מתחיל ב-sk-ant-)
          <input type="password" dir="ltr" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." autoFocus />
        </label>
        <button className="primary" type="submit" disabled={!key.trim()}>שמור</button>
        {msg && <div className={msg.startsWith("✓") ? "banner info" : "banner warn"}>{msg}</div>}
        <p className="muted small">המפתח נשמר רק בקובץ ‎.env.local במחשב הזה. הוא לא נשלח לשום מקום אחר.</p>
      </form>
    </main>
  );
}
