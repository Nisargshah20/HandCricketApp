import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Allow the packaged mobile app (served from https://localhost / capacitor://localhost)
// and web clients to call this API cross-origin.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Leaderboard Persistence
const LEADERBOARD_FILE = path.join(process.cwd(), "data", "leaderboard.json");
const DATA_DIR = path.join(process.cwd(), "data");

// Create Data Directory if not exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  wins: number;
  matchesPlayed: number;
  runsScored: number;
  wicketsTaken: number;
  avatarColor: string;
  rating: number; // ELO rating, defaults to 1000
}

let leaderboard: LeaderboardEntry[] = [];

// Legacy demo/bot ids that should never appear on the public board.
const SEED_PREFIX = "ai_";
const isRealPlayer = (e: LeaderboardEntry) => !e.userId.startsWith(SEED_PREFIX);

// Standard ELO update. K=32. Floors at 100 so a rating never underflows.
function computeElo(playerRating: number, opponentRating: number, won: boolean, k = 32): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const next = Math.round(playerRating + k * ((won ? 1 : 0) - expected));
  return Math.max(100, next);
}

// Persistence: Postgres (Neon/Supabase) when DATABASE_URL is set, else a local JSON file.
const DATABASE_URL = process.env.DATABASE_URL;
const usePg = !!DATABASE_URL;
let pgPool: import("pg").Pool | null = null;

function rowToEntry(r: any): LeaderboardEntry {
  return {
    userId: r.user_id,
    username: r.username,
    wins: r.wins,
    matchesPlayed: r.matches_played,
    runsScored: r.runs_scored,
    wicketsTaken: r.wickets_taken,
    avatarColor: r.avatar_color,
    rating: r.rating,
  };
}

async function upsertPlayer(e: LeaderboardEntry) {
  if (!pgPool) return;
  await pgPool.query(
    `INSERT INTO leaderboard (user_id, username, wins, matches_played, runs_scored, wickets_taken, avatar_color, rating)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id) DO UPDATE SET
       username = EXCLUDED.username, wins = EXCLUDED.wins, matches_played = EXCLUDED.matches_played,
       runs_scored = EXCLUDED.runs_scored, wickets_taken = EXCLUDED.wickets_taken,
       avatar_color = EXCLUDED.avatar_color, rating = EXCLUDED.rating`,
    [e.userId, e.username, e.wins, e.matchesPlayed, e.runsScored, e.wicketsTaken, e.avatarColor, e.rating]
  );
}

