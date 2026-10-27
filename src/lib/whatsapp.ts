"use client";
// How approved outbox items reach WhatsApp. Only items the admin approved in the app are ever
// passed here (the outbox freezes the approved text). The sending method isn't decided yet,
// so the active adapter opens the phone's share sheet / WhatsApp with the text for the user
// to send. A future adapter (e.g. WhatsApp Business API on a company number) implements the
// same interface on the server.

export type OutboxItem = { kind: "log" | "doc"; text: string; images: string[] };
export type SendResult = { ok: boolean; via?: string; error?: string };
export interface WhatsAppAdapter {
  send(item: OutboxItem, blobUrl: (id: string) => string): Promise<SendResult>;
}

export const shareAdapter: WhatsAppAdapter = {
  async send(item, blobUrl) {
    if (navigator.share) {
      let files: File[] = [];
      try {
        files = await Promise.all(
          item.images.slice(0, 10).map(async (id, i) => {
            const b = await (await fetch(blobUrl(id))).blob();
            return new File([b], `${item.kind}-${i + 1}.${b.type.includes("pdf") ? "pdf" : "jpg"}`, { type: b.type });
          }),
        );
      } catch {
        files = [];
      }
      const withFiles = files.length && navigator.canShare?.({ files }) ? { files } : {};
      try {
        await navigator.share({ text: item.text, ...withFiles });
        return { ok: true, via: "share" };
      } catch (e) {
        if ((e as Error).name === "AbortError") return { ok: false };
      }
    }
    // desktop without a share sheet: open WhatsApp with the text, the user picks the group
    // and presses "סמן שנשלח" after sending (we can't know whether it was sent)
    window.open("https://wa.me/?text=" + encodeURIComponent(item.text), "_blank", "noopener");
    return { ok: false };
  },
};
