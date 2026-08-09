export enum GameMode {
  MENU = "MENU",
  AI_MATCH = "AI_MATCH",
  MULTIPLAYER_LOBBY = "MULTIPLAYER_LOBBY",
  MULTIPLAYER_MATCH = "MULTIPLAYER_MATCH",
  LEADERBOARD = "LEADERBOARD",
  REVENUE_INFO = "REVENUE_INFO",
  TOURNAMENT_LOBBY = "TOURNAMENT_LOBBY",
  PROFILE = "PROFILE",
}

export interface PlayerStats {
  userId: string;
  username: string;
  wins: number;
  matchesPlayed: number;
  runsScored: number;
  wicketsTaken: number;
  avatarColor: string;
  rating: number;
}

export interface MatchHistoryItem {
  ball: number;
  batsmanMove: number;
  bowlerMove: number;
  runs: number;
  isOut: boolean;
  commText: string;
  innings?: number;
  userWasBatting?: boolean;
}

export interface ClientMatchState {
  id: string;
  players: Array<{
    id: string;
    username: string;
    avatarColor: string;
    isReady: boolean;
  }>;
  batsmanIndex: number;
  score: number;
  wickets: number;
  overs: number;
  ballsCount: number;
  maxOvers: number;
  innings: number;
  firstInningsRuns: number;
  status: "WAITING" | "PLAYING" | "INNINGS_BREAK" | "FINISHED";
  history: MatchHistoryItem[];
}

export interface TournamentParticipant {
  id: string;
  username: string;
  avatarColor: string;
  isBot: boolean;
  rating: number;
}

export interface TournamentMatch {
  id: string;
  p1: TournamentParticipant;
  p2: TournamentParticipant;
  p1Score?: number;
  p2Score?: number;
  winnerId?: string;
  status: "PENDING" | "PLAYING" | "COMPLETED";
}

export interface TournamentState {
  isActive: boolean;
  round: "QUARTERS" | "SEMIS" | "FINALS" | "CHAMPION";
  participants: TournamentParticipant[];
  matches: {
    QUARTERS: TournamentMatch[];
    SEMIS: TournamentMatch[];
    FINALS: TournamentMatch[];
  };
  currentMatchId: string | null;
}