async function initLeaderboard() {
  if (usePg) {
    const { Pool } = await import("pg");
    pgPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS leaderboard (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        wins INTEGER NOT NULL DEFAULT 0,
        matches_played INTEGER NOT NULL DEFAULT 0,
        runs_scored INTEGER NOT NULL DEFAULT 0,
        wickets_taken INTEGER NOT NULL DEFAULT 0,
        avatar_color TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL DEFAULT 1000
      )`
    );
    const { rows } = await pgPool.query("SELECT * FROM leaderboard");
    leaderboard = rows.map(rowToEntry).filter(isRealPlayer);
    console.log(`Leaderboard loaded from Postgres (${leaderboard.length} players).`);
    return;
  }

  // File fallback (local dev / no database configured)
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      leaderboard = (JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf-8")) as LeaderboardEntry[]).filter(isRealPlayer);
    } else {
      leaderboard = [];
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
    }
  } catch (error) {
    console.error("Failed to load leaderboard:", error);
    leaderboard = [];
  }
}

function saveLeaderboard(changed?: LeaderboardEntry) {
  if (usePg) {
    const targets = changed ? [changed] : leaderboard;
    Promise.all(targets.map(upsertPlayer)).catch((e) => console.error("Failed to save leaderboard to DB:", e));
    return;
  }
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
  } catch (error) {
    console.error("Failed to save leaderboard:", error);
  }
}

// REST Endpoints
app.get("/api/leaderboard", (req, res) => {
  // Sort by rating descending, then wins, then runs
  const sorted = [...leaderboard].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.wins - a.wins;
  });
  res.json(sorted.slice(0, 15));
});

app.post("/api/leaderboard", (req, res) => {
  const { userId, username, won, runs, wickets, avatarColor, opponentRating } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  const updated = updatePlayerStats(
    userId,
    username,
    !!won,
    Number(runs || 0),
    Number(wickets || 0),
    avatarColor || "from-sky-400 to-indigo-500",
    Number(opponentRating || 1000)
  );
  res.json({ status: "success", rating: updated.rating, wins: updated.wins, matchesPlayed: updated.matchesPlayed, username: updated.username });
});

// Claim a unique display name for a player. Returns the final (possibly
// suffixed) name; the client should adopt whatever it gets back.
app.post("/api/username", (req, res) => {
  const { userId, username } = req.body;
  if (!userId || !username) {
    return res.status(400).json({ error: "userId and username are required" });
  }
  const unique = makeUniqueUsername(String(username), String(userId));
  const player = leaderboard.find((p) => p.userId === userId);
  if (player) {
    player.username = unique;
    saveLeaderboard(player);
  }
  res.json({ username: unique });
});

// Google Sign-In: verify the ID token and create/load a persistent account keyed by Google's stable user id.
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
const googleClient = GOOGLE_WEB_CLIENT_ID ? new OAuth2Client(GOOGLE_WEB_CLIENT_ID) : null;

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient) {
    return res.status(500).json({ error: "Google auth is not configured on the server" });
  }
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: "idToken is required" });
  }
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_WEB_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p || !p.sub) {
      return res.status(401).json({ error: "Invalid Google token" });
    }
    const userId = `g_${p.sub}`;
    let player = leaderboard.find((x) => x.userId === userId);
    if (!player) {
      player = {
        userId,
        username: makeUniqueUsername(p.name || p.email?.split("@")[0] || `Player_${Math.floor(1000 + Math.random() * 9000)}`, userId),
        wins: 0,
        matchesPlayed: 0,
        runsScored: 0,
        wicketsTaken: 0,
        avatarColor: "from-sky-400 to-indigo-600",
        rating: 1000,
      };
      leaderboard.push(player);
      saveLeaderboard(player);
    }
    res.json({
      userId: player.userId,
      username: player.username,
      avatarColor: player.avatarColor,
      email: p.email,
      picture: p.picture,
      wins: player.wins,
      matchesPlayed: player.matchesPlayed,
      rating: player.rating,
    });
  } catch (error) {
    console.error("Google token verification failed:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
});

// Account deletion (Google Play data-deletion requirement): erases the player's
// leaderboard record from both the in-memory board and the database.
app.post("/api/auth/delete", (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }
  leaderboard = leaderboard.filter((p) => p.userId !== userId);
  if (usePg && pgPool) {
    pgPool
      .query("DELETE FROM leaderboard WHERE user_id = $1", [userId])
      .catch((e) => console.error("Failed to delete player from DB:", e));
  } else {
    saveLeaderboard();
  }
  res.json({ status: "deleted" });
});

// Public account-deletion info page (URL required by the Play Store listing).
app.get("/delete-account", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Delete your Hand Cricket account</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#0f172a;line-height:1.6}h1{font-size:1.4rem}code{background:#f1f5f9;padding:2px 6px;border-radius:6px}</style>
</head><body>
<h1>Delete your Hand Cricket Pro account</h1>
<p>You can permanently delete your account and all associated data (username, ELO rating, wins, matches and leaderboard entry) directly inside the app:</p>
<ol>
<li>Open <strong>Hand Cricket Pro</strong>.</li>
<li>Tap your <strong>profile card</strong> at the top of the lobby.</li>
<li>Scroll to <strong>Danger zone</strong> and tap <strong>Delete my account &amp; data</strong>.</li>
<li>Confirm. Your record is removed from our servers immediately.</li>
</ol>
<p>Deleted data: profile name, avatar colour, ELO rating, wins, matches, runs and wickets. We do not retain backups of deleted accounts. If you need help, contact the developer through the Play Store listing.</p>
</body></html>`);
});

