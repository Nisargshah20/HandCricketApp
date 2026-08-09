// Cosmetics catalog + persistence for avatars and frames.
// Purchasable with in-game coins, equipped locally (no real currency).

export interface AvatarItem {
  id: string;
  emoji: string;
  name: string;
  price: number;
}

export interface FrameItem {
  id: string;
  name: string;
  ring: string; // Tailwind ring classes applied to the avatar circle
  price: number;
}

export const AVATAR_ITEMS: AvatarItem[] = [
  { id: "bat", emoji: "🏏", name: "Classic Bat", price: 0 },
  { id: "lion", emoji: "🦁", name: "Lion", price: 300 },
  { id: "tiger", emoji: "🐯", name: "Tiger", price: 300 },
  { id: "fire", emoji: "🔥", name: "On Fire", price: 500 },
  { id: "rocket", emoji: "🚀", name: "Rocket", price: 500 },
  { id: "robot", emoji: "🤖", name: "Mecha", price: 700 },
  { id: "alien", emoji: "👽", name: "Alien", price: 700 },
  { id: "crown", emoji: "👑", name: "Royalty", price: 900 },
  { id: "dragon", emoji: "🐉", name: "Dragon", price: 1200 },
  { id: "goat", emoji: "🐐", name: "G.O.A.T", price: 1800 },
];

export const FRAME_ITEMS: FrameItem[] = [
  { id: "none", name: "No Frame", ring: "", price: 0 },
  { id: "gold", name: "Gold Ring", ring: "ring-2 ring-yellow-400", price: 400 },
  { id: "emerald", name: "Emerald Ring", ring: "ring-2 ring-emerald-400", price: 400 },
  { id: "ruby", name: "Ruby Ring", ring: "ring-2 ring-red-400", price: 400 },
  { id: "diamond", name: "Diamond Ring", ring: "ring-2 ring-sky-300", price: 900 },
  { id: "champion", name: "Champion Ring", ring: "ring-2 ring-fuchsia-400", price: 1400 },
];

export const DEFAULT_OWNED = ["bat", "none"];

export function avatarEmoji(id: string): string {
  return (AVATAR_ITEMS.find((a) => a.id === id) || AVATAR_ITEMS[0]).emoji;
}

export function frameRing(id: string): string {
  return (FRAME_ITEMS.find((f) => f.id === id) || FRAME_ITEMS[0]).ring;
}

export function itemPrice(id: string): number {
  const a = AVATAR_ITEMS.find((x) => x.id === id);
  if (a) return a.price;
  const f = FRAME_ITEMS.find((x) => x.id === id);
  return f ? f.price : 0;
}
