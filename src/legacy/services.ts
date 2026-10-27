"use client";
// The services the ported app expects (Firestore-style db, assets, AI "sample", user),
// implemented on Supabase. Every read/write goes through the store_* RPCs, which enforce
// the role rules on the server; realtime ticks on public.store_ticks trigger refetches.
import type { SupabaseClient } from "@supabase/supabase-js";

type Data = Record<string, unknown>;
type Row = { id: string; data: Data };
type Snap = { docs: { id: string; data: () => Data }[] };
type DocSnap = { exists: boolean; data: () => Data | undefined; metadata: { hasPendingWrites: boolean } };
type Err = { code: string; message: string };

const colOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
const clean = (d: unknown) => JSON.parse(JSON.stringify(d ?? {}));
const snapOf = (rows: Row[]): Snap => ({ docs: rows.map((r) => ({ id: r.id, data: () => r.data })) });
const toErr = (e: { code?: string; message?: string } | null): Err => ({
  code: e?.code === "42501" || /permission_denied/.test(e?.message || "") ? "permission_denied" : e?.code || "error",
  message: e?.message || "שגיאה",
});

export type Me = { id: string; email: string; name: string | null; role: string | null };

export function createServices(sb: SupabaseClient, me: Me) {
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const listen = (col: string, run: () => void) => {
    if (!listeners.has(col)) listeners.set(col, new Set());
    listeners.get(col)!.add(run);
    return () => listeners.get(col)?.delete(run);
  };
  const bump = (col: string) => {
    clearTimeout(timers.get(col));
    timers.set(col, setTimeout(() => listeners.get(col)?.forEach((f) => f()), 60));
  };
  // subscribe only once the session is loaded, so realtime runs as the user (RLS on ticks)
  sb.auth.getSession().then(async ({ data }) => {
    if (data.session) await sb.realtime.setAuth(data.session.access_token);
    sb.channel("store-ticks")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_ticks" }, (p) => {
        const col = (p.new as { col?: string })?.col || (p.old as { col?: string })?.col;
        if (col) bump(col);
      })
      .subscribe();
  });
  // after the phone wakes up, catch up on anything missed while asleep
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") listeners.forEach((_, col) => bump(col));
  });

  const list = async (col: string): Promise<Row[]> => {
    const { data, error } = await sb.rpc("store_list", { p_col: col });
    if (error) throw toErr(error);
    return (data || []) as Row[];
  };
  const call = async (fn: string, args: Data, col: string) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw toErr(error);
    bump(col);
    return data;
  };

  type Filter = [string, string, unknown];
  const query = (col: string, filters: Filter[] = []) => ({
    where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]]),
    get: async () => {
      const rows = await list(col);
      const ok = (r: Row) =>
        filters.every(([f, op, v]) => {
          const x = r.data[f] as string | number;
          const y = v as string | number;
          return op === ">=" ? x >= y : op === "<=" ? x <= y : op === "==" ? x === y : op === ">" ? x > y : op === "<" ? x < y : true;
        });
      return snapOf(rows.filter(ok));
    },
  });

  const db = {
    collection: (col: string) => ({
      ...query(col),
      onSnapshot: (cb: (s: Snap) => void, onErr?: (e: Err) => void) => {
        let alive = true;
        const run = () => list(col).then((r) => alive && cb(snapOf(r)), (e) => alive && onErr?.(e));
        run();
        const off = listen(col, run);
        return () => { alive = false; off(); };
      },
      add: async (data: Data) => ({ id: (await call("store_add", { p_col: col, p_data: clean(data) }, col)) as string }),
    }),
    doc: (path: string) => {
      const get = async (): Promise<DocSnap> => {
        const { data, error } = await sb.rpc("store_get", { p_path: path });
        if (error) throw toErr(error);
        return { exists: data != null, data: () => (data ?? undefined) as Data | undefined, metadata: { hasPendingWrites: false } };
      };
      return {
        get,
        onSnapshot: (cb: (s: DocSnap) => void, onErr?: (e: Err) => void) => {
          let alive = true;
          const run = () => get().then((s) => alive && cb(s), (e) => alive && onErr?.(e));
          run();
          const off = listen(colOf(path), run);
          return () => { alive = false; off(); };
        },
        set: (data: Data) => call("store_set", { p_path: path, p_data: clean(data) }, colOf(path)),
        update: (patch: Data) => call("store_merge", { p_path: path, p_patch: clean(patch) }, colOf(path)),
        delete: () => call("store_delete", { p_path: path }, colOf(path)),
      };
    },
    deleteProject: async (pid: string) => {
      const n = await call("store_delete_project", { p_pid: pid }, "projects");
      listeners.forEach((_, col) => col.includes(pid) && bump(col));
      return n as number;
    },
  };

  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const assets = {
    upload: async (file: File) => {
      const f = await shrink(file, 2400, 0.85);
      const id = newId();
      const { error } = await sb.storage.from("files").upload(id, f, { contentType: f.type || "application/octet-stream" });
      if (error) throw new Error(error.message);
      return { id, contentType: f.type, sizeBytes: f.size };
    },
  };

  const sample = {
    limits: async () => (await fetch("/api/ai/read")).json() as Promise<{ images: boolean }>,
    json: async (prompt: string, opts: { images?: File[] } = {}) => {
      const fd = new FormData();
      fd.append("prompt", prompt);
      const f = opts.images?.[0];
      if (f) fd.append("file", await shrink(f, 2000, 0.85));
      const res = await fetch("/api/ai/read", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw { code: body.error || "error" };
      return body.data;
    },
  };

  const user = {
    id: async () => me.id,
    me: async () => ({ name: me.name || me.email }),
    role: me.role,
    canEdit: async () => me.role === "admin" || me.role === "accounting",
    profiles: async (ids: string[]) => {
      const uuids = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      if (!uuids.length) return {};
      const { data } = await sb.rpc("profile_names", { p_ids: uuids });
      return Object.fromEntries(((data || []) as { id: string; name: string }[]).map((p) => [p.id, { name: p.name }]));
    },
  };

  return { db, assets, sample, user };
}

// Downscales big phone photos (keeps PDFs and small images as they are).
async function shrink(file: File, max: number, quality: number): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 600_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 4_000_000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}