// Public privacy policy page (URL required by the Play Store listing).
app.get("/privacy", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Hand Cricket Pro — Privacy Policy</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#0f172a;line-height:1.6}h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:1.5rem}code{background:#f1f5f9;padding:2px 6px;border-radius:6px}</style>
</head><body>
<h1>Privacy Policy — Hand Cricket Pro</h1>
<p><em>Last updated: 9 August 2026</em></p>
<p>Hand Cricket Pro ("the app") is a casual cricket game. This policy explains what data we handle.</p>
<h2>Information we collect</h2>
<ul>
<li><strong>Profile data:</strong> a display name and avatar colour you choose. These are stored to power the global leaderboard.</li>
<li><strong>Game stats:</strong> your ELO rating, wins, matches, runs and wickets.</li>
<li><strong>Google Sign-In (optional):</strong> if you sign in, we receive your Google account's stable user id, name and email solely to save your progress. We never see your Google password.</li>
<li><strong>Advertising:</strong> the app may show ads via Google AdMob, which may use device identifiers per Google's policies.</li>
</ul>
<h2>How we use it</h2>
<p>Data is used only to run the game, save your progress and display leaderboards. We do not sell your personal data.</p>
<h2>Data deletion</h2>
<p>You can permanently delete your account and all associated data at any time from <strong>Profile → Danger zone → Delete my account &amp; data</strong>, or see <a href="/delete-account">/delete-account</a>.</p>
<h2>Children</h2>
<p>The app is not directed at children under 13 and does not knowingly collect their data.</p>
<h2>Contact</h2>
<p>For any privacy questions, contact the developer through the Google Play Store listing.</p>
</body></html>`);
});

// Ensure a display name is unique across all other players. Collisions get a
// numeric suffix ("Vrushali Shah 2"); as a last resort a userId-based tag.
function makeUniqueUsername(desired: string, userId: string): string {
  const clean =
    (desired || "").trim().replace(/\s+/g, " ").slice(0, 20) ||
    `Player_${Math.floor(1000 + Math.random() * 9000)}`;
  const taken = (name: string) =>
    leaderboard.some((p) => p.userId !== userId && p.username.toLowerCase() === name.toLowerCase());
  if (!taken(clean)) return clean;
  for (let i = 2; i <= 999; i++) {
    const suffix = ` ${i}`;
    const candidate = clean.slice(0, 20 - suffix.length) + suffix;
    if (!taken(candidate)) return candidate;
  }
  return clean.slice(0, 15) + "#" + userId.slice(-4);
}

// Helper to update player stats on match completion
function updatePlayerStats(
  userId: string,
  username: string,
  won: boolean,
  runs: number,
  wickets: number,
  avatarColor: string,
  opponentRating: number = 1000
): LeaderboardEntry {
  let player = leaderboard.find((p) => p.userId === userId);
  if (!player) {
    player = {
      userId,
      username: makeUniqueUsername(username, userId),
      wins: 0,
      matchesPlayed: 0,
      runsScored: 0,
      wicketsTaken: 0,
      avatarColor: avatarColor || "from-slate-400 to-slate-500",
      rating: 1000,
    };
    leaderboard.push(player);
  }

  player.matchesPlayed += 1;
  player.runsScored += runs;
  player.wicketsTaken += wickets;
  if (username) player.username = makeUniqueUsername(username, userId);
  if (avatarColor) player.avatarColor = avatarColor;

  if (won) player.wins += 1;
  player.rating = computeElo(player.rating, opponentRating, won);

  saveLeaderboard(player);
  return player;
}

// Generate Cricket Commentary Endpoint (100% cost-free, running algorithmic local-only humor)
app.post("/api/commentary", async (req, res) => {
  const { eventType, score, batsmanMove, bowlerMove, matchStateText } = req.body;

  const batMove = Number(batsmanMove || 0);
  const bowlMove = Number(bowlerMove || 0);

  const genericLines: Record<string, string[]> = {
    OUT: [
      `OUT! Oh my word, absolute drama in the stadium! Both player and bot threw ${batMove}! The bowler is running around the yard in pure celebration!`,
      `GONE! Bowled him! Incredible psychic prediction by the bowler, matching the batsman's trick with a solid ${batMove}!`,
      `Oh! Clean bowled! The batsman went for ${batMove}, but the bowler read the fingers like an open book. Innings complete!`,
      `CLATTER! The bells are ringing and the wickets are shattered! A flawless prediction for ${batMove}. What a game!`,
      `Unbelievable! Caught and bowled! The batsman's finger chose ${batMove}, but the bowler guessed it exactly right! Dismissed!`
    ],
    RUNS: [
      `Nicely played! A neat little single, adding ${batMove} runs to the board. Keeping the strike rotating!`,
      `Shot! A lovely strike for ${batMove} runs. The batsman looking in absolute sublime touch today!`,
      `CRACK! That went like a bullet for ${batMove} runs! Beautiful, risk-free cricket from the batsman.`,
      `Tucked away on the leg side! Elegant wristwork to milk the bowler for ${batMove} runs.`,
      `The batsman plays with confidence, choosing ${batMove} and safely avoiding the bowler's ${bowlMove}. Runs added!`
    ],
    WIN: [
      "Incredible win! What a tournament finish! The champion is crowned, absolute scenes of joy and fireworks in the stadium!",
      "VICTORY! The batsman clinches the final run in style! Exceptional performance under pressure to carry the day!",
      "GAME, SET, MATCH! A legendary climax as they finish the run chase! This goes down in Hand Cricket history!",
      "Spectacular finish! Complete dominance at the death. The winner takes it all!"
    ],
    START: [
      "Welcome to the Hand Cricket Arena! The crowd is roaring, the stadium lights are humming. Host operations are 100% green and ready. Play ball!",
      "Fasten your seatbelts! Both teams are out on the field. Hand Cricket Pro season starts RIGHT NOW!"
    ],
  };

  if (eventType === "RUNS") {
    if (batMove === 6) {
      const sixes = [
        `MASSIVE SIX! Oh, that's gone into orbit! The batsman chose 6, matching nothing! Complete maximum!`,
        `CRACK! That went a mile high! A breathtaking shot for 6 runs. The bowler stands in absolute despair!`,
        `Into the top tier! A spectacular strike for 6 runs! Pure timing and absolute confidence from the batsman!`,
        `BOOM! Clears the boundary rope by a distance! 6 runs of sheer masterclass!`
      ];
      return res.json({ text: sixes[Math.floor(Math.random() * sixes.length)] });
    } else if (batMove === 4) {
      const fours = [
        `FOUR! Shot of the day! Traced along the turf like a laser beam for 4 runs!`,
        `FOUR RUNS! Glorious cover drive! The fielder had absolutely zero chance of stopping that!`,
        `Beautifully timed! Guided past the point fielder for a swift four runs!`,
        `Crack! Spreads the field apart for four runs! Outstanding cricket!`
      ];
      return res.json({ text: fours[Math.floor(Math.random() * fours.length)] });
    }
  }

  const lines = genericLines[eventType] || genericLines["RUNS"];
  const randomLine = lines[Math.floor(Math.random() * lines.length)];
  res.json({ text: randomLine });
});


