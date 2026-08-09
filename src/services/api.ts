// Resolves the backend base URL for REST + WebSocket.
//
// The packaged mobile app is served from its own local WebView origin
// (https://localhost), which has NO backend. Set VITE_API_BASE_URL to your
// deployed backend (e.g. https://your-app.onrender.com) at build time so the
// app talks to the real server. When empty (web/dev, same-origin), relative
// URLs are used so nothing changes for local `npm run dev`.
const RAW_BASE = ((import.meta as any).env?.VITE_API_BASE_URL ?? "").toString().trim();

export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

export function wsUrl(): string {
  if (API_BASE) {
    // http(s)://host -> ws(s)://host
    return API_BASE.replace(/^http/i, "ws");
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}
