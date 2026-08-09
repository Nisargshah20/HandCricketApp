import { useState } from "react";
import { Coins, Sparkles, TrendingUp, Cpu, Award, Zap, Shield, HelpCircle, DollarSign, Users, Eye, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function RevenueCenter() {
  const [dau, setDau] = useState<number>(10000); // Daily Active Users slider
  const [premiumConversion, setPremiumConversion] = useState<number>(2.5); // % conversion to premium pass
  const [monthlyAdRevenue, setMonthlyAdRevenue] = useState<number>(0.15); // eCPM or run rate per active user
  const [notification, setNotification] = useState<string | null>(null);

  // Calculations
  const premiumPrice = 4.99;
  const standardCut = 0.30; // App store fee
  const premiumRevenue = dau * (premiumConversion / 100) * premiumPrice * (1 - standardCut);
  const adRevenue = dau * monthlyAdRevenue;
  const tournamentFees = dau * 0.1 * 1.50 * 0.10; // 10% daily users play $1.50 matches with 10% rake
  const totalMonthlyRevenue = premiumRevenue + adRevenue + tournamentFees;

  const prebuiltSkins = [
    { id: "skin_neon", name: "Cyber Neon Hand", price: 250, preview: "🖐️⚡", color: "from-cyan-400 to-blue-500", desc: "Illuminates with synthwave neon light on throws" },
    { id: "skin_fire", name: "Pyromancer Blaze", price: 500, preview: "🖐️🔥", color: "from-orange-500 to-rose-600", desc: "Erupts in custom flames when throwing a massive 6!" },
    { id: "skin_gold", name: "Guaranteed Aurum", price: 1000, preview: "🖐️👑", color: "from-amber-400 to-yellow-600", desc: "Solid 24k gold hand with champion custom boundary music" },
  ];

  const handleUnlockSkin = (skinName: string) => {
    setNotification(`Successfully purchased the "${skinName}" premium skin!`);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-8 max-w-4xl mx-auto shadow-xl text-slate-100">
      {/* Title Header */}
      <div className="border-b border-slate-800 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-500/10 text-yellow-500 font-mono text-xs rounded-full border border-yellow-500/20 mb-2">
          <TrendingUp className="w-3.5 h-3.5" />
          BUSINESS STRATEGY HUB
        </div>
        <h2 className="text-3xl font-sans font-bold tracking-tight bg-gradient-to-r from-amber-400 via-yellow-200 to-emerald-400 bg-clip-text text-transparent">
          How to Build Revenue from Hand Cricket
        </h2>
        <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-2xl">
          While Hand Cricket is traditionally a game of pure speed and reflexes, transforming it into a digital franchise unlocks major monetization streams. Below is a real-word breakdown and interactive model.
        </p>
      </div>

      {/* Grid of Core Strategies */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all">
          <div className="w-10 h-10 bg-indigo-500/15 text-indigo-400 flex items-center justify-center rounded-lg mb-4">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="text-md font-semibold text-white">1. Hypercasual Ads</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Implement <strong>Rewarded Video Ads</strong>. Players watch a 15-second ad to get an "Innings Revive" (retry a ball that was OUT) in single player, or to earn premium Gold coins. Integrate standard banner ads at the foot.
          </p>
        </div>

        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all">
          <div className="w-10 h-10 bg-emerald-500/15 text-emerald-400 flex items-center justify-center rounded-lg mb-4">
            <Coins className="w-5 h-5" />
          </div>
          <h3 className="text-md font-semibold text-white">2. Skin Cosmetics Shop</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Sell <strong>Custom Hand Throws & Emojis</strong>. Players use in-game gold (bought with real microtransactions) to unlock high-fidelity throw visual trails, stadium backgrounds, and funny trash talk phrases.
          </p>
        </div>

        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-5 hover:border-slate-700/80 transition-all">
          <div className="w-10 h-10 bg-amber-500/15 text-amber-400 flex items-center justify-center rounded-lg mb-4">
            <Award className="w-5 h-5" />
          </div>
          <h3 className="text-md font-semibold text-white">3. Paid Pro leagues</h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Host <strong>Pot-Split Cash Tournaments</strong>. Users pay $0.50-$2.00 entry ticket to play in a 16-player bracket. The top winners split the entry fees, and your platform takes a guaranteed <strong>10% Rake Fee</strong>.
          </p>
        </div>
      </div>

      {/* Interactive Revenue Calculator */}
      <div className="bg-slate-950 border border-slate-850 rounded-xl p-6 space-y-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <TrendingUp className="text-emerald-400 w-5 h-5" />
          Interactive Lifetime & Monthly Revenue Planner
        </h3>
        <p className="text-xs text-slate-400">
          Slide the values below to forecast potential revenue from your Hand Cricket game based on organic traffic models and simple standard gaming benchmarks.
        </p>

        <div className="space-y-4">
          {/* DAU */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">Daily Active Users (DAU)</span>
              <span className="text-emerald-400 font-bold">{dau.toLocaleString()} users</span>
            </div>
            <input
              type="range"
              min="1000"
              max="150000"
              step="1000"
              value={dau}
              onChange={(e) => setDau(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 bg-slate-900 cursor-pointer h-2 rounded-lg"
            />
          </div>

          {/* Premium Conversion */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">Season Pass Conversion Rate</span>
              <span className="text-indigo-400 font-bold">{premiumConversion}% convert</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={premiumConversion}
              onChange={(e) => setPremiumConversion(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 bg-slate-900 cursor-pointer h-2 rounded-lg"
            />
          </div>

          {/* eCPM ad support */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300">User Monthly Ad Rake</span>
              <span className="text-cyan-400 font-bold">${monthlyAdRevenue.toFixed(2)} / user</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.00"
              step="0.05"
              value={monthlyAdRevenue}
              onChange={(e) => setMonthlyAdRevenue(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 bg-slate-900 cursor-pointer h-2 rounded-lg"
            />
          </div>
        </div>

        {/* Forecast Output */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="text-center p-2 border-r border-slate-800/50 last:border-0 md:last:visible">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Premium Passes</span>
            <span className="text-sm md:text-md font-bold text-slate-200">${premiumRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
          </div>
          <div className="text-center p-2 border-r border-slate-800/50 last:border-0 md:last:visible">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Ad Revenue</span>
            <span className="text-sm md:text-md font-bold text-slate-200">${adRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
          </div>
          <div className="text-center p-2 border-r border-slate-800/50 last:border-0 md:last:visible">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Tournament Rake</span>
            <span className="text-sm md:text-md font-bold text-slate-200">${tournamentFees.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
          </div>
          <div className="text-center p-2">
            <span className="text-[10px] text-yellow-400 font-bold uppercase font-mono block">ESTIMATED TOTAL</span>
            <span className="text-md md:text-xl font-black text-emerald-400">${totalMonthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</span>
          </div>
        </div>
      </div>

      {/* Cosmetic Shop Showcase */}
      <div className="space-y-4">
        <h3 className="text-md font-semibold text-white flex items-center gap-2">
          <Sparkles className="text-yellow-400 w-4 h-4" />
          Interactive Cosmetic Shop (Premium Demo)
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Premium gesture effects let players brandish custom visual identities during critical double-locks. Toggle a mock purchase or selection below!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {prebuiltSkins.map((skin) => (
            <div
              key={skin.id}
              className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition"
            >
              <div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-tr ${skin.color} flex items-center justify-center text-2xl shadow`}>
                  {skin.preview}
                </div>
                <h4 className="text-white font-semibold text-xs mt-3">{skin.name}</h4>
                <p className="text-[10px] text-slate-400 mt-1">{skin.desc}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-850 flex items-center justify-between">
                <span className="text-[10px] font-mono text-amber-400 font-bold flex items-center gap-1">
                  <Coins className="w-3 h-3" />
                  {skin.price} Coins
                </span>
                <button
                  onClick={() => handleUnlockSkin(skin.name)}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 font-bold text-[9px] text-slate-950 rounded transition"
                >
                  Collect Effect
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-950 border border-emerald-500/35 text-emerald-400 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 max-w-sm"
          >
            <CheckCircle className="w-4 h-4 text-emerald-450 shrink-0" />
            <p className="text-xs font-semibold">{notification}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