// Multi-User Match State / WebSocket Logic
interface Player {
  ws: WebSocket;
  id: string;
  username: string;
  avatarColor: string;
  isReady: boolean;
  score: number;
}

interface MatchState {
  id: string;
  players: Player[];
  batsmanIndex: number; // 0 or 1
  score: number;
  wickets: number;
  overs: number; // 0.1, 0.2 ...
  ballsCount: number;
  maxOvers: number; // e.g. 2 overs (12 balls)
  innings: number; // 1 or 2
  firstInningsRuns: number;
  status: "WAITING" | "PLAYING" | "INNINGS_BREAK" | "FINISHED";
  moves: { [playerId: string]: number | null }; // Player moves of current ball
  history: Array<{
    ball: number;
    batsmanMove: number;
    bowlerMove: number;
    runs: number;
    isOut: boolean;
    commText: string;
  }>;
  spectators: Array<{ id: string; username: string }>;
  rematchRequested: { [playerId: string]: boolean };
}

const activeMatches = new Map<string, MatchState>();
const matchQueue: { ws: WebSocket; id: string; username: string; avatarColor: string }[] = [];

// Broadcast message helper
function broadcastToMatch(match: MatchState, payload: object) {
  const msg = JSON.stringify(payload);
  match.players.forEach((p) => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(msg);
    }
  });
  // Also send to spectators if there are any
  // (In our simplified spectating protocol)
}

