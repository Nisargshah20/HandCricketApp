// Google Sign-In via @capgo/capacitor-social-login (Capacitor 8 compatible).
// Set VITE_GOOGLE_WEB_CLIENT_ID (the OAuth "Web application" client id) at build time.
import { SocialLogin } from "@capgo/capacitor-social-login";

const WEB_CLIENT_ID = ((import.meta as any).env?.VITE_GOOGLE_WEB_CLIENT_ID ?? "").toString().trim();

export const googleConfigured = !!WEB_CLIENT_ID;

let initialized = false;

export async function initAuth(): Promise<void> {
  if (initialized || !WEB_CLIENT_ID) return;
  await SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } });
  initialized = true;
}

export interface GoogleSignInResult {
  idToken: string;
  name?: string;
  email?: string;
  picture?: string;
}

export async function googleSignIn(): Promise<GoogleSignInResult> {
  await initAuth();
  const res = await SocialLogin.login({ provider: "google", options: { scopes: ["email", "profile"] } });
  const r: any = res.result;
  const idToken: string | undefined = r?.idToken;
  if (!idToken) throw new Error("Google did not return an ID token");
  return { idToken, name: r?.profile?.name, email: r?.profile?.email, picture: r?.profile?.imageUrl };
}

export async function googleSignOut(): Promise<void> {
  try {
    await SocialLogin.logout({ provider: "google" });
  } catch {
    // ignore logout errors (already signed out / not initialized)
  }
}
