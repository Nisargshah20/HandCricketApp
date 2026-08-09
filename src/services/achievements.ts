// Achievement catalog + evaluation. Unlock state persists in localStorage.
// Purely local/offline; unlocking awards a coin bonus in the app layer.

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: number;
}

export interface AchievementStats {
  wins: number;
  matches: number;
  highScore: number;
  rating: number;
  coins: number;
  dailyStreak: number;
  wonCup: boolean;
  playedMultiplayer: boolean;
  wonOnHard: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_win", name: "First Blood", desc: "Win your first match", icon: "🎯", reward: 100 },
  { id: "ten_wins", name: "Seasoned Pro", desc: "Win 10 matches", icon: "🏅", reward: 250 },
  { id: "fifty_matches", name: "Crease Regular", desc: "Play 50 matches", icon: "🏟️", reward: 300 },
  { id: "half_century", name: "Half Century", desc: "Score 50 in a single innings", icon: "5️⃣0️⃣", reward: 300 },
  { id: "daily_5", name: "Loyal Fan", desc: "Reach a 5-day login streak", icon: "🔥", reward: 200 },
  { id: "elo_1200", name: "Rising Star", desc: "Climb to 1200 ELO", icon: "⭐", reward: 300 },
  { id: "hard_win", name: "Giant Slayer", desc: "Beat the AI on Hard difficulty", icon: "🧠", reward: 350 },
  { id: "cup_champ", name: "Cup Champion", desc: "Win the Grand Cup tournament", icon: "🏆", reward: 500 },
  { id: "multiplayer", name: "Challenger", desc: "Finish an online multiplayer match", icon: "🌐", reward: 200 },
  { id: "rich", name: "Coin Baron", desc: "Bank 5,000 coins", icon: "💰", reward: 250 },
];

// Returns the set of achievement ids that should be unlocked for the given stats.
export function evaluateAchievements(s: AchievementStats): string[] {
  const unlocked: string[] = [];
  if (s.wins >= 1) unlocked.push("first_win");
  if (s.wins >= 10) unlocked.push("ten_wins");
  if (s.matches >= 50) unlocked.push("fifty_matches");
  if (s.highScore >= 50) unlocked.push("half_century");
  if (s.dailyStreak >= 5) unlocked.push("daily_5");
  if (s.rating >= 1200) unlocked.push("elo_1200");
  if (s.wonOnHard) unlocked.push("hard_win");
  if (s.wonCup) unlocked.push("cup_champ");
  if (s.playedMultiplayer) unlocked.push("multiplayer");
  if (s.coins >= 5000) unlocked.push("rich");
  return unlocked;
}