function generateMatchId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  let playerInfo: { id: string; username: string; avatarColor: string; activeRoomId?: string } | null = null;

  ws.on("message", async (messageStr) => {
    try {
      const data = JSON.parse(messageStr.toString());
      const { type, payload } = data;

      switch (type) {
        case "REGISTER_USER": {
          playerInfo = {
            id: payload.userId || `user_${Date.now()}`,
            username: payload.username || "Guest Player",
            avatarColor: payload.avatarColor || "from-sky-450 to-indigo-600",
          };
          ws.send(JSON.stringify({ type: "USER_REGISTERED", payload: playerInfo }));
          break;
        }

        case "CREATE_PRIVATE_ROOM": {
          if (!playerInfo) return;
          const roomId = generateMatchId();
          const p: Player = {
            ws,
            id: playerInfo.id,
            username: playerInfo.username,
            avatarColor: playerInfo.avatarColor,
            isReady: false,
            score: 0,
          };

          const match: MatchState = {
            id: roomId,
            players: [p],
            batsmanIndex: 0, // Player lobby creator bats first
            score: 0,
            wickets: 0,
            overs: 0,
            ballsCount: 0,
            maxOvers: payload.maxOvers || 2, // 2 overs by default
            innings: 1,
            firstInningsRuns: 0,
            status: "WAITING",
            moves: {},
            history: [],
            spectators: [],
            rematchRequested: {},
          };

          activeMatches.set(roomId, match);
          playerInfo.activeRoomId = roomId;

          ws.send(
            JSON.stringify({
              type: "ROOM_CREATED",
              payload: {
                roomId,
                matchState: {
                  id: match.id,
                  players: match.players.map((pl) => ({ id: pl.id, username: pl.username, avatarColor: pl.avatarColor, isReady: pl.isReady })),
                  status: match.status,
                  maxOvers: match.maxOvers,
                },
              },
            })
          );
          break;
        }

        case "JOIN_ROOM": {
          if (!playerInfo) return;
          const { roomId } = payload;
          const match = activeMatches.get(roomId?.toUpperCase());

          if (!match) {
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Room not found!" } }));
            return;
          }

          if (match.players.length >= 2) {
            // Join as spectator
            const spec = { id: playerInfo.id, username: playerInfo.username };
            match.spectators.push(spec);
            ws.send(
              JSON.stringify({
                type: "SPECTATING_ROOM",
                payload: {
                  roomId,
                  matchState: getSerializableMatchState(match),
                },
              })
            );
            return;
          }

          // Check if player is already in room
          if (match.players.find((p) => p.id === playerInfo!.id)) {
            return;
          }

          const pl: Player = {
            ws,
            id: playerInfo.id,
            username: playerInfo.username,
            avatarColor: playerInfo.avatarColor,
            isReady: false,
            score: 0,
          };
          match.players.push(pl);
          playerInfo.activeRoomId = match.id;

          // Once second player joins, auto set to ready or start immediately
          match.status = "PLAYING";
          match.batsmanIndex = Math.random() < 0.5 ? 0 : 1; // Random toss winner bats first

          broadcastToMatch(match, {
            type: "MATCH_STARTED",
            payload: {
              matchState: getSerializableMatchState(match),
              batsmanId: match.players[match.batsmanIndex].id,
              bowlerId: match.players[1 - match.batsmanIndex].id,
              commentary: "And here we go! The match has started! Fasten your seatbelts!",
            },
          });
          break;
        }

        case "JOIN_QUICK_MATCH": {
          if (!playerInfo) return;
          // Clean the queue of disconnected sockets
          const cleanedQueue = matchQueue.filter((qi) => qi.ws.readyState === WebSocket.OPEN);
          matchQueue.length = 0;
          matchQueue.push(...cleanedQueue);

          // If someone is in queue, pair them
          const opp = matchQueue.find((qi) => qi.id !== playerInfo!.id);
          if (opp) {
            // Remove opponent from queue
            const index = matchQueue.indexOf(opp);
            if (index > -1) matchQueue.splice(index, 1);

            const roomId = generateMatchId();
            const p1: Player = {
              ws: opp.ws,
              id: opp.id,
              username: opp.username,
              avatarColor: opp.avatarColor,
              isReady: true,
              score: 0,
            };
            const p2: Player = {
              ws,
              id: playerInfo.id,
              username: playerInfo.username,
              avatarColor: playerInfo.avatarColor,
              isReady: true,
              score: 0,
            };

            const match: MatchState = {
              id: roomId,
              players: [p1, p2],
              batsmanIndex: Math.random() < 0.5 ? 0 : 1,
              score: 0,
              wickets: 0,
              overs: 0,
              ballsCount: 0,
              maxOvers: 2, // Standard quick match is 2 overs
              innings: 1,
              firstInningsRuns: 0,
              status: "PLAYING",
              moves: {},
              history: [],
              spectators: [],
              rematchRequested: {},
            };

            activeMatches.set(roomId, match);
            playerInfo.activeRoomId = roomId;

            broadcastToMatch(match, {
              type: "MATCH_STARTED",
              payload: {
                matchState: getSerializableMatchState(match),
                batsmanId: match.players[match.batsmanIndex].id,
                bowlerId: match.players[1 - match.batsmanIndex].id,
                commentary: `Match ready! ${p1.username} vs ${p2.username}. It's absolute pandemonium in the stadium!`,
              },
            });
          } else {
            // Push self to queue
            const alreadyInQueue = matchQueue.find((qi) => qi.id === playerInfo!.id);
            if (!alreadyInQueue) {
              matchQueue.push({ ws, id: playerInfo.id, username: playerInfo.username, avatarColor: playerInfo.avatarColor });
            }
            ws.send(JSON.stringify({ type: "WAITING_FOR_OPPONENT", payload: {} }));
          }
          break;
        }

        case "CANCEL_QUICK_MATCH": {
          if (!playerInfo) return;
          const index = matchQueue.findIndex((qi) => qi.id === playerInfo!.id);
          if (index > -1) {
            matchQueue.splice(index, 1);
          }
          ws.send(JSON.stringify({ type: "QUICK_MATCH_CANCELLED" }));
          break;
        }

        case "PLAY_HAND": {
          if (!playerInfo || !playerInfo.activeRoomId) return;
          const match = activeMatches.get(playerInfo.activeRoomId);
          if (!match || match.status !== "PLAYING") return;

          const playerMove = parseInt(payload.move, 10);
          if (isNaN(playerMove) || playerMove < 1 || playerMove > 6) return;

          // Register player's move
          match.moves[playerInfo.id] = playerMove;

          // Notify of partial progress (e.g. "P1 is locked in")
          const lockedCount = Object.keys(match.moves).filter((k) => match.moves[k] !== null).length;
          broadcastToMatch(match, {
            type: "PLAYER_LOCKED",
            payload: {
              playerCount: lockedCount,
              playersLocked: Object.keys(match.moves),
            },
          });

          // Check if both moves are sealed (both distinct players have submitted)
          const bothLockedIn =
            match.players.length === 2 && match.players.every((p) => match.moves[p.id] != null);
          if (bothLockedIn) {
            // Resolve the Ball completely!
            await resolveBall(match);
          }
          break;
        }

        case "SEND_CHAT": {
          if (!playerInfo || !playerInfo.activeRoomId) return;
          const match = activeMatches.get(playerInfo.activeRoomId);
          if (!match) return;

          broadcastToMatch(match, {
            type: "CHAT_MESSAGE",
            payload: {
              senderId: playerInfo.id,
              senderName: playerInfo.username,
              text: payload.text,
              emoji: payload.emoji,
            },
          });
          break;
        }

        case "REQUEST_REMATCH": {
          if (!playerInfo || !playerInfo.activeRoomId) return;
          const match = activeMatches.get(playerInfo.activeRoomId);
          if (!match) return;

          match.rematchRequested[playerInfo.id] = true;

          broadcastToMatch(match, {
            type: "REMATCH_STATUS",
            payload: {
              rematchRequested: match.rematchRequested,
            },
          });

          // If both requested, restart
          const allRequested = match.players.every((p) => match.rematchRequested[p.id]);
          if (allRequested && match.players.length === 2) {
            match.batsmanIndex = Math.random() < 0.5 ? 0 : 1; // Toss winner
            match.score = 0;
            match.wickets = 0;
            match.overs = 0;
            match.ballsCount = 0;
            match.innings = 1;
            match.firstInningsRuns = 0;
            match.status = "PLAYING";
            match.moves = {};
            match.history = [];
            match.rematchRequested = {};

            broadcastToMatch(match, {
              type: "MATCH_STARTED",
              payload: {
                matchState: getSerializableMatchState(match),
                batsmanId: match.players[match.batsmanIndex].id,
                bowlerId: match.players[1 - match.batsmanIndex].id,
                commentary: "REMATCH! Ground shaking, scoreboard wiped. Who will claim final glory now?",
              },
            });
          }
          break;
        }

        case "LEAVE_ROOM": {
          handleDisconnect();
          break;
        }
      }
    } catch (e) {
      console.error("Failed to parse websocket message:", e);
    }
  });

  const handleDisconnect = () => {
    if (!playerInfo) return;

    // Remove from Quick Match Queue
    const qIndex = matchQueue.findIndex((qi) => qi.id === playerInfo!.id);
    if (qIndex > -1) {
      matchQueue.splice(qIndex, 1);
    }

    if (playerInfo.activeRoomId) {
      const match = activeMatches.get(playerInfo.activeRoomId);
      if (match) {
        // Remove from players array
        const pIndex = match.players.findIndex((p) => p.id === playerInfo!.id);
        if (pIndex > -1) {
          match.players.splice(pIndex, 1);
          // If no players are left, destroy the match
          if (match.players.length === 0) {
            activeMatches.delete(playerInfo.activeRoomId);
          } else {
            // Declare remaining player the winner
            match.status = "FINISHED";
            broadcastToMatch(match, {
              type: "PLAYER_LEFT",
              payload: {
                leftPlayerId: playerInfo.id,
                leftUsername: playerInfo.username,
                matchState: getSerializableMatchState(match),
                commentary: `${playerInfo.username} forfeited the match. The remaining player wins!`,
              },
            });
          }
        }
      }
    }
  };

  ws.on("close", () => {
    handleDisconnect();
  });
});

