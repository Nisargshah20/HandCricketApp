import React, { useState, useEffect, useRef } from "react";
import {
  GameMode,
  PlayerStats,
  MatchHistoryItem,
  ClientMatchState,
  TournamentParticipant,
  TournamentMatch,
  TournamentState,
} from "./types";
import RevenueCenter from "./components/RevenueCenter";
import AdMobSimulator from "./components/AdMobSimulator";
import { AdMobInstance } from "./services/admob";
import { apiUrl, wsUrl } from "./services/api";
import { googleConfigured, initAuth, googleSignIn, googleSignOut } from "./services/auth";
import { App as CapacitorApp } from "@capacitor/app";
import confetti from "canvas-confetti";
import {
  Trophy,
  Users,
  Bot,
  Zap,
  TrendingUp,
  Volume2,
  VolumeX,
  Send,
  RefreshCw,
  Home,
  Dices,
  Play,
  ArrowRight,
  Sparkles,
  Info,
  Clock,
  LogOut,
  ChevronRight,
  ShieldAlert,
  Crown,
  Share2,
  User,
  LogIn,
  Edit3,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Web Audio API Retro Synthesizer to guarantee zero-dependency sound effects
class SoundEffects {
  private static ctx: AudioContext | null = null;
  public static isMuted = false;

  private static initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public static playClick() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio Context blocked or not supported:", e);
    }
  }

  public static playBallRun(runs: number) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      // Higher runs = higher pitch/cheer sound
      const baseFreq = 260 + runs * 50;
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (e) {}
  }

  public static playWicketOut() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      // Sad sliding buzzer sound
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.6);
    } catch (e) {}
  }

  public static playMatchWon() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      // Multi-note heroic arpeggio
      const notes = [261.63, 329.63, 392.00, 523.25]; // C major chord
      notes.forEach((note, i) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(note, this.ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + i * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + i * 0.12);
        osc.stop(this.ctx.currentTime + i * 0.12 + 0.3);
      });
    } catch (e) {}
  }
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  emoji?: string;
  timestamp: string;
}

// Resilient memory fallback for sandboxed iFrames where localStorage is disabled
const memoryStorage: Record<string, string> = {};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage.getItem blocked in sandboxed iFrame environment:", e);
      return memoryStorage[key] || null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn("localStorage.setItem blocked in sandboxed iFrame environment:", e);
      memoryStorage[key] = value;
    }
  },
  removeItem: (key: string): void => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn("localStorage.removeItem blocked in sandboxed iFrame environment:", e);
      delete memoryStorage[key];
    }
  }
};

