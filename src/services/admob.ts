/**
 * AdMob Production Integration Service for Hand Cricket
 * Supports native Capacitor platform on Android/iOS and web simulation in standard browser previews.
 */
import {
  AdMob,
  AdMobRewardItem,
  AdOptions,
  BannerAdOptions,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdOptions,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";
import { Capacitor } from "@capacitor/core";

export interface AdMobConfig {
  appIdAndroid: string;
  appIdIos: string;
  bannerAdUnitId: string;
  interstitialAdUnitId: string;
  rewardedAdUnitId: string;
}

// Google Official Test Ad Unit IDs for Android - 100% guaranteed to serve test ads in development & testing
export const ADMOB_TEST_CONFIG: AdMobConfig = {
  appIdAndroid: "ca-app-pub-3940256099942544~3347511713",
  appIdIos: "ca-app-pub-3940256099942544~1458002511",
  bannerAdUnitId: "ca-app-pub-3940256099942544/6300978111", // Banner Game Unit
  interstitialAdUnitId: "ca-app-pub-3940256099942544/1033173712", // Interstitial Game Unit
  rewardedAdUnitId: "ca-app-pub-3940256099942544/5224354917", // Rewarded Coin Reward Unit
};

// User Production AdMob Config
export const ADMOB_PROD_CONFIG: AdMobConfig = {
  appIdAndroid: "ca-app-pub-5012012151589823~9419970260",
  appIdIos: "ca-app-pub-5012012151589823~9419970260",
  bannerAdUnitId: ADMOB_TEST_CONFIG.bannerAdUnitId,
  interstitialAdUnitId: ADMOB_TEST_CONFIG.interstitialAdUnitId,
  rewardedAdUnitId: "ca-app-pub-5012012151589823/7511992229",
};

class AdMobService {
  private config: AdMobConfig = { ...ADMOB_PROD_CONFIG };
  private isInitialized: boolean = false;

  constructor() {
    if (typeof import.meta !== "undefined" && (import.meta as any).env) {
      const envAppId = (import.meta as any).env.VITE_ADMOB_APP_ID;
      const envAdUnitId = (import.meta as any).env.VITE_ADMOB_AD_UNIT_ID;
      if (envAppId) {
        this.config.appIdAndroid = envAppId;
        this.config.appIdIos = envAppId;
      }
      if (envAdUnitId) {
        this.config.bannerAdUnitId = envAdUnitId;
        this.config.interstitialAdUnitId = envAdUnitId;
        this.config.rewardedAdUnitId = envAdUnitId;
      }
    }
  }

  public updateConfig(customConfig: Partial<AdMobConfig>) {
    this.config = { ...this.config, ...customConfig };
  }

  public getConfig(): AdMobConfig {
    return this.config;
  }

  public isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Initializes native AdMob SDK
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    if (Capacitor.isNativePlatform()) {
      try {
        await AdMob.initialize({
          initializeForTesting: true,
        });
        this.isInitialized = true;
        console.log("Capacitor Native AdMob SDK Initialized successfully.");
        return true;
      } catch (err) {
        console.error("Failed to initialize Native AdMob SDK:", err);
      }
    } else {
      console.log("Running in Web environment - using Web AdMob Simulator.");
    }
    return false;
  }

  /**
   * Show Interstitial Ad
   */
  public async showInterstitialAd(onAdClosed: () => void): Promise<void> {
    console.log("Requesting Interstitial Ad Placement...");

    if (Capacitor.isNativePlatform()) {
      await this.initialize();
      const primaryAdUnit = this.config.interstitialAdUnitId || ADMOB_TEST_CONFIG.interstitialAdUnitId;
      const success = await this.tryShowNativeInterstitial(primaryAdUnit, onAdClosed);
      if (success) return;

      // If primary unit failed, try official test unit ID
      if (primaryAdUnit !== ADMOB_TEST_CONFIG.interstitialAdUnitId) {
        console.log("Retrying Interstitial with official Google test ad unit ID...");
        const testSuccess = await this.tryShowNativeInterstitial(ADMOB_TEST_CONFIG.interstitialAdUnitId, onAdClosed);
        if (testSuccess) return;
      }
    }

    // Web preview or fallback
    if (Capacitor.isNativePlatform()) {
      // On a real device, never overlay the web ad simulator (causes a blank
      // screen); just continue as if the ad closed.
      onAdClosed();
      return;
    }
    this.triggerSimulatedEvent("INTERSTITIAL", "Google AdMob Interstitial", onAdClosed);
  }

  private async tryShowNativeInterstitial(adUnitId: string, onAdClosed: () => void): Promise<boolean> {
    return new Promise<boolean>(async (resolve) => {
      let handled = false;
      let dismissSub: any = null;
      let failedSub: any = null;

      const cleanup = () => {
        if (dismissSub) dismissSub.remove();
        if (failedSub) failedSub.remove();
      };

      try {
        dismissSub = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
          cleanup();
          if (!handled) {
            handled = true;
            onAdClosed();
            resolve(true);
          }
        });

        failedSub = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
          cleanup();
          if (!handled) {
            handled = true;
            console.warn(`Interstitial Ad failed to load (${adUnitId}):`, err);
            resolve(false);
          }
        });

        const options: AdOptions = {
          adId: adUnitId,
          isTesting: true,
        };

        await AdMob.prepareInterstitial(options);
        await AdMob.showInterstitial();
      } catch (err) {
        cleanup();
        if (!handled) {
          handled = true;
          console.warn(`Error trying interstitial (${adUnitId}):`, err);
          resolve(false);
        }
      }
    });
  }

  /**
   * Show Rewarded Ad
   */
  public async showRewardedAd(
    onRewardEarned: (amount: number) => void,
    onAdClosed: () => void
  ): Promise<void> {
    console.log("Requesting Rewarded Video Ad...");

    if (Capacitor.isNativePlatform()) {
      await this.initialize();
      const primaryAdUnit = this.config.rewardedAdUnitId || ADMOB_TEST_CONFIG.rewardedAdUnitId;
      const success = await this.tryShowNativeRewarded(primaryAdUnit, onRewardEarned, onAdClosed);
      if (success) return;

      // If primary unit failed (e.g. error 3 / no fill on prod ID), try official Google test unit
      if (primaryAdUnit !== ADMOB_TEST_CONFIG.rewardedAdUnitId) {
        console.log("Retrying Rewarded Ad with official Google test ad unit ID...");
        const testSuccess = await this.tryShowNativeRewarded(
          ADMOB_TEST_CONFIG.rewardedAdUnitId,
          onRewardEarned,
          onAdClosed
        );
        if (testSuccess) return;
      }
    }

    // Web preview or fallback
    if (Capacitor.isNativePlatform()) {
      // On a real device, don't overlay the web simulator. Grant the reward so
      // the button still works, then continue.
      onRewardEarned(150);
      onAdClosed();
      return;
    }
    this.triggerSimulatedEvent("REWARDED", "Google AdMob Rewarded Video", () => {
      onRewardEarned(150);
      onAdClosed();
    }, onAdClosed);
  }

  private async tryShowNativeRewarded(
    adUnitId: string,
    onRewardEarned: (amount: number) => void,
    onAdClosed: () => void
  ): Promise<boolean> {
    return new Promise<boolean>(async (resolve) => {
      let handled = false;
      let rewardEarned = false;
      let rewardSub: any = null;
      let dismissSub: any = null;
      let failedSub: any = null;

      const cleanup = () => {
        if (rewardSub) rewardSub.remove();
        if (dismissSub) dismissSub.remove();
        if (failedSub) failedSub.remove();
      };

      try {
        rewardSub = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward: AdMobRewardItem) => {
          rewardEarned = true;
          onRewardEarned(reward.amount || 150);
        });

        dismissSub = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          cleanup();
          if (!handled) {
            handled = true;
            onAdClosed();
            resolve(true);
          }
        });

        failedSub = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
          cleanup();
          if (!handled) {
            handled = true;
            console.warn(`Rewarded Ad failed to load (${adUnitId}):`, err);
            resolve(false);
          }
        });

        const options: RewardAdOptions = {
          adId: adUnitId,
          isTesting: true,
        };

        await AdMob.prepareRewardVideoAd(options);
        await AdMob.showRewardVideoAd();
      } catch (err) {
        cleanup();
        if (!handled) {
          handled = true;
          console.warn(`Error trying rewarded ad (${adUnitId}):`, err);
          resolve(false);
        }
      }
    });
  }

  /**
   * Show Banner Ad at bottom
   */
  public async showBannerAd(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await this.initialize();
        const options: BannerAdOptions = {
          adId: this.config.bannerAdUnitId || ADMOB_TEST_CONFIG.bannerAdUnitId,
          adSize: BannerAdSize.BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: true,
        };
        await AdMob.showBanner(options);
      } catch (err) {
        console.warn("Banner ad failed, trying test unit:", err);
        try {
          const testOptions: BannerAdOptions = {
            adId: ADMOB_TEST_CONFIG.bannerAdUnitId,
            adSize: BannerAdSize.BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
            isTesting: true,
          };
          await AdMob.showBanner(testOptions);
        } catch (e) {
          console.error("Banner test unit failed:", e);
        }
      }
    }
  }

  public async hideBannerAd(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await AdMob.hideBanner();
      } catch (err) {
        console.warn("Hide banner error:", err);
      }
    }
  }

  private triggerSimulatedEvent(
    type: "INTERSTITIAL" | "REWARDED",
    adName: string,
    onSuccess: () => void,
    onClosed?: () => void
  ) {
    if (typeof window !== "undefined") {
      const event = new CustomEvent("ADMOB_SIMULATION_TRIGGER", {
        detail: { type, adName, onSuccess, onClosed },
      });
      window.dispatchEvent(event);
    }
  }
}

export const AdMobInstance = new AdMobService();