// Calculate serializable properties for transport
function getSerializableMatchState(match: MatchState) {
  return {
    id: match.id,
    players: match.players.map((p) => ({
      id: p.id,
      username: p.username,
      avatarColor: p.avatarColor,
      isReady: p.isReady,
    })),
    batsmanIndex: match.batsmanIndex,
    score: match.score,
    wickets: match.wickets,
    overs: match.overs,
    ballsCount: match.ballsCount,
    maxOvers: match.maxOvers,
    innings: match.innings,
    firstInningsRuns: match.firstInningsRuns,
    status: match.status,
    history: match.history,
    spectators: match.spectators,
  };
}

// Authoritative Match Logic
async function resolveBall(match: MatchState) {
  const p1 = match.players[0];
  const p2 = match.players[1];

  const batsPlayer = match.players[match.batsmanIndex];
  const bowlPlayer = match.players[1 - match.batsmanIndex];

  const batsMove = match.moves[batsPlayer.id] || 1;
  const bowlMove = match.moves[bowlPlayer.id] || 1;

  // Clear current moves for next ball
  match.moves = {};

  let ballIsOut = false;
  let runsScored = 0;

  if (batsMove === bowlMove) {
    ballIsOut = true;
  } else {
    runsScored = batsMove;
  }

  // Increment ball over count
  match.ballsCount += 1;
  const fullOvers = Math.floor(match.ballsCount / 6);
  const remainingBalls = match.ballsCount % 6;
  match.overs = parseFloat(`${fullOvers}.${remainingBalls}`);

  const maxTotalBalls = match.maxOvers * 6;

  // Generate premium local commentary dynamically (100% cost-free, offline algorithm)
  let ballCommentary = "";
  if (ballIsOut) {
    const outLines = [
      `OUT! Absolute drama! ${batsPlayer.username} and ${bowlPlayer.username} both played ${batsMove}! The wickets are shattered!`,
      `GONE! Bowled him! Incredible prediction by the bowler ${bowlPlayer.username}, matching ${batsPlayer.username}'s move of ${batsMove}!`,
      `Oh! Clean bowled! ${batsPlayer.username} went for ${batsMove}, but ${bowlPlayer.username} read them like an open book. Innings complete!`,
      `CLATTER! Magnificent guess! ${bowlPlayer.username} matched ${batsPlayer.username}'s ${batsMove} perfectly! Dismissed!`,
      `Silence in the stadium! ${batsPlayer.username} has been picked off! Both chose ${batsMove}. Brilliant game of minds!`
    ];
    ballCommentary = outLines[Math.floor(Math.random() * outLines.length)];
  } else {
    if (runsScored === 6) {
      const sixes = [
        `MASSIVE SIX! ${batsPlayer.username} lofts it straight over the sight screen! That's absolute power for 6 runs!`,
        `CRACK! That went a mile high! ${batsPlayer.username} scores a maximum 6 runs! ${bowlPlayer.username} stands back.`,
        `Into the stands! ${batsPlayer.username} connects clean! 6 runs of pure magic!`,
        `BOOM! Clears the boundary rope by a distance! ${batsPlayer.username} gets 6 runs on ${bowlPlayer.username}!`
      ];
      ballCommentary = sixes[Math.floor(Math.random() * sixes.length)];
    } else if (runsScored === 4) {
      const fours = [
        `FOUR! Shot of the day! Traced along the turf like a laser beam for 4 runs by ${batsPlayer.username}!`,
        `FOUR RUNS! Glorious cover drive! ${bowlPlayer.username} had absolutely zero chance of stopping that!`,
        `Beautifully timed! Guided past the point fielder for a swift four runs!`,
        `Crack! Spreads the field apart for four runs by ${batsPlayer.username}!`
      ];
      ballCommentary = fours[Math.floor(Math.random() * fours.length)];
    } else {
      const genericLines = [
        `Nicely played! A neat stroke, adding ${runsScored} runs. ${batsPlayer.username} and ${bowlPlayer.username} keep it moving.`,
        `Shot! A lovely strike for ${runsScored} runs. ${batsPlayer.username} looking in absolute sublime touch today!`,
        `Easy pickings! ${batsPlayer.username} scores ${runsScored} runs with a sneaky flick. ${bowlPlayer.username} threw ${bowlMove}.`,
        `Tucked away safely! ${batsPlayer.username} bags ${runsScored} runs. Keeping the scoreboard ticking!`,
        `Smart batting! ${batsPlayer.username} plays ${runsScored} runs safely. Score is now ${match.score + runsScored}.`
      ];
      ballCommentary = genericLines[Math.floor(Math.random() * genericLines.length)];
    }
  }

  // Push to history
  match.history.push({
    ball: match.ballsCount,
    batsmanMove: batsMove,
    bowlerMove: bowlMove,
    runs: runsScored,
    isOut: ballIsOut,
    commText: ballCommentary,
  });

  if (match.innings === 1) {
    // 1st innings calculations
    if (ballIsOut) {
      // Swapping innings!
      match.firstInningsRuns = match.score;
      match.innings = 2;
      match.batsmanIndex = 1 - match.batsmanIndex; // swap roles
      match.score = 0;
      match.ballsCount = 0;
      match.overs = 0;
      match.moves = {};

      broadcastToMatch(match, {
        type: "INNINGS_COMPLETE",
        payload: {
          matchState: getSerializableMatchState(match),
          commentary: `FIRST INNINGS OVER! ${batsPlayer.username} scored ${match.firstInningsRuns} runs! ${bowlPlayer.username} needs ${match.firstInningsRuns + 1} runs to win!`,
        },
      });
    } else {
      match.score += runsScored;

      // Check if maximum balls reached
      if (match.ballsCount >= maxTotalBalls) {
        // Innings over by overs
        match.firstInningsRuns = match.score;
        match.innings = 2;
        match.batsmanIndex = 1 - match.batsmanIndex; // swap roles
        match.score = 0;
        match.ballsCount = 0;
        match.overs = 0;
        match.moves = {};

        broadcastToMatch(match, {
          type: "INNINGS_COMPLETE",
          payload: {
            matchState: getSerializableMatchState(match),
            commentary: `Overs completed! ${batsPlayer.username} finishes at ${match.firstInningsRuns} runs. ${bowlPlayer.username} is chasing ${match.firstInningsRuns + 1} runs!`,
          },
        });
      } else {
        broadcastToMatch(match, {
          type: "BALL_RESOLVED",
          payload: {
            batsmanMove: batsMove,
            bowlerMove: bowlMove,
            runs: runsScored,
            isOut: false,
            matchState: getSerializableMatchState(match),
            commentary: ballCommentary,
          },
        });
      }
    }
  } else {
    // 2nd innings calculations
    match.score += runsScored;
    const target = match.firstInningsRuns + 1;

    // Victory checks
    if (match.score >= target) {
      // Chasing team wins
      match.status = "FINISHED";
      const winner = batsPlayer;
      const loser = bowlPlayer;

      const winnerRating = leaderboard.find((x) => x.userId === winner.id)?.rating ?? 1000;
      const loserRating = leaderboard.find((x) => x.userId === loser.id)?.rating ?? 1000;
      updatePlayerStats(winner.id, winner.username, true, match.score, 0, winner.avatarColor, loserRating);
      updatePlayerStats(loser.id, loser.username, false, match.firstInningsRuns, 1, loser.avatarColor, winnerRating);

      broadcastToMatch(match, {
        type: "MATCH_FINISHED",
        payload: {
          winnerId: winner.id,
          winnerName: winner.username,
          matchState: getSerializableMatchState(match),
          commentary: `And we have a winner! ${winner.username} successfully chased down the target of ${target}! What a thriller!`,
        },
      });
    } else if (ballIsOut || match.ballsCount >= maxTotalBalls) {
      // Defending team wins or draw
      match.status = "FINISHED";
      let winner = bowlPlayer;
      let loser = batsPlayer;
      let isDraw = false;

      if (match.score === match.firstInningsRuns) {
        isDraw = true;
      }

      if (isDraw) {
        const rd1 = leaderboard.find((x) => x.userId === p1.id)?.rating ?? 1000;
        const rd2 = leaderboard.find((x) => x.userId === p2.id)?.rating ?? 1000;
        updatePlayerStats(p1.id, p1.username, false, p1.score, 0, p1.avatarColor, rd2);
        updatePlayerStats(p2.id, p2.username, false, p2.score, 0, p2.avatarColor, rd1);
        broadcastToMatch(match, {
          type: "MATCH_FINISHED",
          payload: {
            winnerId: null,
            winnerName: "It's a TIE match!",
            matchState: getSerializableMatchState(match),
            commentary: `TIE! Dynamic match completed. Scores are precisely level! Sensational!`,
          },
        });
      } else {
        const wRating = leaderboard.find((x) => x.userId === winner.id)?.rating ?? 1000;
        const lRating = leaderboard.find((x) => x.userId === loser.id)?.rating ?? 1000;
        updatePlayerStats(winner.id, winner.username, true, match.firstInningsRuns, 1, winner.avatarColor, lRating);
        updatePlayerStats(loser.id, loser.username, false, match.score, 0, loser.avatarColor, wRating);

        broadcastToMatch(match, {
          type: "MATCH_FINISHED",
          payload: {
            winnerId: winner.id,
            winnerName: winner.username,
            matchState: getSerializableMatchState(match),
            commentary: `VICTORY! ${winner.username} has defended the score, restricting the opponent to ${match.score}! Spectacular bowling effort!`,
          },
        });
      }
    } else {
      // Running play continues
      broadcastToMatch(match, {
        type: "BALL_RESOLVED",
        payload: {
          batsmanMove: batsMove,
          bowlerMove: bowlMove,
          runs: runsScored,
          isOut: false,
          matchState: getSerializableMatchState(match),
          commentary: ballCommentary,
        },
      });
    }
  }
}