export default function App() {
  const [mode, setMode] = useState<GameMode>(GameMode.MENU);
  const [lobbyTab, setLobbyTab] = useState<"play" | "tournament" | "multiplayer" | "leaderboard" | "shop">("play");

  // User Profile and persistent statistics
  const [username, setUsername] = useState<string>(() => {
    return safeLocalStorage.getItem("hc_username") || `Player_${Math.floor(1000 + Math.random() * 9000)}`;
  });
  const [userId, setUserId] = useState<string>(() => {
    let id = safeLocalStorage.getItem("hc_userid");
    if (!id) {
      id = `u_${Math.random().toString(36).substring(2, 11)}`;
      safeLocalStorage.setItem("hc_userid", id);
    }
    return id;
  });
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => safeLocalStorage.getItem("hc_google_signed_in") === "1");
  const [avatarColor, setAvatarColor] = useState<string>("from-sky-450 to-indigo-600");
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  // Persistent user metrics
  const [coins, setCoins] = useState<number>(() => {
    const val = safeLocalStorage.getItem("hc_coins");
    return val ? parseInt(val, 10) : 2450;
  });
  const [userWins, setUserWins] = useState<number>(() => {
    const val = safeLocalStorage.getItem("hc_wins");
    return val ? parseInt(val, 10) : 6;
  });
  const [userMatches, setUserMatches] = useState<number>(() => {
    const val = safeLocalStorage.getItem("hc_matches");
    return val ? parseInt(val, 10) : 10;
  });
  const [highScore, setHighScore] = useState<number>(() => {
    const val = safeLocalStorage.getItem("hc_highscore");
    return val ? parseInt(val, 10) : 48;
  });
  const [userRating, setUserRating] = useState<number>(() => {
    const val = safeLocalStorage.getItem("hc_rating");
    return val ? parseInt(val, 10) : 1000;
  });
  const [dailyCollectCount, setDailyCollectCount] = useState<number>(() => {
    const val = safeLocalStorage.getItem("hc_daily_collect");
    return val ? parseInt(val, 10) : 0;
  });

  // Automatically sync statistics on modifications
  useEffect(() => {
    safeLocalStorage.setItem("hc_coins", coins.toString());
  }, [coins]);
  useEffect(() => {
    safeLocalStorage.setItem("hc_wins", userWins.toString());
  }, [userWins]);
  useEffect(() => {
    safeLocalStorage.setItem("hc_matches", userMatches.toString());
  }, [userMatches]);
  useEffect(() => {
    safeLocalStorage.setItem("hc_highscore", highScore.toString());
  }, [highScore]);
  useEffect(() => {
    safeLocalStorage.setItem("hc_rating", userRating.toString());
  }, [userRating]);
  useEffect(() => {
    safeLocalStorage.setItem("hc_daily_collect", dailyCollectCount.toString());
  }, [dailyCollectCount]);

  const handleCollectDailyBonus = () => {
    if (dailyCollectCount > 0) return;
    SoundEffects.playMatchWon();
    setCoins((prev) => prev + 100);
    setDailyCollectCount(1);
  };

  // AI Game Match States
  const [aiInnings, setAiInnings] = useState<number>(1); // 1 or 2
  const [aiScore, setAiScore] = useState<number>(0);
  const [aiTarget, setAiTarget] = useState<number | null>(null);
  const [aiWickets, setAiWickets] = useState<number>(0);
  const [aiOvers, setAiOvers] = useState<string>("0.0");
  const [ballsCount, setBallsCount] = useState<number>(0);
  const [maxOversSelected, setMaxOversSelected] = useState<number>(2);
  const [aiDifficulty, setAiDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const [isUserBatting, setIsUserBatting] = useState<boolean>(true); // true = batting, false = bowling
  const [userMoveAnimation, setUserMoveAnimation] = useState<number | null>(null);
  const [aiMoveAnimation, setAiMoveAnimation] = useState<number | null>(null);
  const [ballAnimationState, setBallAnimationState] = useState<"IDLE" | "RESOLVING" | "OUT" | "RUNS">("IDLE");
  const [latestCommentary, setLatestCommentary] = useState<string>("Welcome to the Hand Cricket AI match! You are batting first!");
  const [isCommentaryLoading, setIsCommentaryLoading] = useState<boolean>(false);
  const [aiMatchHistory, setAiMatchHistory] = useState<MatchHistoryItem[]>([]);
  const [aiMatchOver, setAiMatchOver] = useState<boolean>(false);
  const [aiWinnerResult, setAiWinnerResult] = useState<string | null>(null);

  // Tournament States
  const [tournamentState, setTournamentState] = useState<TournamentState>(() => {
    const val = safeLocalStorage.getItem("hc_tournament");
    if (val) {
      try {
        return JSON.parse(val);
      } catch (e) {}
    }
    return {
      isActive: false,
      round: "QUARTERS",
      participants: [],
      matches: { QUARTERS: [], SEMIS: [], FINALS: [] },
      currentMatchId: null,
    };
  });
  const [activeOpponentName, setActiveOpponentName] = useState<string>("Pro Cricket AI");
  const [activeOpponentColor, setActiveOpponentColor] = useState<string>("from-purple-500 to-indigo-500");

  useEffect(() => {
    safeLocalStorage.setItem("hc_tournament", JSON.stringify(tournamentState));
  }, [tournamentState]);

  // Safe non-blocking custom toast state
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);

  const triggerToast = (message: string, type: "error" | "success" | "info" = "error") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Multiplayer States
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [roomCodeInput, setRoomCodeInput] = useState<string>("");
  const [isSearchingMultiplayer, setIsSearchingMultiplayer] = useState<boolean>(false);
  const [multiplayerMatch, setMultiplayerMatch] = useState<ClientMatchState | null>(null);
  const [playersLocked, setPlayersLocked] = useState<string[]>([]);
  const [userSelectedMove, setUserSelectedMove] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInputText, setChatInputText] = useState<string>("");
  const [rematchRequested, setRematchRequested] = useState<Record<string, boolean>>({});

  // Leaderboard data
  const [leaderboardData, setLeaderboardData] = useState<PlayerStats[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingWsRef = useRef<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<GameMode>(mode);

  useEffect(() => {
    safeLocalStorage.setItem("hc_username", username);
  }, [username]);

  // Load Leaderboard data
  const fetchLeaderboard = async () => {
    setIsLeaderboardLoading(true);
    try {
      const res = await fetch(apiUrl("/api/leaderboard"));
      if (res.ok) {
        const data = await res.json();
        setLeaderboardData(data);
      }
    } catch (e) {
      console.error("Failed to load leaderboard database:", e);
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    AdMobInstance.initialize();
    initAuth().catch(() => {});
  }, []);

  // Keep a ref of the current screen so the hardware back handler is never stale.
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Android hardware back button: leave match / go to lobby / exit at root.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    CapacitorApp.addListener("backButton", () => {
      const current = modeRef.current;
      if (current === GameMode.MULTIPLAYER_MATCH) {
        handleLeaveMultiplayerGame();
      } else if (current !== GameMode.MENU) {
        SoundEffects.playClick();
        setMode(GameMode.MENU);
      } else {
        CapacitorApp.exitApp();
      }
    })
      .then((s) => {
        sub = s;
      })
      .catch(() => {});
    return () => sub?.remove();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const { idToken } = await googleSignIn();
      const res = await fetch(apiUrl("/api/auth/google"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error("Server rejected sign-in");
      const data = await res.json();
      setUserId(data.userId);
      safeLocalStorage.setItem("hc_userid", data.userId);
      if (data.username) setUsername(data.username);
      if (data.avatarColor) setAvatarColor(data.avatarColor);
      if (typeof data.rating === "number") setUserRating(data.rating);
      safeLocalStorage.setItem("hc_google_signed_in", "1");
      setIsSignedIn(true);
      triggerToast("Signed in! Your progress is now saved to your Google account.", "success");
      fetchLeaderboard();
    } catch (e: any) {
      console.error("Google sign-in failed:", e);
      const msg = (e?.message || e?.errorMessage || e?.code || String(e) || "unknown").toString();
      triggerToast(`Sign-in failed: ${msg}`.slice(0, 180), "error");
    }
  };

  const handleGoogleSignOut = async () => {
    await googleSignOut();
    safeLocalStorage.removeItem("hc_google_signed_in");
    setIsSignedIn(false);
    triggerToast("Signed out.", "success");
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteAccount = async () => {
    try {
      await fetch(apiUrl("/api/auth/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch (e) {
      console.warn("Account deletion request failed:", e);
    }
    try {
      await googleSignOut();
    } catch {
      // already signed out
    }
    [
      "hc_username",
      "hc_google_signed_in",
      "hc_coins",
      "hc_wins",
      "hc_matches",
      "hc_highscore",
      "hc_rating",
      "hc_daily_collect",
      "hc_tournament",
    ].forEach((k) => safeLocalStorage.removeItem(k));

    const newId = `u_${Math.random().toString(36).substring(2, 11)}`;
    safeLocalStorage.setItem("hc_userid", newId);
    setUserId(newId);
    setUsername(`Player_${Math.floor(1000 + Math.random() * 9000)}`);
    setIsSignedIn(false);
    setCoins(2450);
    setUserWins(0);
    setUserMatches(0);
    setHighScore(0);
    setUserRating(1000);
    setDailyCollectCount(0);
    setConfirmDelete(false);
    triggerToast("Your account and data have been deleted.", "success");
    setMode(GameMode.MENU);
  };

  useEffect(() => {
    if (mode === GameMode.LEADERBOARD) {
      fetchLeaderboard();
    }
  }, [mode]);

  // WebSocket Connection Handler
  const connectWebSocket = () => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return wsRef.current;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch (e) {
      console.warn("WebSocket initialization blocked or restricted in sandbox/iframe:", e);
      triggerToast("Multiplayer connection failed. Try opening the app in a new tab!", "error");
      return null;
    }

    ws.onopen = () => {
      console.log("WebSocket connection established");
      // Register player first, then flush any actions queued while connecting.
      ws.send(
        JSON.stringify({
          type: "REGISTER_USER",
          payload: { userId, username, avatarColor },
        })
      );
      const pending = pendingWsRef.current;
      pendingWsRef.current = [];
      pending.forEach((m) => ws.send(m));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const { type, payload } = message;

      switch (type) {
        case "USER_REGISTERED":
          console.log("User successfully registered on server room.");
          break;

        case "ROOM_CREATED":
          setActiveRoomId(payload.roomId);
          setIsSearchingMultiplayer(false);
          setMultiplayerMatch(payload.matchState);
          setMode(GameMode.MULTIPLAYER_MATCH);
          setChatMessages([]);
          setRematchRequested({});
          SoundEffects.playClick();
          break;

        case "WAITING_FOR_OPPONENT":
          setIsSearchingMultiplayer(true);
          break;

        case "MATCH_STARTED":
          setMultiplayerMatch(payload.matchState);
          setIsSearchingMultiplayer(false);
          setMode(GameMode.MULTIPLAYER_MATCH);
          setLatestCommentary(payload.commentary || "Let the multiplayer begin!");
          setUserSelectedMove(null);
          setPlayersLocked([]);
          setRematchRequested({});
          SoundEffects.playMatchWon();
          break;

        case "PLAYER_LOCKED":
          setPlayersLocked(payload.playersLocked || []);
          break;

        case "BALL_RESOLVED": {
          SoundEffects.playBallRun(payload.runs);
          const oldMatch = multiplayerMatch;
          setMultiplayerMatch(payload.matchState);
          setUserSelectedMove(null);
          setPlayersLocked([]);

          // Animation trigger on resolved ball
          const activeBatsmanId = payload.matchState.players[payload.matchState.batsmanIndex]?.id;
          const userIsBatsman = activeBatsmanId === userId;
          const userM = userIsBatsman ? payload.batsmanMove : payload.bowlerMove;
          const oppM = userIsBatsman ? payload.bowlerMove : payload.batsmanMove;

          setUserMoveAnimation(userM);
          setAiMoveAnimation(oppM);
          setBallAnimationState(payload.isOut ? "OUT" : "RUNS");
          setLatestCommentary(payload.commentary);

          setTimeout(() => {
            setBallAnimationState("IDLE");
            setUserMoveAnimation(null);
            setAiMoveAnimation(null);
          }, 3500);
          break;
        }

        case "INNINGS_COMPLETE": {
          SoundEffects.playWicketOut();
          setMultiplayerMatch(payload.matchState);
          setUserSelectedMove(null);
          setPlayersLocked([]);
          setLatestCommentary(payload.commentary);
          break;
        }

        case "MATCH_FINISHED": {
          const isWinner = payload.winnerId === userId;
          if (isWinner) {
            SoundEffects.playMatchWon();
            confetti({
              particleCount: 150,
              spread: 80,
              origin: { y: 0.6 },
            });
          } else {
            SoundEffects.playWicketOut();
          }

          setMultiplayerMatch(payload.matchState);
          setUserSelectedMove(null);
          setPlayersLocked([]);
          setLatestCommentary(payload.commentary);
          break;
        }

        case "CHAT_MESSAGE": {
          const newChat: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            senderId: payload.senderId,
            senderName: payload.senderName,
            text: payload.text,
            emoji: payload.emoji,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setChatMessages((prev) => [...prev, newChat]);
          // Scroll chat box
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 50);
          break;
        }

        case "REMATCH_STATUS":
          setRematchRequested(payload.rematchRequested || {});
          break;

        case "PLAYER_LEFT":
          SoundEffects.playWicketOut();
          setMultiplayerMatch(payload.matchState);
          setLatestCommentary(payload.commentary || "Opponent forfeited.");
          break;

        case "ERROR":
          triggerToast(payload.message || "An occurred connection issue.");
          setIsSearchingMultiplayer(false);
          break;
      }
    };

    ws.onclose = () => {
      console.log("Websocket socket severed.");
      setIsSearchingMultiplayer(false);
    };

    ws.onerror = (err) => {
      console.warn("WebSocket connection encountered an error:", err);
      setIsSearchingMultiplayer(false);
    };

    wsRef.current = ws;
    return ws;
  };

  const handleMuteToggle = () => {
    SoundEffects.isMuted = !isAudioMuted;
    setIsAudioMuted(!isAudioMuted);
  };

  // Generate Live Commentary for AI Match
  const generateAICommentary = async (
    eventType: "OUT" | "RUNS" | "WIN" | "START",
    score: number,
    uMove: number | null,
    cMove: number | null,
    matchContext: string
  ) => {
    setIsCommentaryLoading(true);
    try {
      const res = await fetch(apiUrl("/api/commentary"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          score,
          batsmanMove: isUserBatting ? uMove : cMove,
          bowlerMove: isUserBatting ? cMove : uMove,
          matchStateText: matchContext,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLatestCommentary(data.text);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCommentaryLoading(false);
    }
  };

  // Run AI MATCH Setup
  const handleStartAIMatch = (overs: number) => {
    setMaxOversSelected(overs);
    setAiInnings(1);
    setAiScore(0);
    setAiTarget(null);
    setAiWickets(0);
    setAiOvers("0.0");
    setBallsCount(0);
    setIsUserBatting(true); // User bats first
    setAiMatchHistory([]);
    setAiMatchOver(false);
    setAiWinnerResult(null);
    setLatestCommentary("The stadium is packed! You take the crease with the bat. Best of luck!");
    setMode(GameMode.AI_MATCH);
    SoundEffects.playClick();
  };

  // Start tournament or pay entry
  const handleStartTournament = () => {
    if (coins < 100) {
      triggerToast("You need 100 Coins to enter the Tournament! Go watch an ad or claim your daily coins!");
      return;
    }
    SoundEffects.playClick();
    setCoins((prev) => prev - 100);

    const botOpponents: TournamentParticipant[] = [
      { id: "bot_1", username: "Master_Blaster", avatarColor: "from-sky-400 to-blue-500", isBot: true, rating: 1450 },
      { id: "bot_2", username: "Cricket_King", avatarColor: "from-amber-400 to-orange-500", isBot: true, rating: 1320 },
      { id: "bot_3", username: "MSD_Finisher", avatarColor: "from-emerald-400 to-teal-500", isBot: true, rating: 1280 },
      { id: "bot_4", username: "Spin_Wizard", avatarColor: "from-purple-400 to-indigo-500", isBot: true, rating: 1190 },
      { id: "bot_5", username: "Gilly_Glove", avatarColor: "from-pink-400 to-rose-500", isBot: true, rating: 1090 },
      { id: "bot_6", username: "Rawalpindi_Express", avatarColor: "from-red-500 to-orange-600", isBot: true, rating: 1210 },
      { id: "bot_7", username: "Boom_Boom", avatarColor: "from-teal-400 to-emerald-600", isBot: true, rating: 1150 }
    ];

    const me: TournamentParticipant = {
      id: userId,
      username: username,
      avatarColor: avatarColor,
      isBot: false,
      rating: 1000
    };

    const participants = [me, ...botOpponents];

    // Build Quarter-Final Matches
    const quarters: TournamentMatch[] = [
      { id: "q1", p1: me, p2: botOpponents[0], status: "PENDING" },
      { id: "q2", p1: botOpponents[1], p2: botOpponents[2], status: "PENDING" },
      { id: "q3", p1: botOpponents[3], p2: botOpponents[4], status: "PENDING" },
      { id: "q4", p1: botOpponents[5], p2: botOpponents[6], status: "PENDING" }
    ];

    setTournamentState({
      isActive: true,
      round: "QUARTERS",
      participants,
      matches: {
        QUARTERS: quarters,
        SEMIS: [],
        FINALS: []
      },
      currentMatchId: "q1",
    });

    setMode(GameMode.TOURNAMENT_LOBBY);
  };

  // Launch currently assigned tournament match
  const handlePlayTournamentMatch = () => {
    SoundEffects.playClick();
    const round = tournamentState.round;
    if (round === "CHAMPION") return;

    let activeRoundMatches = tournamentState.matches[round];
    let userMatch = activeRoundMatches.find((m) => m.p1.id === userId || m.p2.id === userId);
    if (!userMatch) return;

    const opponent = userMatch.p1.id === userId ? userMatch.p2 : userMatch.p1;
    setActiveOpponentName(opponent.username);
    setActiveOpponentColor(opponent.avatarColor);

    // Increase difficulty progressively!
    let difficulty: "EASY" | "MEDIUM" | "HARD" = "EASY";
    if (round === "SEMIS") difficulty = "MEDIUM";
    if (round === "FINALS") difficulty = "HARD";
    setAiDifficulty(difficulty);

    // Initialize the AI match settings
    setMaxOversSelected(2); // Tournament match is standard fast 2 Overs
    setAiInnings(1);
    setAiScore(0);
    setAiTarget(null);
    setAiWickets(0);
    setAiOvers("0.0");
    setBallsCount(0);
    setIsUserBatting(true); // User bats first
    setAiMatchHistory([]);
    setAiMatchOver(false);
    setAiWinnerResult(null);
    setLatestCommentary(`Championship ${round} arena! You are facing up against ${opponent.username}. Can you hold your nerves?`);

    setMode(GameMode.AI_MATCH);
  };

  const resolveOtherTournamentMatches = (round: "QUARTERS" | "SEMIS" | "FINALS", currentMatches: TournamentMatch[]): TournamentMatch[] => {
    return currentMatches.map((m) => {
      if (m.status === "COMPLETED") return m;
      if (m.p1.id === userId || m.p2.id === userId) return m; // don't auto-resolve user's main active matches

      // Simulate based on rating with subtle variance
      const p1Rating = m.p1.rating || 1000;
      const p2Rating = m.p2.rating || 1000;
      const total = p1Rating + p2Rating;
      const p1WinProb = p1Rating / total;
      const p1Won = Math.random() < p1WinProb;

      const p1Score = Math.floor(15 + Math.random() * 20);
      const p2Score = p1Won
        ? Math.floor(Math.max(2, p1Score - 1 - Math.floor(Math.random() * 6)))
        : Math.floor(p1Score + 1 + Math.floor(Math.random() * 4));

      return {
        ...m,
        p1Score,
        p2Score,
        winnerId: p1Won ? m.p1.id : m.p2.id,
        status: "COMPLETED" as const,
      };
    });
  };

  // Complete/Record the Active tournament match
  const handleTournamentAdvance = () => {
    SoundEffects.playClick();
    const round = tournamentState.round;
    if (round === "CHAMPION" || !tournamentState.currentMatchId) return;

    let activeRoundMatches = [...tournamentState.matches[round]];
    let userMatchIdx = activeRoundMatches.findIndex((m) => m.p1.id === userId || m.p2.id === userId);
    if (userMatchIdx === -1) return;

    const userMatch = activeRoundMatches[userMatchIdx];
    const opponent = userMatch.p1.id === userId ? userMatch.p2 : userMatch.p1;

    // Build the completed user scorecard
    const finalUserScore = isUserBatting ? aiTarget ? aiTarget - 1 : aiScore : aiTarget || 0;
    const finalOpponentScore = isUserBatting ? aiScore : aiTarget ? aiTarget - 1 : aiScore;

    const updatedUserMatch: TournamentMatch = {
      ...userMatch,
      p1Score: userMatch.p1.id === userId ? finalUserScore : finalOpponentScore,
      p2Score: userMatch.p2.id === userId ? finalUserScore : finalOpponentScore,
      winnerId: aiWinnerResult === "PLAYER_WIN" ? userId : opponent.id,
      status: "COMPLETED" as const,
    };

    activeRoundMatches[userMatchIdx] = updatedUserMatch;

    // Resolve other matches in the bracket loop
    const resolvedMatches = resolveOtherTournamentMatches(round, activeRoundMatches);

    // Save and prepare next rounds
    if (aiWinnerResult === "PLAYER_WIN") {
      if (round === "QUARTERS") {
        // Collect winners of q1, q2, q3, q4
        const w1 = updatedUserMatch.p1.id === userId ? updatedUserMatch.p1 : updatedUserMatch.p2; // You
        const w2 = resolvedMatches[1].winnerId === resolvedMatches[1].p1.id ? resolvedMatches[1].p1 : resolvedMatches[1].p2;
        const w3 = resolvedMatches[2].winnerId === resolvedMatches[2].p1.id ? resolvedMatches[2].p1 : resolvedMatches[2].p2;
        const w4 = resolvedMatches[3].winnerId === resolvedMatches[3].p1.id ? resolvedMatches[3].p1 : resolvedMatches[3].p2;

        const semis: TournamentMatch[] = [
          { id: "s1", p1: w1, p2: w2, status: "PENDING" },
          { id: "s2", p1: w3, p2: w4, status: "PENDING" }
        ];

        setTournamentState((prev) => ({
          ...prev,
          round: "SEMIS",
          matches: {
            ...prev.matches,
            QUARTERS: resolvedMatches,
            SEMIS: semis,
          },
          currentMatchId: "s1",
        }));
      } else if (round === "SEMIS") {
        // Collect winners of s1, s2
        const w1 = updatedUserMatch.p1.id === userId ? updatedUserMatch.p1 : updatedUserMatch.p2; // You
        const w2 = resolvedMatches[1].winnerId === resolvedMatches[1].p1.id ? resolvedMatches[1].p1 : resolvedMatches[1].p2;

        const finals: TournamentMatch[] = [
          { id: "f1", p1: w1, p2: w2, status: "PENDING" }
        ];

        setTournamentState((prev) => ({
          ...prev,
          round: "FINALS",
          matches: {
            ...prev.matches,
            SEMIS: resolvedMatches,
            FINALS: finals,
          },
          currentMatchId: "f1",
        }));
      } else if (round === "FINALS") {
        // Champion!
        setTournamentState((prev) => ({
          ...prev,
          round: "CHAMPION",
          matches: {
            ...prev.matches,
            FINALS: resolvedMatches,
          },
          currentMatchId: null,
        }));

        setCoins((prev) => prev + 500); // Grand cup trophy coins
        confetti({ particleCount: 200, spread: 80 });
      }
      setMode(GameMode.TOURNAMENT_LOBBY);
    }
  };

  const handleTournamentRetryCoins = () => {
    if (coins < 100) {
      triggerToast("Insufficient coins! Watch an ad to get 150 coins first!");
      return;
    }
    SoundEffects.playClick();
    setCoins((prev) => prev - 100);
    handlePlayTournamentMatch();
  };

  const handleTournamentRetryAd = () => {
    SoundEffects.playClick();
    AdMobInstance.showRewardedAd(
      () => {
        // Successfully rewarded!
        handlePlayTournamentMatch();
      },
      () => {
        triggerToast("The ad reward fell through. Please try again.");
      }
    );
  };

  // Forfeit/Exit the tournament entirely
  const handleExitTournament = () => {
    SoundEffects.playClick();
    setTournamentState({
      isActive: false,
      round: "QUARTERS",
      participants: [],
      matches: { QUARTERS: [], SEMIS: [], FINALS: [] },
      currentMatchId: null,
    });
    setMode(GameMode.MENU);
  };

  // Hand Cricket Algorithm for AI opponent
  const getAIMoveForMatch = async (currHistory: Array<{ playerMove: number; aiMove: number }>) => {
    try {
      const res = await fetch(apiUrl("/api/ai-move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: currHistory,
          difficulty: aiDifficulty,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.move;
      }
    } catch (e) {
      console.warn("Express AI endpoint error, resolving randomly:", e);
    }
    return Math.floor(Math.random() * 6) + 1;
  };

  // Calculate local user throw against AI
  const handleUserPlayAIMove = async (move: number) => {
    if (ballAnimationState !== "IDLE" || aiMatchOver) return;

    SoundEffects.playClick();
    setUserMoveAnimation(move);

    // Track state of moves
    const recentAIHistory = aiMatchHistory.map((h) => ({
      playerMove: isUserBatting ? h.batsmanMove : h.bowlerMove,
      aiMove: isUserBatting ? h.bowlerMove : h.batsmanMove,
    }));

    const aiPlay = await getAIMoveForMatch(recentAIHistory);
    setAiMoveAnimation(aiPlay);
    setBallAnimationState("RESOLVING");

    // Process play outcome after standard windup animation
    setTimeout(async () => {
      let isOut = move === aiPlay;
      let runs = isOut ? 0 : isUserBatting ? move : aiPlay;

      // Update balls counting
      const totalBalls = ballsCount + 1;
      setBallsCount(totalBalls);
      const remainingBalls = totalBalls % 6;
      const fullOvers = Math.floor(totalBalls / 6);
      const computedOvers = `${fullOvers}.${remainingBalls}`;
      setAiOvers(computedOvers);

      const maxTotalBalls = maxOversSelected * 6;

      if (aiInnings === 1) {
        if (isOut) {
          SoundEffects.playWicketOut();
          setBallAnimationState("OUT");
          // Innings complete
          const targetScore = aiScore + 1;
          setAiTarget(targetScore);
          setAiInnings(2);
          setIsUserBatting(false); // Player bowl now
          setAiScore(0);
          setBallsCount(0);
          setAiOvers("0.0");

          const inningsMsg = `OUT! Sensation on the ground! Caught out on ${move}! AI bowler reads you beautifully. You scored ${aiScore} runs. AI needs ${targetScore} runs to win!`;
          setLatestCommentary(inningsMsg);
          await generateAICommentary("OUT", aiScore, move, aiPlay, `Innings 1 finished. Batsman out! You made ${aiScore} runs.`);

          // Log to history
          setAiMatchHistory((prev) => [
            ...prev,
            { ball: totalBalls, batsmanMove: move, bowlerMove: aiPlay, runs: 0, isOut: true, commText: inningsMsg, innings: aiInnings, userWasBatting: isUserBatting },
          ]);
        } else {
          SoundEffects.playBallRun(runs);
          setBallAnimationState("RUNS");
          const nextScore = aiScore + runs;
          setAiScore(nextScore);

          const runMsg = `Good shot! Shot for ${runs} runs. Batsman choose ${move}, bowler choose ${aiPlay}.`;
          setLatestCommentary(runMsg);

          // Overs validation limit
          if (totalBalls >= maxTotalBalls) {
            const targetScore = nextScore + 1;
            setAiTarget(targetScore);
            setAiInnings(2);
            setIsUserBatting(false); // Player bowls now
            setAiScore(0);
            setBallsCount(0);
            setAiOvers("0.0");
            setLatestCommentary(`Overs completed! You compiled ${nextScore} runs. AI needs ${targetScore} runs to win the cup!`);
          }

          setAiMatchHistory((prev) => [
            ...prev,
            { ball: totalBalls, batsmanMove: move, bowlerMove: aiPlay, runs, isOut: false, commText: runMsg, innings: aiInnings, userWasBatting: isUserBatting },
          ]);
        }
      } else {
        // Second Innings Play Logic
        const targetValue = aiTarget || 1;
        if (isOut) {
          SoundEffects.playWicketOut();
          setBallAnimationState("OUT");
          // AI batsman dismissed! User wins!
          setAiMatchOver(true);
          setAiWinnerResult("PLAYER_WIN");
          const victoryMsg = `VICTORY! You did it! You matched the AI with ${move} and took the critical wicket. Defended ${targetValue - 1} runs!`;
          setLatestCommentary(victoryMsg);
          confetti({
            particleCount: 120,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
          });
          confetti({
            particleCount: 120,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
          });
          SoundEffects.playMatchWon();

          // Save score to local leaderboard persistence!
          updateLeaderboardScore(true, targetValue - 1, 1);

          setAiMatchHistory((prev) => [
            ...prev,
            { ball: totalBalls, batsmanMove: aiPlay, bowlerMove: move, runs: 0, isOut: true, commText: victoryMsg, innings: aiInnings, userWasBatting: isUserBatting },
          ]);
        } else {
          SoundEffects.playBallRun(runs);
          setBallAnimationState("RUNS");
          const nextScore = aiScore + runs;
          setAiScore(nextScore);

          // Check if AI completed target
          if (nextScore >= targetValue) {
            setAiMatchOver(true);
            setAiWinnerResult("AI_WIN");
            const lossMsg = `AI wins the grand match! Chased down the target of ${targetValue} with ease. Better luck next game!`;
            setLatestCommentary(lossMsg);
            updateLeaderboardScore(false, aiTarget ? aiTarget - 1 : 0, 0);

            setAiMatchHistory((prev) => [
              ...prev,
              { ball: totalBalls, batsmanMove: aiPlay, bowlerMove: move, runs, isOut: false, commText: lossMsg, innings: aiInnings, userWasBatting: isUserBatting },
            ]);
          } else if (totalBalls >= maxTotalBalls) {
            // Defended overs limit
            setAiMatchOver(true);
            const userWon = nextScore < targetValue - 1;
            const draw = nextScore === targetValue - 1;

            if (draw) {
              setAiWinnerResult("TIE");
              setLatestCommentary("TIE match! Total epic drama. Scores are hand-locked.");
            } else if (userWon) {
              setAiWinnerResult("PLAYER_WIN");
              setLatestCommentary(`VICTORY! You restricted the AI to ${nextScore} runs over ${maxOversSelected} overs. Outstanding!`);
              confetti({ particleCount: 100 });
              SoundEffects.playMatchWon();
              updateLeaderboardScore(true, targetValue - 1, 0);
            } else {
              setAiWinnerResult("AI_WIN");
              setLatestCommentary(`AI has run out of balls but somehow already scored enough. Wait, that should not happen due to previous logic.`);
            }

            setAiMatchHistory((prev) => [
              ...prev,
              { ball: totalBalls, batsmanMove: aiPlay, bowlerMove: move, runs, isOut: false, commText: "Innings over.", innings: aiInnings, userWasBatting: isUserBatting },
            ]);
          } else {
            // Continuation of play
            const remainingRuns = targetValue - nextScore;
            const liveMsg = `AI batsman plays ${runs} runs. Needs ${remainingRuns} runs from ${maxTotalBalls - totalBalls} balls to win.`;
            setLatestCommentary(liveMsg);

            setAiMatchHistory((prev) => [
              ...prev,
              { ball: totalBalls, batsmanMove: aiPlay, bowlerMove: move, runs, isOut: false, commText: liveMsg, innings: aiInnings, userWasBatting: isUserBatting },
            ]);
          }
        }
      }

      // Reset windup lock
      setTimeout(() => {
        setBallAnimationState("IDLE");
        setUserMoveAnimation(null);
        setAiMoveAnimation(null);
      }, 1800);
    }, 1200);
  };

  // Safe client update statistics back to API database
  const updateLeaderboardScore = async (won: boolean, runs: number, wickets: number) => {
    // Increment local statistics and persist with browser storage
    setUserMatches((prev) => prev + 1);
    if (won) {
      setUserWins((prev) => prev + 1);
      setCoins((prev) => prev + 150); // ELO Win cash injection
    } else {
      setCoins((prev) => prev + 50); // ELO Participation reward
    }

    if (runs > highScore) {
      setHighScore(runs);
    }

    try {
      const scoreRes = await fetch(apiUrl("/api/leaderboard"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          username,
          won,
          runs,
          wickets,
          avatarColor,
          opponentRating: aiDifficulty === "HARD" ? 1300 : aiDifficulty === "MEDIUM" ? 1100 : 900,
        }),
      });
      if (scoreRes.ok) {
        const scoreData = await scoreRes.json();
        if (typeof scoreData.rating === "number") setUserRating(scoreData.rating);
      }
      // Trigger a silent REST payload save on backend
      const res = await fetch(apiUrl("/api/leaderboard"));
      if (res.ok) {
        const board = await res.json();
        setLeaderboardData(board);
      }
    } catch (e) {
      console.warn("REST analytics logging failed, offline sandbox storage fallback activated:", e);
    }
  };

  // Queue-aware sender: guarantees REGISTER_USER goes first and no message is
  // dropped while the socket is still in CONNECTING state.
  const sendWs = (payload: object): boolean => {
    const ws = connectWebSocket();
    if (!ws) return false;
    const msg = JSON.stringify(payload);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    } else {
      pendingWsRef.current.push(msg);
    }
    return true;
  };

  // Multiplayer Actions
  const handleJoinQuickLobby = () => {
    SoundEffects.playClick();
    sendWs({ type: "JOIN_QUICK_MATCH" });
  };

  const handleCancelQuickMatch = () => {
    SoundEffects.playClick();
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "CANCEL_QUICK_MATCH" }));
    }
    setIsSearchingMultiplayer(false);
  };

  const handleCreatePrivateRoom = () => {
    SoundEffects.playClick();
    sendWs({ type: "CREATE_PRIVATE_ROOM", payload: { maxOvers: 2 } });
  };

  const handleJoinPrivateRoom = () => {
    if (!roomCodeInput.trim()) {
      triggerToast("Please specify a valid code.");
      return;
    }
    SoundEffects.playClick();
    sendWs({ type: "JOIN_ROOM", payload: { roomId: roomCodeInput.trim().toUpperCase() } });
  };

  const handlePlayMultiplayerMove = (move: number) => {
    if (userSelectedMove !== null) return;
    setUserSelectedMove(move);
    SoundEffects.playClick();
    sendWs({ type: "PLAY_HAND", payload: { move } });
  };

  const handleSendChatText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() || !wsRef.current) return;

    wsRef.current.send(
      JSON.stringify({
        type: "SEND_CHAT",
        payload: { text: chatInputText },
      })
    );
    setChatInputText("");
  };

  const handlePlayChatPreset = (presetText: string, emoji: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: "SEND_CHAT",
        payload: { text: presetText, emoji },
      })
    );
    SoundEffects.playClick();
  };

  const handleRequestRematch = () => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "REQUEST_REMATCH" }));
    SoundEffects.playClick();
  };

  const handleLeaveMultiplayerGame = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "LEAVE_ROOM" }));
    }
    setMultiplayerMatch(null);
    setUserSelectedMove(null);
    setPlayersLocked([]);
    setMode(GameMode.MENU);
    SoundEffects.playClick();
  };

  // Get gesture emojis mapping for fingers representation
  const getHandGesture = (val: number | null) => {
    switch (val) {
      case 1:
        return "☝️";
      case 2:
        return "✌️";
      case 3:
        return "🤟";
      case 4:
        return "🖖";
      case 5:
        return "🖐️";
      case 6:
        return "✊"; // Fist represents sixer
      default:
        return "❓";
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f7fd] text-slate-900 flex flex-col justify-between font-sans selection:bg-emerald-600 selection:text-white">
      {/* Dynamic Custom Safe Toast/Banner Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            className="fixed top-4 inset-x-0 z-[150] px-4 flex justify-center pointer-events-none"
          >
            <div className={`pointer-events-auto w-full max-w-sm p-4 rounded-2xl shadow-xl border flex items-start gap-3 backdrop-blur-md ${
              toast.type === "error"
                ? "bg-red-50/95 border-red-200 text-red-900"
                : toast.type === "success"
                ? "bg-emerald-50/95 border-emerald-250 text-emerald-950"
                : "bg-blue-50/95 border-blue-200 text-blue-900"
            }`}>
              <div className="flex-shrink-0 text-base mt-0.5">
                {toast.type === "error" ? "⚠️" : toast.type === "success" ? "✅" : "ℹ️"}
              </div>
              <div className="flex-1 min-w-0 text-xs font-semibold leading-relaxed break-words">
                {toast.message}
              </div>
              <button
                onClick={() => setToast(null)}
                className="flex-shrink-0 text-slate-400 hover:text-slate-700 text-xs font-mono font-bold p-0.5 ml-2 cursor-pointer transition"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stadium Turf Luxury Header */}
      <header className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 border-b-4 border-yellow-500 sticky top-0 z-50 py-3 px-4 md:px-6 shadow-xl shadow-emerald-905/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => {
              SoundEffects.playClick();
              setMode(GameMode.MENU);
            }}
            className="flex items-center gap-3 text-left group"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-yellow-400 to-amber-500 flex items-center justify-center text-xl shadow-lg transition duration-300 group-hover:rotate-12 group-hover:scale-105">
              🏏
            </div>
            <div>
              <h1 className="text-md md:text-lg font-display font-black tracking-tight text-white flex items-center gap-1.5 leading-none">
                HAND CRICKET
                <span className="bg-yellow-400 text-emerald-950 px-2 py-0.5 rounded-full text-[9px] font-mono font-extrabold tracking-widest uppercase">
                  PRO
                </span>
              </h1>
              <p className="text-[10px] text-emerald-100/70 font-mono tracking-wide">Stadium Edition • Rising Champions Arena</p>
            </div>
          </button>

          {/* Luxury stats scoreboard pills */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl px-3 py-1.5 flex items-center gap-2 text-xs text-white">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <span className="font-mono font-extrabold text-yellow-300">{coins.toLocaleString()}</span>
              <span className="text-[9px] text-emerald-100 font-mono hidden sm:inline uppercase">Coins</span>
            </div>

            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-2xl px-3 py-1.5 hidden sm:flex items-center gap-2 text-xs text-white">
              <Trophy className="w-3.5 h-3.5 text-yellow-300" />
              <span className="font-mono font-extrabold text-white">{userRating}</span>
              <span className="text-[9px] text-emerald-100 font-mono uppercase">ELO</span>
            </div>

            {/* Mute toggle / Return home buttons */}
            <div className="flex items-center gap-2 border-l border-emerald-700/55 pl-2 md:pl-4">
              <button
                onClick={handleMuteToggle}
                className="p-2 rounded-xl border border-emerald-700/10 bg-emerald-950/20 hover:bg-emerald-950/50 text-white transition shadow-sm"
                title={isAudioMuted ? "Unmute" : "Mute Sound"}
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-yellow-400" />}
              </button>

              {mode !== GameMode.MENU && (
                <button
                  onClick={() => {
                    SoundEffects.playClick();
                    if (mode === GameMode.MULTIPLAYER_MATCH) {
                      handleLeaveMultiplayerGame();
                    } else {
                      setMode(GameMode.MENU);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-yellow-500/20 bg-yellow-400 hover:bg-yellow-350 text-slate-950 text-xs font-black flex items-center gap-1 transition"
                >
                  <Home className="w-3.5 h-3.5" />
                  Lobby
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Primary Board Stage */}
      <main className="flex-grow p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-6xl">
          <AnimatePresence mode="wait">
            {/* 1. LOBBY / MAIN MENU */}
            {mode === GameMode.MENU && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="max-w-md md:max-w-xl mx-auto w-full flex flex-col justify-between"
              >
                {/* 1. TOP PLAYER PASSPORT CARD */}
                <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xl mb-4 space-y-4">
                  <div className="flex items-center justify-between text-left">
                    <button
                      onClick={() => {
                        SoundEffects.playClick();
                        setMode(GameMode.PROFILE);
                      }}
                      className="flex items-center gap-3 text-left group cursor-pointer"
                    >
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-tr ${avatarColor} flex-shrink-0 border-2 border-slate-105 shadow-md flex items-center justify-center text-lg`}>
                        🏏
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block font-sans">Tap to edit profile</span>
                        <h3 className="text-md font-display font-black text-slate-800 leading-none flex items-center gap-1.5 mt-0.5">
                          {username}
                          <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-emerald-600 transition" />
                        </h3>
                      </div>
                    </button>
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 font-bold block font-sans">Coins Balance</span>
                      <span className="text-sm font-mono font-black text-emerald-800 flex items-center gap-1 justify-end">
                        🪙 {coins.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-150 text-center font-sans">
                    <div>
                      <span className="text-[8px] font-mono font-bold text-slate-400 block uppercase">ELO Rating</span>
                      <span className="text-xs font-mono font-black text-amber-600 block">{userRating} ELO</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-mono font-bold text-slate-400 block uppercase">Total Plays</span>
                      <span className="text-xs font-mono font-black text-slate-800 block">{userMatches} Played</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-mono font-bold text-slate-400 block uppercase">Wins Counter</span>
                      <span className="text-xs font-mono font-black text-emerald-700 block">{userWins} Match Wins</span>
                    </div>
                  </div>
                </div>

                {/* 2. DYNAMIC SINGLE-SCREEN CONTENT (BASED ON ACTIVE TAB) */}
                <AnimatePresence mode="wait">
                  {lobbyTab === "play" && (
                    <motion.div
                      key="play-tab"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-gradient-to-tr from-emerald-800 via-emerald-700 to-green-600 text-white rounded-3xl p-6 relative overflow-hidden shadow-xl border border-emerald-600/30 min-h-[300px] flex flex-col justify-between"
                    >
                      {/* Grid overlay design effect resembling pitch marking lines */}
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0c_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0c_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-35 pointer-events-none" />
                      
                      <div className="z-10 space-y-4 text-left">
                        <div className="inline-flex gap-2 p-1 bg-white/10 border border-white/20 rounded-full text-[9px] font-mono font-bold text-emerald-100 px-2.5 uppercase tracking-wider">
                          <Sparkles className="w-2.5 h-2.5 text-yellow-300 animate-pulse" />
                          Neural Bot Engine
                        </div>
                        <div className="space-y-1.5 font-sans">
                          <h3 className="text-xl font-display font-black tracking-tight text-white leading-tight">
                            AI Practice Single Arena
                          </h3>
                          <p className="text-[12px] text-emerald-100/90 leading-relaxed">
                            Practice your prediction skills against our adaptive chess-like bot. Outsmart real-time commentary algorithms over custom overs!
                          </p>
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <span className="text-[10px] font-mono font-bold text-emerald-200 uppercase">Difficulty level:</span>
                          <div className="flex gap-1 bg-emerald-950/40 p-0.5 border border-white/10 rounded-xl">
                            {(["EASY", "MEDIUM", "HARD"] as const).map((diff) => (
                              <button
                                key={diff}
                                onClick={() => {
                                  SoundEffects.playClick();
                                  setAiDifficulty(diff);
                                }}
                                className={`px-3 py-1 text-[9px] font-bold rounded-lg font-mono transition cursor-pointer ${
                                  aiDifficulty === diff
                                    ? "bg-yellow-405 text-slate-950 border border-yellow-300/20"
                                    : "text-emerald-200 hover:text-white"
                                }`}
                              >
                                {diff}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 z-10 pt-4 border-t border-white/15 mt-5 font-sans">
                        <button
                          onClick={() => handleStartAIMatch(2)}
                          className="py-3 rounded-2xl text-center text-xs font-black bg-white text-emerald-900 hover:bg-slate-100 active:scale-97 flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-emerald-800 text-emerald-800" /> Start 2 Overs
                        </button>
                        <button
                          onClick={() => handleStartAIMatch(5)}
                          className="py-3 rounded-2xl text-center text-xs font-black border border-white/25 hover:bg-white/10 active:scale-97 text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          Start 5 Overs
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {lobbyTab === "tournament" && (
                    <motion.div
                      key="tournament-tab"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className={`rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[300px] shadow-xl border transition-all ${
                        tournamentState.isActive 
                          ? "bg-gradient-to-tr from-amber-50 to-orange-50 border-amber-300"
                          : "bg-white border-slate-150"
                      }`}
                    >
                      <div className="z-10 space-y-4 text-left">
                        <div className="inline-flex gap-2 p-1 bg-amber-100 border border-amber-300 rounded-full text-[9px] font-mono font-bold text-amber-800 px-2.5 uppercase tracking-wider">
                          🏆 GRAND CUP
                        </div>
                        
                        <div className="space-y-1.5 font-sans">
                          <h3 className="text-xl font-display font-black tracking-tight text-slate-900 leading-tight">
                            Championship Cup
                          </h3>
                          <p className="text-[12px] text-slate-600 leading-relaxed select-none">
                            Conquer three progressive matches in an 8-player bracket to claim the legendary gold Cup Trophy!
                          </p>
                        </div>

                        {tournamentState.isActive ? (
                          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-250 font-sans">
                            <span className="text-[8.5px] text-slate-500 font-mono block uppercase font-bold">ACTIVE RUN MATCH</span>
                            <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                              ⚡ Round of: {tournamentState.round === "CHAMPION" ? "Winner" : tournamentState.round}
                            </span>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150 flex items-center justify-between font-sans">
                            <div>
                              <span className="text-[8.5px] text-slate-500 font-mono block uppercase leading-none font-bold">Entry Ticket</span>
                              <span className="text-xs font-extrabold text-amber-600 font-mono">100 coins</span>
                            </div>
                            <span className="text-[10px] text-emerald-800 font-mono font-black">Win Prize: +500 Gold Coins</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-150 z-10 mt-5 font-sans">
                        {tournamentState.isActive ? (
                          <button
                            onClick={() => {
                              SoundEffects.playClick();
                              setMode(GameMode.TOURNAMENT_LOBBY);
                            }}
                            className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-97 text-white text-xs font-black flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
                          >
                            🏆 Resume Cup Bracket
                          </button>
                        ) : (
                          <button
                            onClick={handleStartTournament}
                            className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-97 text-white text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            🏅 Enter Championship Cup (100 Coins)
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {lobbyTab === "multiplayer" && (
                    <motion.div
                      key="multiplayer-tab"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-white border border-slate-150 rounded-3xl p-6 flex flex-col justify-between shadow-xl min-h-[300px]"
                    >
                      <div className="space-y-4 text-left">
                        <span className="text-[10px] font-mono font-bold text-purple-700 uppercase tracking-widest block">Live Pro Matchmaking lounge</span>
                        
                        <div className="space-y-1 font-sans">
                          <h3 className="text-xl font-display font-black text-slate-900 tracking-tight leading-none">
                            Host or Enter Rooms
                          </h3>
                          <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                            Play server-authoritative matches with other players in real-time. Share room code with friends!
                          </p>
                        </div>
                        
                        {isSearchingMultiplayer ? (
                          <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col items-center space-y-3 font-mono">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-ping" />
                              <span className="text-[11px] text-purple-900 font-bold">Lobby searching...</span>
                            </div>
                            <button
                              onClick={handleCancelQuickMatch}
                              className="px-4 py-1.5 bg-white text-red-650 border border-red-200 rounded-xl text-[10px] font-bold hover:bg-red-50 transition active:scale-95 cursor-pointer"
                            >
                              Cancel Matchmaker
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3 pt-2 font-sans">
                            <button
                              onClick={handleJoinQuickLobby}
                              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-800 hover:to-teal-700 active:scale-97 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
                            >
                              <Zap className="w-3.5 h-3.5 fill-white text-yellow-350 animate-bounce" /> Live Quick Match Finder
                            </button>

                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="ROOM CODE..."
                                maxLength={7}
                                value={roomCodeInput}
                                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                                className="bg-slate-50 border border-slate-200 rounded-2xl px-3 text-xs text-center text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:border-purple-600 w-1/2 transition font-bold"
                              />
                              <button
                                onClick={handleJoinPrivateRoom}
                                className="w-1/2 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-705 transition active:scale-95 cursor-pointer"
                              >
                                Join Code Room
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-100 mt-5 font-sans">
                        <button
                          onClick={handleCreatePrivateRoom}
                          disabled={isSearchingMultiplayer}
                          className="w-full py-2.5 rounded-2xl text-center border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-650 transition disabled:opacity-50 cursor-pointer active:scale-95"
                        >
                          Host Custom Private Match Room
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {lobbyTab === "leaderboard" && (
                    <motion.div
                      key="leaderboard-tab"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-white border border-slate-150 rounded-3xl p-5 flex flex-col justify-between shadow-xl min-h-[300px]"
                    >
                      <div className="space-y-3.5 text-left font-sans">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-display font-black text-slate-800 uppercase tracking-widest">Global Ranks Snapshot</span>
                          </div>
                          <button
                            onClick={fetchLeaderboard}
                            disabled={isLeaderboardLoading}
                            className="p-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 transition cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLeaderboardLoading ? "animate-spin text-emerald-700" : ""}`} />
                          </button>
                        </div>

                        <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                          {isLeaderboardLoading ? (
                            <div className="py-10 text-center text-slate-400 font-mono text-xs animate-pulse">
                              Retrieving master ledgers...
                            </div>
                          ) : leaderboardData.length === 0 ? (
                            <div className="py-10 text-center text-slate-400 font-mono text-xs italic">
                              Registering indexers...
                            </div>
                          ) : (
                            leaderboardData.slice(0, 5).map((player, idx) => (
                              <div
                                key={player.userId}
                                className={`flex items-center justify-between p-2 rounded-2xl border text-xs transition ${
                                  player.userId === userId 
                                    ? "bg-yellow-50/20 border-yellow-300 shadow-sm"
                                    : "bg-slate-50 border-slate-100"
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-lg flex items-center justify-center font-mono font-extrabold text-[10px] ${
                                    idx === 0 
                                      ? "bg-amber-100 text-amber-705 border border-amber-300"
                                      : idx === 1 
                                      ? "bg-slate-150 text-slate-700" 
                                      : "bg-orange-105 text-orange-700"
                                  }`}>
                                    #{idx + 1}
                                  </span>
                                  <div className={`w-5 h-5 rounded-full bg-gradient-to-tr ${player.avatarColor || "from-sky-400 to-indigo-500"} flex-shrink-0`} />
                                  <span className="font-extrabold text-slate-700 truncate max-w-[95px]">{player.username}</span>
                                  {player.userId === userId && <span className="text-[7px] bg-emerald-600 text-white font-mono px-1 rounded font-black">YOU</span>}
                                </div>
                                <span className="font-mono text-emerald-800 font-extrabold">{player.rating || 1000} ELO</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-150 mt-4 font-sans">
                        <button
                          onClick={() => {
                            SoundEffects.playClick();
                            setMode(GameMode.LEADERBOARD);
                          }}
                          className="w-full py-2.5 rounded-2xl bg-[#e3ecf5] hover:bg-slate-200 text-emerald-800 font-black text-xs text-center border border-[#d2dfec] transition-colors cursor-pointer"
                        >
                          View Full Global Hall of Fame
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {lobbyTab === "shop" && (
                    <motion.div
                      key="shop-tab"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      className="bg-white border border-slate-150 rounded-3xl p-5 flex flex-col justify-between shadow-xl min-h-[300px]"
                    >
                      <div className="space-y-4 text-left font-sans">
                        <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase tracking-widest block">Daily Rewards & Boosters</span>

                        <button
                          onClick={() => {
                            SoundEffects.playClick();
                            setMode(GameMode.PROFILE);
                          }}
                          className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-black text-xs border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-2"
                        >
                          <User className="w-3.5 h-3.5" /> Open Profile & Account
                        </button>

                        <div className="pt-2">
                          {dailyCollectCount > 0 ? (
                            <div className="space-y-1.5 block">
                              <span className="text-[9px] font-mono font-bold text-slate-400 block uppercase text-center">
                                🎁 DAILY FREE COINS CLAIMED
                              </span>
                              <button
                                onClick={() => {
                                  SoundEffects.playClick();
                                  AdMobInstance.showRewardedAd(
                                    (amount) => { setCoins((prev) => prev + amount); },
                                    () => {}
                                  );
                                }}
                                className="w-full py-2.5 bg-yellow-405 hover:bg-yellow-350 text-slate-950 active:scale-97 text-[11px] font-extrabold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                              >
                                <Zap className="w-3.5 h-3.5 fill-slate-950 text-emerald-950 animate-pulse" /> Watch Video for +150 Coins
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={handleCollectDailyBonus}
                              className="w-full py-2.5 bg-emerald-700 text-white hover:bg-emerald-800 active:scale-97 text-[11px] font-extrabold rounded-xl transition shadow cursor-pointer"
                            >
                              🎁 Collect Today's Free +100 Coins
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 mt-4 font-sans">
                        <button
                          onClick={() => {
                            SoundEffects.playClick();
                            setMode(GameMode.REVENUE_INFO);
                          }}
                          className="w-full py-2 border border-slate-205 hover:bg-slate-50 text-slate-700 active:scale-97 text-[10px] font-extrabold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-700" /> Launch In-Game Economy Sim
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 3. DOCKED BOTTOM NAVIGATION BAR (PROVIDES NATIVE APP NAVIGATION INTEGRATION) */}
                <div className="flex border border-slate-205 bg-white/95 backdrop-blur-md rounded-2xl p-1.5 shadow-lg mt-5 gap-1 justify-around items-center">
                  <button
                    onClick={() => {
                      SoundEffects.playClick();
                      setLobbyTab("play");
                    }}
                    className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                      lobbyTab === "play"
                        ? "bg-emerald-50 text-emerald-850 scale-102 font-black border border-emerald-100/50"
                        : "text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    <Bot className="w-4 h-4 mb-0.5" />
                    <span className="text-[8.5px] font-mono uppercase tracking-wider font-extrabold">Single AI</span>
                  </button>

                  <button
                    onClick={() => {
                      SoundEffects.playClick();
                      setLobbyTab("tournament");
                    }}
                    className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                      lobbyTab === "tournament"
                        ? "bg-amber-50 text-amber-850 scale-102 font-black border border-amber-200/50"
                        : "text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    <Trophy className="w-4 h-4 mb-0.5" />
                    <span className="text-[8.5px] font-mono uppercase tracking-wider font-extrabold">Grand Cup</span>
                  </button>

                  <button
                    onClick={() => {
                      SoundEffects.playClick();
                      setLobbyTab("multiplayer");
                    }}
                    className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                      lobbyTab === "multiplayer"
                        ? "bg-purple-50 text-purple-850 scale-102 font-black border border-purple-100/50"
                        : "text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    <Users className="w-4 h-4 mb-0.5" />
                    <span className="text-[8.5px] font-mono uppercase tracking-wider font-extrabold">Multiplayer</span>
                  </button>

                  <button
                    onClick={() => {
                      SoundEffects.playClick();
                      setLobbyTab("leaderboard");
                    }}
                    className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                      lobbyTab === "leaderboard"
                        ? "bg-blue-50 text-blue-805 scale-102 font-black border border-blue-105/50"
                        : "text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    <Crown className="w-4 h-4 mb-0.5" />
                    <span className="text-[8.5px] font-mono uppercase tracking-wider font-extrabold">Ranks</span>
                  </button>

                  <button
                    onClick={() => {
                      SoundEffects.playClick();
                      setLobbyTab("shop");
                    }}
                    className={`flex-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                      lobbyTab === "shop"
                        ? "bg-yellow-50 text-yellow-800 scale-102 font-black border border-yellow-200/50"
                        : "text-slate-400 hover:text-slate-650"
                    }`}
                  >
                    <Sparkles className="w-4 h-4 mb-0.5" />
                    <span className="text-[8.5px] font-mono uppercase tracking-wider font-extrabold">Skins</span>
                  </button>
                </div>
              </motion.div>
            )}


            {/* 2. AI MATCH INTERFACE */}
            {mode === GameMode.AI_MATCH && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 text-slate-850"
              >
                {/* Left Play Area */}
                <div className="md:col-span-8 bg-white border border-slate-150 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6">
                  {/* Status header bar */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 text-left">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-650 animate-pulse" />
                      <span className="text-xs font-display font-extrabold text-emerald-800 tracking-wider">
                        {tournamentState.isActive
                          ? `🏆 CUP ROUND: ${tournamentState.round} vs ${activeOpponentName}`.toUpperCase()
                          : "VS AI NEURAL ROBOT"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-slate-400 font-bold uppercase">Difficulty:</span>
                      <span className="px-2.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 font-extrabold font-mono">
                        {aiDifficulty}
                      </span>
                    </div>
                  </div>

                  {/* Hands Throw Visualization Stage */}
                  <div className="bg-gradient-to-tr from-emerald-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden shadow-2xl">
                    {/* Retro pitch grid overlays */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-30" />

                    <div className="z-10 w-full flex items-center justify-around">
                      {/* User's Hand */}
                      <div className="text-center space-y-2">
                        <span className="text-[10px] font-mono font-black text-emerald-300 tracking-wider uppercase block">You ({isUserBatting ? "Batting" : "Bowling"})</span>
                        <motion.div
                          key={`user-hand-${userMoveAnimation}-${ballAnimationState}`}
                          initial={{ y: 20, scale: 0.8, opacity: 0 }}
                          animate={{ y: 0, scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 180, damping: 15 }}
                          className="w-20 h-20 rounded-2xl bg-white/10 border-2 border-yellow-405 flex items-center justify-center text-4xl shadow-xl"
                        >
                          {userMoveAnimation !== null ? getHandGesture(userMoveAnimation) : "❔"}
                        </motion.div>
                        <span className="text-xs font-display font-semibold text-emerald-100/90 mt-1 block">
                          {userMoveAnimation !== null ? `Played: ${userMoveAnimation}` : "Choosing..."}
                        </span>
                      </div>

                      {/* VS Divider/Animation Banner */}
                      <div className="flex flex-col items-center justify-center space-y-2">
                        {ballAnimationState === "RESOLVING" ? (
                          <div className="flex flex-col items-center">
                            <span className="text-xs font-bold text-yellow-355 animate-pulse">LOCKING...</span>
                            <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mt-2" />
                          </div>
                        ) : ballAnimationState === "OUT" ? (
                          <motion.div
                            initial={{ scale: 0.5, rotate: -15 }}
                            animate={{ scale: [1, 1.3, 1], rotate: 0 }}
                            className="bg-red-500 text-white border-2 border-red-400 px-4 py-1.5 rounded-full font-display font-black text-xs tracking-wider animate-bounce"
                          >
                            OUT! 💥
                          </motion.div>
                        ) : ballAnimationState === "RUNS" ? (
                          <motion.div
                            initial={{ scale: 0.5 }}
                            animate={{ scale: [1, 1.25, 1] }}
                            className="bg-yellow-400 text-emerald-950 px-4 py-1.5 rounded-full font-mono font-black text-xs shadow-md"
                          >
                            RUNS LOCKED!
                          </motion.div>
                        ) : (
                          <span className="text-slate-100/50 font-black text-lg font-mono">VS</span>
                        )}
                      </div>

                      {/* Computer's Hand */}
                      <div className="text-center space-y-2">
                        <span className="text-[10px] font-mono font-black text-emerald-300 tracking-wider uppercase block">
                          {tournamentState.isActive ? activeOpponentName : "Pro Cricket AI"}
                        </span>
                        <motion.div
                          key={`cpu-hand-${aiMoveAnimation}-${ballAnimationState}`}
                          initial={{ y: 20, scale: 0.8, opacity: 0 }}
                          animate={{ y: 0, scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 180, damping: 15 }}
                          className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-xl border-2 bg-white/10 border-yellow-400"
                        >
                          {aiMoveAnimation !== null ? getHandGesture(aiMoveAnimation) : "🤖"}
                        </motion.div>
                        <span className="text-xs font-display font-semibold text-emerald-100/90 mt-1 block">
                          {aiMoveAnimation !== null ? `Played: ${aiMoveAnimation}` : "Waiting..."}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Elegant live matches commentator screen */}
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 relative min-h-[90px] shadow-sm text-left">
                    <div className="w-10 h-10 rounded-full bg-amber-100/80 border border-amber-300 flex items-center justify-center text-sm font-bold shadow-xs flex-shrink-0">
                      🎙️
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-900">Live AI Commentator</span>
                        {isCommentaryLoading && (
                          <span className="text-[9px] text-amber-600/70 animate-pulse">AI is speaking...</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 italic leading-relaxed">
                        "{latestCommentary}"
                      </p>
                    </div>
                  </div>

                  {/* Play Move Inputs (Digit Pad 1 to 6) */}
                  <div className="space-y-3.5">
                    <label className="text-[11px] font-mono font-black text-emerald-800 tracking-widest uppercase block text-center">
                      CHOOSE THROW NUMBER TO PLAY
                    </label>

                    {aiMatchOver ? (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 text-center space-y-4">
                        <h4 className="text-lg font-black text-emerald-800">
                          {aiWinnerResult === "PLAYER_WIN" ? "🏆 MATCH COMPLETED - YOU WIN!" : aiWinnerResult === "TIE" ? "🤝 MATCH TIED!" : "😭 MATCH PLAYED - OPPONENT WON!"}
                        </h4>
                        <p className="text-xs text-slate-500 font-mono">
                          {tournamentState.isActive
                            ? aiWinnerResult === "PLAYER_WIN"
                              ? "Superb performance! You conquered this bracket round. Advance to see your progress!"
                              : "Oh no! You have been knocked out of the tournament bracket!"
                            : "Outstanding championship cricket. Care to challenge the neural bot processor for another match?"}
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
                          {tournamentState.isActive ? (
                            aiWinnerResult === "PLAYER_WIN" ? (
                              <button
                                onClick={handleTournamentAdvance}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-800 hover:to-teal-700 text-white font-extrabold text-xs shadow transition active:scale-95 cursor-pointer"
                              >
                                🏆 Claim Victory & Advance
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={handleTournamentRetryAd}
                                  className="px-5 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-350 text-slate-950 font-black text-xs transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
                                >
                                  <Zap className="w-3.5 h-3.5 fill-slate-950" /> Watch Ad to Try Again
                                </button>
                                <button
                                  onClick={handleTournamentRetryCoins}
                                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                                >
                                  Retry with 100 Coins
                                </button>
                                <button
                                  onClick={handleExitTournament}
                                  className="px-5 py-2.5 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-650 font-bold text-xs transition cursor-pointer"
                                >
                                  Forfeit Cup
                                </button>
                              </>
                            )
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartAIMatch(maxOversSelected)}
                                className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-850 font-bold text-xs text-white transition active:scale-95 cursor-pointer"
                              >
                                Play Rematch
                              </button>
                              <button
                                onClick={() => {
                                  SoundEffects.playClick();
                                  AdMobInstance.showInterstitialAd(() => {
                                    setMode(GameMode.MENU);
                                  });
                                }}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 font-bold text-xs text-slate-650 transition cursor-pointer active:scale-95"
                              >
                                Return Home
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-6 gap-2">
                        {[1, 2, 3, 4, 5, 6].map((num) => (
                          <button
                            key={num}
                            onClick={() => handleUserPlayAIMove(num)}
                            disabled={ballAnimationState !== "IDLE"}
                            className="bg-white hover:bg-emerald-700 border border-slate-200 text-slate-800 hover:text-white rounded-2xl py-4 flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-800 transition shadow-sm cursor-pointer group"
                          >
                            <span className="text-[20px] font-bold group-hover:scale-110 transition">{getHandGesture(num)}</span>
                            <span className="text-xs font-mono font-extrabold text-slate-450 group-hover:text-white">{num}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Dashboard Scorecard */}
                <div className="md:col-span-4 space-y-5">
                  {/* Scoreboard Widget */}
                  <div className="bg-gradient-to-tr from-emerald-900 via-emerald-850 to-teal-900 border-b-4 border-yellow-500 rounded-3xl p-5 shadow-xl relative overflow-hidden space-y-4 text-white text-left">
                    <div className="absolute top-0 right-0 w-28 h-28 bg-white/5 rounded-full filter blur-xl" />

                    <div className="flex justify-between items-center pb-3 border-b border-white/10">
                      <span className="text-xs font-mono font-bold text-emerald-200 block uppercase">SCOREBOARD</span>
                      <span className="bg-emerald-950 text-yellow-300 border border-emerald-700 text-[10px] font-mono px-2 py-0.5 rounded font-extrabold">
                        Innings {aiInnings}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-emerald-300 font-bold uppercase tracking-wider block">CURRENT RUNS</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-display font-black tracking-tight text-white">{aiScore}</span>
                        <span className="text-xl font-bold text-emerald-305/70 font-mono">/ {aiWickets}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/10">
                      <div>
                        <span className="text-[9px] font-mono text-emerald-205 uppercase block">Overs Complete</span>
                        <span className="text-sm font-mono font-bold text-white">{aiOvers} / {maxOversSelected}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-emerald-205 uppercase block">Run Rate</span>
                        <span className="text-sm font-mono font-bold text-white">
                          {ballsCount > 0 ? ((aiScore / ballsCount) * 6).toFixed(2) : "0.00"}
                        </span>
                      </div>
                    </div>

                    {/* Target needed trigger */}
                    {aiTarget && (
                      <div className="p-3 bg-white/10 border border-white/15 rounded-xl space-y-1 text-center">
                        <span className="text-[10px] font-mono text-yellow-300 font-bold block">TARGET NEEDED</span>
                        <span className="text-md font-bold text-white font-mono">{aiTarget} Runs</span>
                        <span className="text-[10px] text-emerald-100/90 block font-mono">
                          {isUserBatting
                            ? `You need ${aiTarget - aiScore} runs from ${maxOversSelected * 6 - ballsCount} balls`
                            : `AI needs ${aiTarget - aiScore} runs from ${maxOversSelected * 6 - ballsCount} balls`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ball by Ball Checklist */}
                  <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-3.5 text-left">
                    <h4 className="text-xs font-mono font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                      BALL-BY-BALL LOG
                    </h4>

                    {aiMatchHistory.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center font-mono">No balls bowled yet.</p>
                    ) : (
                      <div className="max-h-[190px] overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
                        {aiMatchHistory
                          .slice()
                          .reverse()
                          .map((hist, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100 gap-2.5"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-slate-400 font-bold">I{hist.innings ?? 1}·B{hist.ball}</span>
                                {hist.isOut ? (
                                  <span className="bg-red-100 text-red-700 border border-red-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                                    OUT
                                  </span>
                                ) : (
                                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded font-mono">
                                    +{hist.runs}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 font-semibold">
                                {(hist.userWasBatting ?? isUserBatting) ? "You" : "AI"} ({hist.batsmanMove}) vs {(hist.userWasBatting ?? isUserBatting) ? "AI" : "You"} ({hist.bowlerMove})
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 3. MULTIPLAYER PLAYING ARENA */}
            {mode === GameMode.MULTIPLAYER_MATCH && multiplayerMatch && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 text-slate-850"
              >
                {/* Left Live Game Arena */}
                <div className="md:col-span-8 bg-white border border-slate-150 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-6">
                  {/* Connection / Match Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 text-left">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-555 animate-ping" />
                      <span className="text-xs font-mono font-bold text-slate-500 tracking-wider">
                        PRO ARENA • ROOM ID: <span className="text-emerald-700 text-sm font-extrabold font-mono">{multiplayerMatch.id}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-slate-500 font-bold">
                      <span>Format: {multiplayerMatch.maxOvers} Overs</span>
                    </div>
                  </div>

                  {/* Hands Synchronization State Visual */}
                  <div className="bg-gradient-to-tr from-emerald-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden shadow-2xl">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-30" />

                    {/* Check wait state */}
                    {multiplayerMatch.status === "WAITING" ? (
                      <div className="text-center z-10 py-6 space-y-3">
                        <span className="text-3xl animate-bounce block">⏳</span>
                        <h4 className="text-md font-bold text-white">Waiting for Opponent to Join</h4>
                        <p className="text-xs text-slate-355 max-w-sm">
                          Share the room code <span className="font-bold text-white font-mono bg-white/10 border border-white/20 px-2 py-1 rounded">{multiplayerMatch.id}</span> with a friend to play!
                        </p>
                      </div>
                    ) : (
                      <div className="z-10 w-full flex items-center justify-around">
                        {/* Player 1 Left Stage */}
                        <div className="text-center space-y-2">
                          <span className="text-[10px] font-mono font-black text-emerald-300 tracking-wider uppercase block">
                            {multiplayerMatch.players[0]?.username} ({multiplayerMatch.batsmanIndex === 0 ? "BAT" : "BOWL"})
                          </span>
                          <div
                            className={`w-18 h-18 rounded-2xl bg-white/10 border-2 ${
                              playersLocked.includes(multiplayerMatch.players[0]?.id)
                                ? "border-yellow-400 bg-yellow-450/10"
                                : "border-white/20"
                            } flex items-center justify-center text-4xl shadow-xl relative`}
                          >
                            {ballAnimationState === "IDLE" ? (
                              playersLocked.includes(multiplayerMatch.players[0]?.id) ? "🔒" : "❔"
                            ) : (
                              getHandGesture(
                                multiplayerMatch.batsmanIndex === 0
                                  ? userMoveAnimation // Render mapped animations
                                  : aiMoveAnimation
                              )
                            )}
                          </div>
                          <span className="text-[10px] font-display text-emerald-200 block font-semibold">
                            {playersLocked.includes(multiplayerMatch.players[0]?.id) ? "READY LOCKED" : "DECIDING..."}
                          </span>
                        </div>

                        <div className="text-center space-y-1">
                          {ballAnimationState === "RESOLVING" || ballAnimationState === "IDLE" ? (
                            <span className="text-emerald-300/60 font-black font-mono text-xs">LOCKED VS</span>
                          ) : ballAnimationState === "OUT" ? (
                            <span className="bg-red-550 text-white border border-red-400 text-xs font-display font-black px-3 py-1 rounded-full block animate-bounce">
                              WICKET OUT! 💥
                            </span>
                          ) : (
                            <span className="bg-yellow-400 text-emerald-950 text-xs font-mono font-black px-3 py-1 rounded-full block shadow">
                              RUNS LOCKED!
                            </span>
                          )}
                        </div>

                        {/* Player 2 Right Stage */}
                        <div className="text-center space-y-2">
                          <span className="text-[10px] font-mono font-black text-emerald-300 tracking-wider uppercase block">
                            {multiplayerMatch.players[1]?.username} ({multiplayerMatch.batsmanIndex === 1 ? "BAT" : "BOWL"})
                          </span>
                          <div
                            className={`w-18 h-18 rounded-2xl bg-white/10 border-2 ${
                              playersLocked.includes(multiplayerMatch.players[1]?.id)
                                ? "border-yellow-405 bg-yellow-450/10"
                                : "border-white/20"
                            } flex items-center justify-center text-4xl shadow-xl`}
                          >
                            {ballAnimationState === "IDLE" ? (
                              playersLocked.includes(multiplayerMatch.players[1]?.id) ? "🔒" : "❔"
                            ) : (
                              getHandGesture(
                                multiplayerMatch.batsmanIndex === 1
                                  ? userMoveAnimation
                                  : aiMoveAnimation
                              )
                            )}
                          </div>
                          <span className="text-[10px] font-display text-emerald-250 block font-semibold">
                            {playersLocked.includes(multiplayerMatch.players[1]?.id) ? "READY LOCKED" : "DECIDING..."}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Commentator Board */}
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3 text-left">
                    <span className="text-xl">🎙️</span>
                    <p className="text-xs text-slate-700 italic leading-snug">
                      "{latestCommentary}"
                    </p>
                  </div>

                  {/* Throw pad selector */}
                  <div className="space-y-3.5">
                    <label className="text-[11px] font-mono font-black text-emerald-800 tracking-widest uppercase block text-center">
                      CHOOSE THROW NUMBER TO SEND
                    </label>

                    {multiplayerMatch.status === "FINISHED" ? (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 text-center space-y-4">
                        <span className="text-md font-black text-emerald-800 block">MATCH EVENT FINISHED</span>
                        <div className="text-xs text-slate-500 font-medium">
                          {rematchRequested[userId] ? (
                            <span className="text-emerald-700 animate-pulse font-extrabold text-[11px]">Waiting for opponent to accept rematch...</span>
                          ) : (
                            <span>Do you want to play a rematch with this opponent?</span>
                          )}
                        </div>
                        <div className="flex justify-center gap-2.5">
                          <button
                            onClick={handleRequestRematch}
                            className="bg-emerald-700 hover:bg-emerald-800 px-5 py-2 text-white font-extrabold text-xs rounded-xl transition cursor-pointer active:scale-95"
                          >
                            Rematch Play
                          </button>
                          <button
                            onClick={handleLeaveMultiplayerGame}
                            className="border border-slate-200 bg-white hover:bg-slate-105 px-5 py-2 text-slate-655 font-bold text-xs rounded-xl transition cursor-pointer active:scale-95"
                          >
                            Leave Room
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-6 gap-2">
                        {[1, 2, 3, 4, 5, 6].map((num) => (
                          <button
                            key={num}
                            disabled={userSelectedMove !== null || multiplayerMatch!.status !== "PLAYING"}
                            onClick={() => handlePlayMultiplayerMove(num)}
                            className="bg-white hover:bg-emerald-700 disabled:opacity-50 border border-slate-200 text-slate-800 hover:text-white rounded-2xl py-4 flex flex-col items-center justify-center gap-1 active:scale-95 transition shadow-sm cursor-pointer group"
                          >
                            <span className="text-[20px] font-bold group-hover:scale-110 transition">{getHandGesture(num)}</span>
                            <span className="text-xs font-mono font-extrabold text-slate-455 group-hover:text-white">{num}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side Info, Scores, Chats */}
                <div className="md:col-span-4 flex flex-col justify-between space-y-4">
                  {/* Scores view */}
                  <div className="bg-gradient-to-tr from-emerald-900 via-emerald-850 to-teal-900 text-white border-b-4 border-yellow-500 rounded-3xl p-5 shadow-xl space-y-4 text-left">
                    <div className="flex justify-between items-center pb-3 border-b border-white/10">
                      <span className="text-xs font-mono font-bold text-emerald-205 block uppercase font-black">STADIUM SCORECARD</span>
                      <span className="bg-emerald-950 text-yellow-300 border border-emerald-705 text-[10px] font-mono px-2 py-0.5 rounded font-extrabold">
                        Innings {multiplayerMatch.innings}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] font-mono text-emerald-305 uppercase block font-black">Batting runs</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-display font-black text-white">{multiplayerMatch.score}</span>
                          <span className="text-lg font-bold text-emerald-200/60 font-mono">/ {multiplayerMatch.wickets}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-mono text-emerald-305 block font-bold uppercase">Overs played</span>
                        <span className="text-md font-mono font-black text-white">
                          {multiplayerMatch.overs} / {multiplayerMatch.maxOvers}
                        </span>
                      </div>
                    </div>

                    {multiplayerMatch.innings === 2 && (
                      <div className="p-3 bg-white/10 border border-white/15 rounded-xl text-center text-xs space-y-1">
                        <span className="font-mono text-yellow-300 font-extrabold block">TARGET</span>
                        <span className="font-mono text-md font-bold text-white">{multiplayerMatch.firstInningsRuns + 1} Runs</span>
                        <span className="text-[10px] block text-emerald-100/90 font-mono">
                          Opponent set a limit of {multiplayerMatch.firstInningsRuns} runs!
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Fully integrated real-time text chat */}
                  <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-md flex-grow flex flex-col justify-between h-[280px]">
                    <div className="space-y-2 flex-grow overflow-hidden flex flex-col text-left">
                      <span className="text-[10px] font-mono font-black text-slate-800 uppercase tracking-wider block border-b border-slate-100 pb-2">
                        STADIUM TRASH CHAT
                      </span>

                      {/* Chat Messages flow */}
                      <div className="flex-grow overflow-y-auto space-y-2 pr-1 text-xs">
                        {chatMessages.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 italic">No shouts sent yet. Send a quick taunt!</div>
                        ) : (
                          chatMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`p-2 rounded-xl border ${
                                msg.senderId === userId
                                  ? "bg-emerald-50 border-emerald-100 ml-6 text-right"
                                  : "bg-slate-50 border-slate-100 mr-6 text-left"
                              }`}
                            >
                              <div className="text-[10px] font-extrabold text-emerald-800 block mb-0.5">{msg.senderName}</div>
                              <p className="text-slate-700 leading-relaxed break-words font-sans font-medium">{msg.text}</p>
                            </div>
                          ))
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    </div>

                    {/* Pre-packaged trash words */}
                    <div className="border-t border-slate-100 pt-3 mt-2 grid grid-cols-3 gap-1.5 pb-2">
                      {[
                        { text: "OUT incoming!", icon: "☝️" },
                        { text: "Massive Sixer!", icon: "✊" },
                        { text: "No luck buddy!", icon: "😜" },
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handlePlayChatPreset(preset.text, preset.icon)}
                          className="px-1.5 py-1 text-[9px] font-bold border border-slate-200 hover:border-emerald-600 rounded bg-slate-50 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 transition cursor-pointer"
                        >
                          {preset.icon} {preset.text}
                        </button>
                      ))}
                    </div>

                    {/* Type Message Box */}
                    <form onSubmit={handleSendChatText} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type stadium taunt..."
                        value={chatInputText}
                        onChange={(e) => setChatInputText(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2 flex-grow focus:outline-none focus:border-emerald-600 text-slate-800 font-medium transition"
                      />
                      <button
                        type="submit"
                        className="p-2 bg-emerald-700 hover:bg-emerald-855 rounded-xl text-white active:scale-95 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 4. LEADERBOARD / HALL OF FAME */}
            {mode === GameMode.LEADERBOARD && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="max-w-3xl mx-auto bg-white border border-slate-150 rounded-3xl p-6 md:p-8 shadow-xl space-y-6 text-slate-800"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-5 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center">
                      <Trophy className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black font-display text-slate-900 tracking-tight">Global Hall of Fame</h2>
                      <p className="text-xs text-slate-500 font-medium">Top Hand Cricket players ranked by ELO ratings.</p>
                    </div>
                  </div>

                  <button
                    onClick={fetchLeaderboard}
                    disabled={isLeaderboardLoading}
                    className="p-2 border border-slate-200 hover:border-slate-300 bg-slate-50 rounded-xl text-slate-600 flex items-center justify-center transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLeaderboardLoading ? "animate-spin text-emerald-700" : ""}`} />
                  </button>
                </div>

                {isLeaderboardLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
                    <span className="text-xs text-slate-550 font-mono">Syncing global leaderboard...</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-left">
                    {leaderboardData.map((player, idx) => {
                      const isTop3 = idx < 3;
                      const badgeBg =
                        idx === 0
                          ? "bg-yellow-100 text-yellow-805 border-yellow-300 font-black"
                          : idx === 1
                          ? "bg-slate-100 text-slate-700 border-slate-250 font-black"
                          : idx === 2
                          ? "bg-amber-100 text-amber-805 border-amber-300 font-extrabold"
                          : "bg-slate-50 text-slate-500 border-slate-200";

                      return (
                        <div
                          key={player.userId}
                          className={`p-4 rounded-2xl border bg-white border-slate-100 hover:bg-slate-50/80 transition flex items-center justify-between gap-4 ${
                            player.userId === userId ? "ring-2 ring-yellow-400 border-yellow-405 shadow-md bg-yellow-50/10" : "shadow-xs"
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <span
                              className={`w-7 h-7 rounded-lg border flex items-center justify-center font-mono font-black text-xs shadow-xs flex-shrink-0 ${badgeBg}`}
                            >
                              {idx + 1}
                            </span>

                            {/* Avatar representation */}
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${player.avatarColor || "from-sky-400 to-indigo-500"} flex-shrink-0 shadow-xs`} />

                            <div className="min-w-0">
                              <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5 leading-tight">
                                <span className="truncate">{player.username}</span>
                                {player.userId === userId && (
                                  <span className="text-[8px] bg-yellow-500 font-mono text-emerald-950 px-1.5 py-0.5 rounded font-black uppercase tracking-wider flex-shrink-0">
                                    YOU
                                  </span>
                                )}
                              </h4>
                              <p className="text-[10px] text-slate-450 font-mono weight-bold truncate">
                                {player.wins}W · {player.matchesPlayed} played
                              </p>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <span className="text-sm font-black font-mono text-emerald-800 block leading-none">
                              {player.rating || 1000}
                              <span className="text-[8px] text-slate-400 ml-0.5">ELO</span>
                            </span>
                            <span className="text-[9px] text-slate-450 font-mono block font-semibold whitespace-nowrap mt-1">
                              {player.runsScored} R · {player.wicketsTaken} W
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="text-center pt-2">
                  <button
                    onClick={() => setMode(GameMode.MENU)}
                    className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer active:scale-95"
                  >
                    Return to Lobby
                  </button>
                </div>
              </motion.div>
            )}

            {/* PROFILE SCREEN */}
            {mode === GameMode.PROFILE && (
              <motion.div
                key="profile-screen"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="max-w-md mx-auto w-full space-y-4"
              >
                <div className="bg-white border border-slate-150 rounded-3xl p-6 shadow-xl space-y-5 text-left">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full bg-gradient-to-tr ${avatarColor} border-2 border-slate-100 shadow-md flex items-center justify-center text-2xl flex-shrink-0`}>
                      🏏
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block">Player Profile</span>
                      <h3 className="text-lg font-display font-black text-slate-800 truncate">{username}</h3>
                      <span className="text-[11px] font-mono text-emerald-700 font-bold">
                        {userRating} ELO{isSignedIn ? " • ✓ Google" : ""}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-150 text-center">
                    <div>
                      <span className="text-[8px] font-mono text-slate-400 block uppercase">Wins</span>
                      <span className="text-sm font-black text-emerald-700">{userWins}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-mono text-slate-400 block uppercase">Played</span>
                      <span className="text-sm font-black text-slate-800">{userMatches}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-mono text-slate-400 block uppercase">Best</span>
                      <span className="text-sm font-black text-slate-800">{highScore}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-mono text-slate-400 block uppercase">Coins</span>
                      <span className="text-sm font-black text-amber-600">{coins}</span>
                    </div>
                  </div>

                  {googleConfigured && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-mono text-slate-400 uppercase font-black">Account</label>
                      {isSignedIn ? (
                        <button
                          onClick={() => {
                            SoundEffects.playClick();
                            handleGoogleSignOut();
                          }}
                          className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs border border-slate-200 transition cursor-pointer flex items-center justify-center gap-2"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Sign out
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            SoundEffects.playClick();
                            handleGoogleSignIn();
                          }}
                          className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-black text-xs border border-slate-300 transition cursor-pointer flex items-center justify-center gap-2"
                        >
                          <LogIn className="w-3.5 h-3.5 text-sky-600" /> Sign in with Google to save progress
                        </button>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[9px] font-mono text-slate-400 uppercase font-black">Player name</label>
                    <input
                      type="text"
                      maxLength={18}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-800 focus:outline-none focus:border-emerald-600 transition"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-mono text-slate-400 uppercase font-black">Avatar colour</label>
                    <div className="flex gap-2">
                      {[
                        "from-sky-400 to-indigo-600",
                        "from-emerald-400 to-teal-600",
                        "from-amber-400 to-orange-600",
                        "from-fuchsia-450 to-pink-600",
                        "from-red-500 to-orange-600",
                      ].map((gradient) => (
                        <button
                          key={gradient}
                          onClick={() => {
                            SoundEffects.playClick();
                            setAvatarColor(gradient);
                          }}
                          className={`w-8 h-8 rounded-full bg-gradient-to-tr ${gradient} border cursor-pointer ${
                            avatarColor === gradient ? "border-slate-800 ring-2 ring-emerald-600" : "border-transparent"
                          } transition active:scale-95`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <label className="text-[9px] font-mono text-red-400 uppercase font-black">Danger zone</label>
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="mt-2 w-full py-2.5 rounded-xl bg-white hover:bg-red-50 text-red-600 font-black text-xs border border-red-200 transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" /> Delete my account & data
                      </button>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <p className="text-[10px] text-slate-500 font-medium text-center leading-snug">
                          This permanently erases your stats, rating and sign-in. It can't be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs cursor-pointer active:scale-95"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleDeleteAccount}
                            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs cursor-pointer active:scale-95"
                          >
                            Confirm delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center">
                  <button
                    onClick={() => {
                      SoundEffects.playClick();
                      setMode(GameMode.MENU);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer active:scale-95"
                  >
                    Return to Lobby
                  </button>
                </div>
              </motion.div>
            )}

            {/* 5. REVENUE GUIDE */}
            {mode === GameMode.REVENUE_INFO && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <RevenueCenter />
                <div className="text-center">
                  <button
                    onClick={() => setMode(GameMode.MENU)}
                    className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold rounded-xl text-slate-700 transition cursor-pointer active:scale-95 shadow-sm"
                  >
                    Return to Main Menu
                  </button>
                </div>
              </motion.div>
            )}

            {/* 6. TOURNAMENT LOBBY */}
            {mode === GameMode.TOURNAMENT_LOBBY && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-5xl mx-auto space-y-6 text-slate-850"
              >
                {/* Header */}
                <div className="bg-white border border-slate-150 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 text-amber-800 flex items-center justify-center text-3xl rounded-2xl border border-amber-300">
                      🏆
                    </div>
                    <div className="text-left">
                      <h2 className="text-2xl font-display font-black text-slate-900 leading-tight">
                        Hand Cricket Grand Cup
                      </h2>
                      <p className="text-xs text-slate-500 font-medium">
                        8-Player Bracket Knockout Arena • Play progress matches to win the +500 Coins trophy!
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-450 block font-mono">Tournament Wallet</span>
                      <span className="text-sm font-black text-emerald-800 flex items-center gap-1">
                        🪙 {coins} Coins
                      </span>
                    </div>

                    <button
                      onClick={handleExitTournament}
                      className="px-4 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 rounded-xl transition cursor-pointer active:scale-95"
                    >
                      Forfeit & Exit
                    </button>
                  </div>
                </div>

                {tournamentState.round === "CHAMPION" ? (
                  /* Champion Trophy View */
                  <div className="bg-white border-2 border-yellow-405 rounded-3xl p-8 text-center space-y-6 max-w-xl mx-auto shadow-xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000003_1px,transparent_1px),linear-gradient(to_bottom,#00000003_1px,transparent_1px)] bg-[size:1rem_1rem] opacity-20 pointer-events-none" />
                    <div className="absolute -top-12 -left-12 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl pointer-events-none animate-pulse" />
                    <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-555/10 rounded-full blur-2xl pointer-events-none animate-pulse" />

                    <div className="w-24 h-24 bg-yellow-105 border-2 border-yellow-400 text-glow flex items-center justify-center text-5xl rounded-full mx-auto shadow-inner animate-bounce">
                      👑
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-2xl font-display font-black text-slate-900">
                        ALL HAIL THE CHAMPION!
                      </h3>
                      <p className="text-sm text-yellow-750 font-mono font-black uppercase tracking-widest leading-none">
                        🥇 {username}
                      </p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed font-semibold">
                        Compiling master algorithms and perfect finger throws, you swept the bracket and conquered the tournament cup. You have been awarded +500 Gold Coins!
                      </p>
                    </div>

                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 max-w-xs mx-auto">
                      <span className="text-[10px] text-emerald-700 font-mono block uppercase font-bold">Prize Dispatched</span>
                      <span className="text-md font-black text-emerald-800 block font-mono">+500 COINS ADDED</span>
                    </div>

                    <button
                      onClick={handleExitTournament}
                      className="px-6 py-2.5 bg-yellow-400 hover:bg-yellow-350 text-slate-950 font-black text-xs uppercase rounded-xl transition shadow active:scale-95 cursor-pointer"
                    >
                      Collect Reward & Close
                    </button>
                  </div>
                ) : (
                  /* Live Matches Bracket Columns */
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                    
                    {/* QUARTER FINALS COLUMN */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-left">
                        <span className="text-xs font-mono font-black text-emerald-800 uppercase tracking-wider">Quarter-Finals (R8)</span>
                        <span className="text-[10px] bg-emerald-50 text-emerald-800 font-mono px-2 py-0.5 rounded border border-emerald-200 font-bold">Easy Diff</span>
                      </div>

                      <div className="space-y-3">
                        {tournamentState.matches.QUARTERS.map((match) => {
                          const isUserParticipant = match.p1.id === userId || match.p2.id === userId;
                          const winnerId = match.winnerId;
                          
                          return (
                            <div
                              key={match.id}
                              className={`p-3.5 rounded-2xl bg-white border transition flex flex-col justify-between gap-2.5 ${
                                isUserParticipant
                                  ? match.status === "PENDING"
                                    ? "border-emerald-500 ring-2 ring-emerald-550/15 shadow-md"
                                    : "border-slate-200"
                                  : "border-slate-100"
                              }`}
                            >
                              <div className="space-y-1.5 text-left">
                                {/* Player 1 */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${match.p1.avatarColor}`} />
                                    <span className={`text-xs font-bold truncate max-w-[105px] ${winnerId === match.p1.id ? "text-emerald-700" : winnerId ? "text-slate-400" : "text-slate-800"}`}>
                                      {match.p1.username}
                                    </span>
                                    {match.p1.id === userId && <span className="text-[7px] bg-yellow-400 font-mono px-1 rounded text-emerald-950 font-extrabold">YOU</span>}
                                  </div>
                                  <span className="text-xs font-mono font-black text-slate-650">{match.p1Score !== undefined ? match.p1Score : "-"}</span>
                                </div>

                                {/* Player 2 */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${match.p2.avatarColor}`} />
                                    <span className={`text-xs font-bold truncate max-w-[105px] ${winnerId === match.p2.id ? "text-emerald-700" : winnerId ? "text-slate-400" : "text-slate-800"}`}>
                                      {match.p2.username}
                                    </span>
                                    {match.p2.id === userId && <span className="text-[7px] bg-yellow-400 font-mono px-1 rounded text-emerald-950 font-extrabold">YOU</span>}
                                  </div>
                                  <span className="text-xs font-mono font-black text-slate-650">{match.p2Score !== undefined ? match.p2Score : "-"}</span>
                                </div>
                              </div>

                              {isUserParticipant && match.status === "PENDING" && tournamentState.round === "QUARTERS" && (
                                <button
                                  onClick={handlePlayTournamentMatch}
                                  className="w-full py-1.5 bg-emerald-750 hover:bg-emerald-850 text-white font-extrabold text-[10px] rounded-xl transition cursor-pointer"
                                >
                                  ⚡ Play Match
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SEMI FINALS COLUMN */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-left">
                        <span className="text-xs font-mono font-black text-purple-805 uppercase tracking-wider">Semi-Finals (R4)</span>
                        <span className="text-[10px] bg-purple-50 text-purple-800 font-mono px-2 py-0.5 rounded border border-purple-200 font-bold">Medium Diff</span>
                      </div>

                      <div className="space-y-3">
                        {tournamentState.matches.SEMIS.length === 0 ? (
                          <div className="p-4 border border-dashed border-slate-205 rounded-2xl text-center text-[10px] font-mono text-slate-450 italic py-12">
                            Waiting for Quarters resolution
                          </div>
                        ) : (
                          tournamentState.matches.SEMIS.map((match) => {
                            const isUserParticipant = match.p1.id === userId || match.p2.id === userId;
                            const winnerId = match.winnerId;

                            return (
                              <div
                                key={match.id}
                                className={`p-4 rounded-2xl bg-white border transition flex flex-col justify-between gap-2.5 min-h-[110px] ${
                                  isUserParticipant
                                    ? match.status === "PENDING" && tournamentState.round === "SEMIS"
                                      ? "border-purple-550 ring-2 ring-purple-600/15 shadow-md"
                                      : "border-slate-200"
                                    : "border-slate-100"
                                }`}
                              >
                                <div className="space-y-2 text-left">
                                  {/* Player 1 */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${match.p1.avatarColor}`} />
                                      <span className={`text-xs font-bold truncate max-w-[105px] ${winnerId === match.p1.id ? "text-emerald-700" : winnerId ? "text-slate-400" : "text-slate-800"}`}>
                                        {match.p1.username}
                                      </span>
                                      {match.p1.id === userId && <span className="text-[7px] bg-yellow-400 font-mono px-1 rounded text-emerald-950 font-extrabold">YOU</span>}
                                    </div>
                                    <span className="text-xs font-mono font-black text-slate-650">{match.p1Score !== undefined ? match.p1Score : "-"}</span>
                                  </div>

                                  {/* Player 2 */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${match.p2.avatarColor}`} />
                                      <span className={`text-xs font-bold truncate max-w-[105px] ${winnerId === match.p2.id ? "text-emerald-700" : winnerId ? "text-slate-400" : "text-slate-800"}`}>
                                        {match.p2.username}
                                      </span>
                                      {match.p2.id === userId && <span className="text-[7px] bg-yellow-400 font-mono px-1 rounded text-emerald-950 font-extrabold">YOU</span>}
                                    </div>
                                    <span className="text-xs font-mono font-black text-slate-650">{match.p2Score !== undefined ? match.p2Score : "-"}</span>
                                  </div>
                                </div>

                                {isUserParticipant && match.status === "PENDING" && tournamentState.round === "SEMIS" && (
                                  <button
                                    onClick={handlePlayTournamentMatch}
                                    className="w-full py-1.5 bg-purple-700 hover:bg-purple-850 text-white font-extrabold text-[10px] rounded-xl transition cursor-pointer"
                                  >
                                    ⚡ Play Semis Match
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* FINALS COLUMN */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-left">
                        <span className="text-xs font-mono font-black text-amber-805 uppercase tracking-wider">Championship Final</span>
                        <span className="text-[10px] bg-amber-50 text-amber-805 font-mono px-2 py-0.5 rounded border border-amber-200 animate-pulse font-extrabold">Hard Diff</span>
                      </div>

                      <div className="space-y-3">
                        {tournamentState.matches.FINALS.length === 0 ? (
                          <div className="p-4 border border-dashed border-slate-205 rounded-2xl text-center text-[10px] font-mono text-slate-455 italic py-12">
                            Waiting for Semis resolution
                          </div>
                        ) : (
                          tournamentState.matches.FINALS.map((match) => {
                            const isUserParticipant = match.p1.id === userId || match.p2.id === userId;
                            const winnerId = match.winnerId;

                            return (
                              <div
                                key={match.id}
                                className={`p-4 rounded-2xl bg-white border transition flex flex-col justify-between gap-3 min-h-[130px] ${
                                  isUserParticipant
                                    ? match.status === "PENDING" && tournamentState.round === "FINALS"
                                      ? "border-amber-550 ring-2 ring-amber-600/15 shadow-md"
                                      : "border-slate-200"
                                    : "border-slate-100"
                                }`}
                              >
                                <div className="space-y-2.5 text-left">
                                  {/* Player 1 */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${match.p1.avatarColor}`} />
                                      <span className={`text-xs font-bold truncate max-w-[105px] ${winnerId === match.p1.id ? "text-emerald-700" : winnerId ? "text-slate-400" : "text-slate-800"}`}>
                                        {match.p1.username}
                                      </span>
                                      {match.p1.id === userId && <span className="text-[7px] bg-yellow-400 font-mono px-1 rounded text-emerald-950 font-extrabold">YOU</span>}
                                    </div>
                                    <span className="text-xs font-mono font-black text-slate-650">{match.p1Score !== undefined ? match.p1Score : "-"}</span>
                                  </div>

                                  {/* Player 2 */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-4 h-4 rounded-full bg-gradient-to-tr ${match.p2.avatarColor}`} />
                                      <span className={`text-xs font-bold truncate max-w-[105px] ${winnerId === match.p2.id ? "text-emerald-700" : winnerId ? "text-slate-400" : "text-slate-800"}`}>
                                        {match.p2.username}
                                      </span>
                                      {match.p2.id === userId && <span className="text-[7px] bg-yellow-400 font-mono px-1 rounded text-emerald-950 font-extrabold">YOU</span>}
                                    </div>
                                    <span className="text-xs font-mono font-black text-slate-650">{match.p2Score !== undefined ? match.p2Score : "-"}</span>
                                  </div>
                                </div>

                                {isUserParticipant && match.status === "PENDING" && tournamentState.round === "FINALS" && (
                                  <button
                                    onClick={handlePlayTournamentMatch}
                                    className="w-full py-2 bg-yellow-400 hover:bg-yellow-350 text-emerald-950 font-black text-xs rounded-xl shadow transition cursor-pointer"
                                  >
                                    🏅 START CUP FINAL
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-150 bg-slate-50/50 py-4 px-4 text-center mt-6">
        {mode === GameMode.MENU && (
          <div className="max-w-md mx-auto mb-3 p-1.5 bg-white border border-slate-155 rounded-xl flex items-center justify-between text-left shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[7.5px] font-mono bg-slate-100 px-1 border border-slate-200 rounded font-bold text-slate-500">AD</span>
              <div>
                <span className="text-[10px] font-display font-black text-slate-800 hover:text-emerald-700 cursor-pointer block leading-none">⚡ GET HAND CRICKET PRO STADIUM</span>
                <span className="text-[8px] text-slate-450 font-mono tracking-wider block">Real-time multiplayer skins, no limit coins</span>
              </div>
            </div>
            <button
              onClick={() => {
                SoundEffects.playClick();
                AdMobInstance.showRewardedAd(
                  (amount) => { setCoins((prev) => prev + amount); },
                  () => {}
                );
              }}
              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[8.5px] uppercase rounded transition active:scale-95 shadow-sm cursor-pointer"
            >
              Watch Video
            </button>
          </div>
        )}
        <p className="text-[10px] font-mono text-slate-400 max-w-lg mx-auto">
          Hand Cricket Multiplayer Pro © 2026. All rights reserved. No actual currency used.
        </p>
      </footer>
      <AdMobSimulator />
    </div>
  );
}
