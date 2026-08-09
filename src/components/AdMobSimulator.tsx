import { useState, useEffect } from "react";
import { Sparkles, X, Play, Clock, ShieldCheck, HelpCircle, ArrowRight, Zap, Coins, ChevronRight, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AdMobInstance, ADMOB_TEST_CONFIG } from "../services/admob";

export default function AdMobSimulator() {
  const [activeAd, setActiveAd] = useState<{
    type: "INTERSTITIAL" | "REWARDED";
    adName: string;
    onSuccess: () => void;
    onClosed?: () => void;
  } | null>(null);

  const [counter, setCounter] = useState(5);
  const [step, setStep] = useState<"PLAYING" | "COMPLETED">("PLAYING");

  useEffect(() => {
    const handleTrigger = (e: any) => {
      const detail = e.detail;
      setActiveAd(detail);
      setCounter(5);
      setStep("PLAYING");
    };

    window.addEventListener("ADMOB_SIMULATION_TRIGGER", handleTrigger);
    return () => {
      window.removeEventListener("ADMOB_SIMULATION_TRIGGER", handleTrigger);
    };
  }, []);

  useEffect(() => {
    if (!activeAd || counter <= 0) {
      if (counter === 0 && step === "PLAYING") {
        setStep("COMPLETED");
      }
      return;
    }

    const timer = setTimeout(() => {
      setCounter((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeAd, counter, step]);

  if (!activeAd) return null;

  const handleClose = (aborted: boolean) => {
    if (aborted && activeAd.type === "REWARDED") {
      // If aborted rewarded ad, trigger onClosed only
      if (activeAd.onClosed) activeAd.onClosed();
    } else {
      // Trigger success callback
      activeAd.onSuccess();
    }
    setActiveAd(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 shadow-2xl overflow-y-auto max-h-[90vh] md:max-h-none"
      >
        {/* Left Side: Interactive Mock Screen representing the Device Screen rendering the Ad */}
        <div className="relative md:col-span-7 bg-slate-950 flex flex-col justify-between p-6 min-h-[400px] border-b md:border-b-0 md:border-r border-slate-850">
          {/* Ad Header */}
          <div className="flex justify-between items-center z-10">
            <span className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[9px] font-mono font-bold tracking-widest px-2.5 py-1 rounded-full uppercase">
              <Sparkles className="w-3 h-3 text-yellow-400 animate-pulse" />
              {activeAd.type === "REWARDED" ? "Google AdMob Rewarded Video Ad" : "Google AdMob Interstitial Ad"}
            </span>

            {/* Counter Skip/Close Badge */}
            {step === "PLAYING" ? (
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 text-slate-400 text-xs px-3 py-1 rounded-full font-mono font-medium">
                <Clock className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                <span>Rewards in {counter}s</span>
              </div>
            ) : (
              <button
                onClick={() => handleClose(false)}
                className="flex items-center gap-1 bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-bold px-3 py-1.5 rounded-full transition active:scale-95 shadow"
              >
                Claim & Close <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Ad Content Block simulating a Premium App Showcase */}
          <div className="my-auto z-10 text-center max-w-sm mx-auto space-y-6 pt-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-650 flex items-center justify-center text-3xl mx-auto shadow-xl shadow-indigo-500/20 animate-bounce">
              🏏
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-black text-white tracking-tight leading-none">
                HAND CRICKET PRO STADIUM
              </h4>
              <p className="text-[11px] text-slate-400 font-mono tracking-wide leading-relaxed">
                Unlock seasonal stadiums, 24k gold hand skins, and fast matchmaking right inside the Pro Arena!
              </p>
            </div>

            {/* High fidelity interactive mockup image */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3.5 text-left max-w-xs mx-auto shadow-sm">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg">
                👑
              </div>
              <div>
                <span className="text-[9px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">PREMIUM CRICKET PASS</span>
                <span className="text-xs text-white font-extrabold block">Get +10,000 Coins & Glow Packs</span>
              </div>
            </div>
          </div>

          {/* Ad Footer */}
          <div className="flex items-center justify-between z-10 pt-4 border-t border-slate-850/50">
            <div className="text-left font-mono">
              <span className="text-[9px] text-slate-500 block uppercase font-bold">SPONSOR</span>
              <span className="text-xs font-extrabold text-slate-350">HandCricket Network Inc.</span>
            </div>
            <button
              onClick={() => handleClose(false)}
              disabled={step === "PLAYING" && activeAd.type === "REWARDED"}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
                step === "PLAYING" && activeAd.type === "REWARDED"
                  ? "bg-slate-900 text-slate-600 cursor-not-allowed"
                  : "bg-white text-slate-950 hover:bg-slate-100"
              }`}
            >
              Skip Ad <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Device Frame Ambient Light effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent pointer-events-none" />
        </div>

        {/* Right Side: Educational Implementation Guide with Setup details */}
        <div className="md:col-span-5 p-6 md:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-black text-indigo-400 block uppercase tracking-widest">
                DEVELOPER DEPLOYMENT
              </span>
              <h3 className="text-xl font-black text-white tracking-tight">
                Google AdMob Setup
              </h3>
            </div>

            {/* Explanation card matching user select question */}
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-3">
              <span className="text-[9px] font-mono text-yellow-500 font-black flex items-center gap-1.5 uppercase">
                <HelpCircle className="w-3.5 h-3.5" />
                Which ad format should i select?
              </span>
              
              <div className="text-[11px] leading-relaxed text-slate-300 space-y-2">
                <p>
                  For a fast-paced game like <strong className="text-white">Hand Cricket</strong>, you should select:
                </p>
                <ul className="space-y-1.5 pl-3 list-disc text-slate-400">
                  <li>
                    <strong className="text-emerald-400 font-semibold">1. Rewarded Ads (HIGHEST PRIORITY):</strong> Opt-in only. Users view to claim <span className="text-emerald-450 font-bold">+150 Coins</span>. Maximize eCPM with minimal player resentment.
                  </li>
                  <li>
                    <strong className="text-indigo-400 font-semibold">2. Banner Ads:</strong> Safe and constant. Anchored flat at the footer of menus, generating clean passive revenue.
                  </li>
                  <li>
                    <strong className="text-pink-400 font-semibold">3. Interstitial Ads:</strong> Triggers organically only on match-over screens to secure views during logic breaks.
                  </li>
                </ul>
              </div>
            </div>

            {/* Ad Unit configuration IDs */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">
                Production Unit Configs
              </span>
              <div className="rounded-xl border border-slate-850 p-2.5 font-mono text-[9px] text-slate-400 space-y-1 bg-slate-950/40">
                <div className="flex justify-between border-b border-slate-900 pb-1">
                  <span className="text-slate-500">FORMAT:</span>
                  <span className="text-white font-bold">{activeAd.type}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">TEST UNIT ID:</span>
                  <span className="text-yellow-400 select-all font-bold">
                    {activeAd.type === "REWARDED" ? ADMOB_TEST_CONFIG.rewardedAdUnitId : ADMOB_TEST_CONFIG.interstitialAdUnitId}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Close details button */}
          <div className="pt-4 border-t border-slate-850/60">
            <button
              onClick={() => handleClose(false)}
              className="w-full py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950 hover:bg-slate-850 font-bold text-slate-300 hover:text-white text-xs tracking-wide transition text-center"
            >
              Close Guide & Play
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