// Single Player AI OPPONENT Logic
// A witty endpoint to retrieve AI simulated throw

// Predict the human's next throw from move frequency, Markov transition from
// the last move, and repeat tendency. Returns null when there is no history.
function predictPlayerMove(history: Array<{ playerMove?: number }>): number | null {
  const moves = (history || []).map((h) => h.playerMove).filter((m): m is number => !!m);
  if (moves.length === 0) return null;
  const last = moves[moves.length - 1];
  const scores: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  // Overall frequency of each throw.
  moves.forEach((m) => (scores[m] += 1));
  // Markov: what the player tends to throw right after the current last move.
  for (let i = 1; i < moves.length; i++) {
    if (moves[i - 1] === last) scores[moves[i]] += 3;
  }
  // Humans tend to repeat the move that just worked.
  scores[last] += 1.5;
  let best = last;
  let bestScore = -1;
  for (let m = 1; m <= 6; m++) {
    if (scores[m] > bestScore) {
      bestScore = scores[m];
      best = m;
    }
  }
  return best;
}

app.post("/api/ai-move", (req, res) => {
  const { history, difficulty, aiBatting } = req.body;

  // Hand Cricket standard AI logic
  // "EASY" -> Pure Random throw between 1-6
  // "MEDIUM" -> Basic human pattern tracking (tendency to repeat / avoid previous throw)
  // "HARD" -> Predict human's next throw (frequency + Markov) and counter it
  let aiMove = Math.floor(Math.random() * 6) + 1;

  if (history && history.length > 0) {
    const lastPlayerMove = history[history.length - 1].playerMove;

    if (difficulty === "HARD") {
      const predicted = predictPlayerMove(history);
      if (predicted) {
        if (aiBatting) {
          // AI is batting: avoid the number the bowler is predicted to throw,
          // and otherwise bat aggressively for the highest safe run.
          const safe = [6, 5, 4, 3, 2, 1].filter((v) => v !== predicted);
          aiMove = Math.random() < 0.7 ? safe[0] : safe[Math.floor(Math.random() * safe.length)];
        } else {
          // AI is bowling: match the predicted batting number to take the wicket.
          // 65% commit to the read, else mix in randomness so it stays beatable.
          aiMove = Math.random() < 0.65 ? predicted : Math.floor(Math.random() * 6) + 1;
        }
      }
    } else if (difficulty === "MEDIUM") {
      // Lightly avoid the player's previous throw.
      if (Math.random() < 0.5) {
        const potential = [1, 2, 3, 4, 5, 6].filter((v) => v !== lastPlayerMove);
        aiMove = potential[Math.floor(Math.random() * potential.length)];
      }
    }
  }

  res.json({ move: aiMove });
});


// Serve React build in production, set up Vite dev middleware in development
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";

  await initLeaderboard();

  if (!isProd) {
    // Vite dev server
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Static files server. serving index.html
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to host 0.0.0.0 and port 3000
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on virtual host port http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to bootstrap fullstak server:", error);
});
