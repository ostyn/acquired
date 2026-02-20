/**
 * Responsibility: Central client orchestration store for lobby/game networking and UI state.
 * It owns peer connections, host authority flow, guest synchronization, and host checkpointing.
 */

import { makeAutoObservable } from "mobx";
import Peer from "peerjs";
import { v4 as uuidv4 } from "uuid";
import {
  addPlayerToLobby,
  applyAction,
  BOT_STRATEGIES,
  chooseBotAction,
  createLobbyState,
  getExpectedActorId,
  markPlayerConnection,
  removePlayerFromLobby,
  setLobbySettings,
  startGame,
  toPublicState,
  pushLogEvent,
} from "../game/engine";
import { PHASES } from "../game/constants";
import { createToken, localizeKnownError, resolveToken, subscribeToLocaleChanges } from "../ui/i18n";

const HOST_CHECKPOINT_KEY = "acquire.host.checkpoint.v1";
const ROOM_IDENTITIES_KEY = "acquire.room.identities.v1";
const DEBUG_LOG_STORAGE_KEY_PREFIX = "acquire.debug.log.v1";
const MAX_DEBUG_LOG_ENTRIES = 500;
const GUEST_INITIAL_STATE_TIMEOUT_MS = 15000;
const MAX_PLAYER_NAME_LENGTH = 24;
const BOT_THINK_BASE_MS = 550;
const BOT_THINK_JITTER_MS = 550;
const FAST_BOT_THINK_BASE_MS = 120;
const FAST_BOT_THINK_JITTER_MS = 180;
const DEFAULT_BOT_STRATEGY = BOT_STRATEGIES.MONTE_CARLO;
const DEFAULT_ICE_SERVERS = [
  {
    urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  },
];

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function parseSignalingUrl(signalingUrl) {
  const url = new URL(signalingUrl);
  const secure = url.protocol === "https:" || url.protocol === "wss:";
  const port = url.port ? Number(url.port) : secure ? 443 : 80;
  const rawPath = url.pathname || "/";
  const trimmedPath =
    rawPath.endsWith("/") && rawPath !== "/" ? rawPath.slice(0, -1) : rawPath;
  const path = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;

  return {
    host: url.hostname,
    port,
    path,
    secure,
  };
}

function cloneDefaultIceServers() {
  return DEFAULT_ICE_SERVERS.map((entry) => ({
    ...entry,
    urls: Array.isArray(entry.urls) ? [...entry.urls] : entry.urls,
  }));
}

function normalizeIceConfig(rawConfig) {
  const raw = typeof rawConfig === "string" ? rawConfig.trim() : "";
  if (!raw) {
    return {
      ok: true,
      raw: "",
      iceServers: cloneDefaultIceServers(),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error:
        "ICE/TURN config is not valid JSON. Provide an array or an object with iceServers.",
    };
  }

  const servers = Array.isArray(parsed) ? parsed : parsed?.iceServers;
  if (!Array.isArray(servers)) {
    return {
      ok: false,
      error:
        "ICE/TURN config must be an array of servers or an object with an iceServers array.",
    };
  }

  const normalized = [];
  for (const server of servers) {
    if (!server || typeof server !== "object") {
      return {
        ok: false,
        error: "Each ICE server entry must be an object with urls.",
      };
    }

    const urls = server.urls;
    const validUrls =
      typeof urls === "string" ||
      (Array.isArray(urls) && urls.every((url) => typeof url === "string"));
    if (!validUrls) {
      return {
        ok: false,
        error: "Each ICE server entry must include urls as a string or string array.",
      };
    }

    normalized.push({
      ...server,
      urls: Array.isArray(urls) ? [...urls] : urls,
    });
  }

  return {
    ok: true,
    raw,
    iceServers: normalized,
  };
}

function coerceMessage(message) {
  if (!message) {
    return null;
  }
  if (typeof message === "string") {
    try {
      return JSON.parse(message);
    } catch {
      return null;
    }
  }
  return message;
}

function normalizePlayerName(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, MAX_PLAYER_NAME_LENGTH);
}

function resolveBotStrategy(rawValue) {
  if (rawValue === BOT_STRATEGIES.RANDOM) {
    return BOT_STRATEGIES.RANDOM;
  }
  return BOT_STRATEGIES.MONTE_CARLO;
}

function readRoomIdentities() {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  const raw = window.localStorage.getItem(ROOM_IDENTITIES_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRoomIdentities(identities) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(ROOM_IDENTITIES_KEY, JSON.stringify(identities));
  } catch {
    // Ignore storage failures.
  }
}

function getDebugLogStorageKey(roomId) {
  return `${DEBUG_LOG_STORAGE_KEY_PREFIX}.${roomId}`;
}

function sanitizeStateForViewer(state, viewerId) {
  if (!state || typeof state !== "object") {
    return state;
  }

  const players = Array.isArray(state.players) ? state.players : [];
  return {
    ...state,
    log: Array.isArray(state.log) ? [...state.log] : [],
    logEvents: Array.isArray(state.logEvents)
      ? state.logEvents.map((event) => ({
        ...event,
        params: {
          ...(event?.params || {}),
        },
      }))
      : [],
    players: players.map((player) => ({
      ...player,
      tiles:
        player.id === viewerId && Array.isArray(player.tiles)
          ? [...player.tiles]
          : [],
      stocks:
        player.id === viewerId &&
        player.stocks &&
        typeof player.stocks === "object"
          ? { ...player.stocks }
          : {},
    })),
  };
}

class AppStore {
  role = "idle";

  guestViewRole = "player";

  roomId = "";

  localPlayerId = "";

  localName = "";

  signalingUrl = "https://0.peerjs.com/";

  peer = null;

  guestConnection = null;

  hostConnections = new Map();

  spectatorConnections = new Map();

  peerIdToPlayerId = new Map();

  peerIdToSpectatorId = new Map();

  startedJoinFallbackToSpectatorTried = false;

  hostState = null;

  viewState = null;

  connectionStatus = "idle";

  statusMessageToken = createToken("status.not_connected");

  statusMessage = resolveToken(this.statusMessageToken, "Not connected");

  errorMessageToken = null;

  errorMessage = "";

  hostCheckpointMeta = null;

  guestStateTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  botTurnTimerHandle: ReturnType<typeof setTimeout> | null = null;

  iceServersConfig = "";

  iceServers = cloneDefaultIceServers();

  lastPersistedDebugLogSignature = "";

  localeUnsubscribe: (() => void) | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
    this.refreshHostCheckpointMeta();
    this.localeUnsubscribe = subscribeToLocaleChanges(() => {
      this.refreshLocalizedMessages();
    });
  }

  clearGuestStateTimeout() {
    if (this.guestStateTimeoutHandle) {
      clearTimeout(this.guestStateTimeoutHandle);
      this.guestStateTimeoutHandle = null;
    }
  }

  clearBotTurnTimer() {
    if (this.botTurnTimerHandle) {
      clearTimeout(this.botTurnTimerHandle);
      this.botTurnTimerHandle = null;
    }
  }

  scheduleGuestStateTimeout() {
    this.clearGuestStateTimeout();

    const expectedRoomId = this.roomId;
    this.guestStateTimeoutHandle = setTimeout(() => {
      this.guestStateTimeoutHandle = null;

      if (!this.isGuest || this.roomId !== expectedRoomId || this.viewState) {
        return;
      }

      const channelOpen = Boolean(this.guestConnection && this.guestConnection.open);

      if (channelOpen) {
        this.setStatusToken(
          "status.connected_waiting_state_timeout",
          { roomId: this.roomId },
          `Connected to ${this.roomId}, but waiting for game state timed out`,
        );
        this.setErrorToken("error.connected_no_state");
      } else {
        this.setStatusToken(
          "status.timed_out_join",
          { roomId: this.roomId },
          `Timed out joining ${this.roomId}`,
        );
        this.setErrorToken("error.channel_failed");
      }
    }, GUEST_INITIAL_STATE_TIMEOUT_MS);
  }

  saveHostCheckpoint(reason = "state_change") {
    if (!this.isHost || !this.hostState) {
      return;
    }

    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    const payload = {
      version: 1,
      savedAt: Date.now(),
      reason,
      roomId: this.roomId,
      localPlayerId: this.localPlayerId,
      localName: this.localName,
      signalingUrl: this.signalingUrl,
      iceServersConfig: this.iceServersConfig,
      hostState: this.hostState,
    };

    try {
      window.localStorage.setItem(HOST_CHECKPOINT_KEY, JSON.stringify(payload));
      this.refreshHostCheckpointMeta();
    } catch {
      // Ignore checkpoint persistence failures (private mode, quota, etc).
    }
  }

  readHostCheckpoint() {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }

    const raw = window.localStorage.getItem(HOST_CHECKPOINT_KEY);
    if (!raw) {
      return null;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.roomId !== "string" ||
      typeof parsed.localPlayerId !== "string" ||
      !parsed.hostState ||
      typeof parsed.hostState !== "object"
    ) {
      return null;
    }

    return parsed;
  }

  refreshHostCheckpointMeta() {
    const checkpoint = this.readHostCheckpoint();
    if (!checkpoint) {
      this.hostCheckpointMeta = null;
      return;
    }

    const playerCount = Array.isArray(checkpoint.hostState?.players)
      ? checkpoint.hostState.players.length
      : 0;

    this.hostCheckpointMeta = {
      roomId: checkpoint.roomId,
      savedAt: Number(checkpoint.savedAt || 0),
      phase: checkpoint.hostState?.phase || "unknown",
      playerCount,
      localName: checkpoint.localName || "Host",
      signalingUrl: checkpoint.signalingUrl || this.signalingUrl,
      iceServersConfig:
        typeof checkpoint.iceServersConfig === "string"
          ? checkpoint.iceServersConfig
          : "",
    };
  }

  clearHostCheckpoint() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.removeItem(HOST_CHECKPOINT_KEY);
    } catch {
      // Ignore storage failures.
    }

    this.refreshHostCheckpointMeta();
  }

  getSavedRoomIdentity(roomId) {
    const identities = readRoomIdentities();
    const entry = identities[roomId];
    if (!entry || typeof entry !== "object" || typeof entry.playerId !== "string") {
      return null;
    }

    return {
      playerId: entry.playerId,
      lastName: typeof entry.lastName === "string" ? entry.lastName : "",
    };
  }

  saveRoomIdentity(roomId, playerId, lastName) {
    const identities = readRoomIdentities();
    identities[roomId] = {
      playerId,
      lastName,
      updatedAt: Date.now(),
    };
    writeRoomIdentities(identities);
  }

  get hasHostCheckpoint() {
    return Boolean(this.hostCheckpointMeta);
  }

  hasHostCheckpointForRoom(roomId) {
    const normalizedRoomId = String(roomId || "").trim().toUpperCase();
    if (!normalizedRoomId) {
      return false;
    }

    const checkpoint = this.readHostCheckpoint();
    if (!checkpoint || typeof checkpoint.roomId !== "string") {
      return false;
    }

    return checkpoint.roomId.trim().toUpperCase() === normalizedRoomId;
  }

  attachHostPeerLifecycleHandlers(openStatusKey) {
    if (!this.peer) {
      return;
    }

    this.peer.on("open", () => {
      this.connectionStatus = "connected";
      this.setStatusToken(
        openStatusKey,
        { roomId: this.roomId },
        this.roomId ? `Room ${this.roomId}` : "Connected",
      );
      this.broadcastState();
      this.runBotsUntilHumanNeeded();
    });

    this.peer.on("connection", (connection) => {
      this.attachHostConnection(connection);
    });

    this.peer.on("error", (error) => {
      this.connectionStatus = "error";
      this.setError(`Host peer error: ${error?.message || String(error)}`);
    });

    this.peer.on("disconnected", () => {
      this.connectionStatus = "disconnected";
      this.setStatusToken(
        "status.disconnected_signaling",
        {},
        "Disconnected from signaling service",
      );
    });
  }

  resetRuntime() {
    this.clearGuestStateTimeout();
    this.clearBotTurnTimer();

    if (this.guestConnection) {
      try {
        this.guestConnection.close();
      } catch {
        // no-op
      }
    }

    for (const connection of this.hostConnections.values()) {
      try {
        connection.close();
      } catch {
        // no-op
      }
    }

    for (const connection of this.spectatorConnections.values()) {
      try {
        connection.close();
      } catch {
        // no-op
      }
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // no-op
      }
    }

    this.peer = null;
    this.guestConnection = null;
    this.hostConnections.clear();
    this.spectatorConnections.clear();
    this.peerIdToPlayerId.clear();
    this.peerIdToSpectatorId.clear();
    this.lastPersistedDebugLogSignature = "";
  }

  persistDebugLog(state) {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    if (!state || typeof state !== "object" || !Array.isArray(state.log)) {
      return;
    }

    const roomId = String(state.roomId || this.roomId || "").trim().toUpperCase();
    if (!roomId) {
      return;
    }

    const entries = state.log.slice(-MAX_DEBUG_LOG_ENTRIES);
    const lastEntry = entries.length ? String(entries[entries.length - 1]) : "";
    const signature = `${roomId}:${entries.length}:${lastEntry}`;
    if (signature === this.lastPersistedDebugLogSignature) {
      return;
    }

    const payload = {
      version: 1,
      roomId,
      role: this.role,
      savedAt: Date.now(),
      phase: typeof state.phase === "string" ? state.phase : "unknown",
      entries,
    };

    try {
      window.localStorage.setItem(
        getDebugLogStorageKey(roomId),
        JSON.stringify(payload),
      );
      this.lastPersistedDebugLogSignature = signature;
    } catch {
      // Ignore storage failures.
    }
  }

  refreshLocalizedMessages() {
    this.statusMessage = resolveToken(this.statusMessageToken, this.statusMessage);
    if (this.errorMessageToken) {
      this.errorMessage = resolveToken(this.errorMessageToken, this.errorMessage);
    }
  }

  setStatusToken(key, params = {}, fallback = "") {
    this.statusMessageToken = createToken(key, params);
    this.statusMessage = resolveToken(this.statusMessageToken, fallback);
  }

  setErrorToken(key, params = {}, fallback = "") {
    this.errorMessageToken = createToken(key, params);
    this.errorMessage = resolveToken(this.errorMessageToken, fallback);
  }

  setError(message) {
    const token = localizeKnownError(message);
    if (token) {
      this.errorMessageToken = token;
      this.errorMessage = resolveToken(token, "");
      return;
    }
    this.errorMessageToken = null;
    this.errorMessage = String(message || "");
  }

  clearError() {
    this.errorMessageToken = null;
    this.errorMessage = "";
  }

  get isHost() {
    return this.role === "host";
  }

  get isGuest() {
    return this.role === "guest";
  }

  get isSpectator() {
    return this.isGuest && this.guestViewRole === "spectator";
  }

  get localPlayer() {
    return (
      this.viewState?.players?.find(
        (player) => player.id === this.localPlayerId,
      ) || null
    );
  }

  get canStartGame() {
    return this.isHost && this.hostState?.phase === PHASES.LOBBY;
  }

  createPeer(peerId) {
    const options = parseSignalingUrl(this.signalingUrl);
    return new Peer(peerId, {
      ...options,
      config: {
        iceServers: this.iceServers,
      },
    });
  }

  async createRoom({ name, signalingUrl, botCount = 0, iceServersJson }: { name: string; signalingUrl: string; botCount?: number; iceServersJson?: string }) {
    this.clearError();
    this.resetRuntime();

    this.role = "host";
    this.guestViewRole = "player";
    this.localName = normalizePlayerName(name) || "Host";
    this.localPlayerId = uuidv4();
    this.signalingUrl = signalingUrl?.trim() || this.signalingUrl;

    const iceConfig = normalizeIceConfig(iceServersJson);
    if (!iceConfig.ok) {
      this.connectionStatus = "error";
      this.setStatusToken("status.invalid_ice", {}, "Invalid ICE/TURN configuration");
      this.setError(iceConfig.error);
      return false;
    }
    this.iceServersConfig = iceConfig.raw;
    this.iceServers = iceConfig.iceServers;

    this.roomId = generateRoomCode();
    this.connectionStatus = "connecting";
    this.setStatusToken("status.creating_room", {}, "Creating room...");

    this.hostState = createLobbyState({
      roomId: this.roomId,
      hostPlayer: {
        id: this.localPlayerId,
        name: this.localName,
      },
    });

    for (let index = 0; index < botCount; index += 1) {
      this.addBot();
    }

    this.refreshLocalView();

    try {
      this.peer = this.createPeer(this.roomId);
    } catch (error) {
      this.setError(
        `Could not initialize host peer: ${error?.message || String(error)}`,
      );
      this.connectionStatus = "error";
      this.setStatusToken("status.failed_create_room", {}, "Failed to create room");
      return false;
    }

    this.attachHostPeerLifecycleHandlers("status.room_open");

    return true;
  }

  async resumeHostFromCheckpoint({
    signalingUrl,
    iceServersJson,
  }: { signalingUrl?: string; iceServersJson?: string } = {}) {
    this.clearError();
    this.resetRuntime();

    const checkpoint = this.readHostCheckpoint();
    if (!checkpoint) {
      this.connectionStatus = "error";
      this.setStatusToken("status.no_checkpoint", {}, "No saved host checkpoint found");
      this.setErrorToken("error.no_checkpoint");
      return false;
    }

    this.role = "host";
    this.guestViewRole = "player";
    this.roomId = checkpoint.roomId;
    this.localPlayerId = checkpoint.localPlayerId;
    this.localName = checkpoint.localName || "Host";
    this.signalingUrl =
      signalingUrl?.trim() ||
      checkpoint.signalingUrl?.trim() ||
      this.signalingUrl;

    const checkpointIceConfig =
      typeof checkpoint.iceServersConfig === "string"
        ? checkpoint.iceServersConfig
        : "";
    const iceConfig = normalizeIceConfig(
      typeof iceServersJson === "string" ? iceServersJson : checkpointIceConfig,
    );
    if (!iceConfig.ok) {
      this.connectionStatus = "error";
      this.setStatusToken("status.invalid_ice", {}, "Invalid ICE/TURN configuration");
      this.setError(iceConfig.error);
      return false;
    }
    this.iceServersConfig = iceConfig.raw;
    this.iceServers = iceConfig.iceServers;

    this.connectionStatus = "connecting";
    this.setStatusToken("status.resuming_room", { roomId: this.roomId }, `Resuming ${this.roomId}...`);
    this.hostState = checkpoint.hostState;

    if (!this.hostState || typeof this.hostState !== "object") {
      this.connectionStatus = "error";
      this.setStatusToken("status.invalid_checkpoint", {}, "Invalid checkpoint data");
      this.setErrorToken("error.invalid_checkpoint");
      return false;
    }

    if (!Array.isArray(this.hostState.players)) {
      this.hostState.players = [];
    }

    for (const player of this.hostState.players) {
      if (player.id === this.localPlayerId || player.isBot) {
        player.connected = true;
      } else {
        player.connected = false;
      }
    }

    this.refreshLocalView();

    try {
      this.peer = this.createPeer(this.roomId);
    } catch (error) {
      this.setError(
        `Could not initialize resumed host peer: ${error?.message || String(error)}`,
      );
      this.connectionStatus = "error";
      this.setStatusToken("status.failed_resume", {}, "Failed to resume room");
      return false;
    }

    this.attachHostPeerLifecycleHandlers("status.room_resumed");
    this.saveHostCheckpoint("resume");
    return true;
  }

  async joinRoom({
    roomId,
    name,
    signalingUrl,
    iceServersJson,
    asSpectator = false,
    preserveStartedJoinFallbackToSpectatorTried = false,
  }: {
    roomId: string;
    name: string;
    signalingUrl: string;
    iceServersJson?: string;
    asSpectator?: boolean;
    preserveStartedJoinFallbackToSpectatorTried?: boolean;
  }) {
    const previousFallbackRetry = this.startedJoinFallbackToSpectatorTried;
    this.clearError();
    this.resetRuntime();
    this.startedJoinFallbackToSpectatorTried = preserveStartedJoinFallbackToSpectatorTried
      ? previousFallbackRetry
      : false;

    this.role = "guest";
    this.guestViewRole = asSpectator ? "spectator" : "player";
    this.roomId = roomId?.trim().toUpperCase() || "";
    const savedIdentity = asSpectator ? null : this.getSavedRoomIdentity(this.roomId);
    this.localPlayerId = asSpectator
      ? `spectator-${uuidv4()}`
      : savedIdentity?.playerId || uuidv4();
    this.localName = normalizePlayerName(name)
      || normalizePlayerName(savedIdentity?.lastName)
      || (asSpectator ? "Spectator" : "Guest");
    if (!asSpectator) {
      this.saveRoomIdentity(this.roomId, this.localPlayerId, this.localName);
    }
    this.signalingUrl = signalingUrl?.trim() || this.signalingUrl;

    const iceConfig = normalizeIceConfig(iceServersJson);
    if (!iceConfig.ok) {
      this.connectionStatus = "error";
      this.setStatusToken("status.invalid_ice", {}, "Invalid ICE/TURN configuration");
      this.setError(iceConfig.error);
      return false;
    }
    this.iceServersConfig = iceConfig.raw;
    this.iceServers = iceConfig.iceServers;

    this.connectionStatus = "connecting";
    this.setStatusToken("status.joining_room", { roomId: this.roomId }, `Joining ${this.roomId}...`);
    this.hostState = null;
    this.viewState = null;

    try {
      this.peer = this.createPeer(undefined);
    } catch (error) {
      this.connectionStatus = "error";
      this.setStatusToken("status.failed_create_guest", {}, "Failed to create guest peer");
      this.setError(
        `Could not initialize guest peer: ${error?.message || String(error)}`,
      );
      return false;
    }

    this.peer.on("open", () => {
      this.connectGuestToHost();
    });

    this.peer.on("error", (error) => {
      this.connectionStatus = "error";
      this.setError(`Guest peer error: ${error?.message || String(error)}`);
    });

    this.peer.on("disconnected", () => {
      this.connectionStatus = "disconnected";
      this.setStatusToken(
        "status.disconnected_signaling",
        {},
        "Disconnected from signaling service",
      );
    });

    this.scheduleGuestStateTimeout();
    return true;
  }

  connectGuestToHost() {
    this.guestConnection = this.peer.connect(this.roomId, {
      reliable: true,
      serialization: "json",
    });

    this.guestConnection.on("open", () => {
      this.connectionStatus = "connected";
      this.setStatusToken(
        "status.connected_waiting_host",
        { roomId: this.roomId },
        `Connected to room ${this.roomId}. Waiting for host state...`,
      );
      this.guestConnection.send({
        type: "intro",
        playerId: this.localPlayerId,
        name: this.localName,
        viewerRole: this.guestViewRole,
      });

      this.scheduleGuestStateTimeout();
    });

    this.guestConnection.on("data", (raw) => {
      const message = coerceMessage(raw);
      this.handleGuestMessage(message);
    });

    this.guestConnection.on("close", () => {
      this.connectionStatus = "disconnected";
      this.setStatusToken("status.connection_closed", {}, "Connection to host closed");
      this.clearGuestStateTimeout();
    });

    this.guestConnection.on("error", (error) => {
      this.connectionStatus = "error";
      this.setError(
        `Guest connection error: ${error?.message || String(error)}`,
      );
      this.clearGuestStateTimeout();
    });
  }

  attachHostConnection(connection) {
    connection.on("open", () => {
      connection.send({ type: "hello" });
    });

    connection.on("data", (raw) => {
      const message = coerceMessage(raw);
      this.handleHostMessage(connection, message);
    });

    connection.on("close", () => {
      const playerId = this.peerIdToPlayerId.get(connection.peer);
      if (playerId) {
        this.peerIdToPlayerId.delete(connection.peer);
        this.hostConnections.delete(playerId);
        if (this.hostState) {
          const player = this.hostState.players.find(
            (entry) => entry.id === playerId,
          );
          if (player?.connected) {
            markPlayerConnection(this.hostState, playerId, false);
          }

          if (this.hostState.phase === PHASES.LOBBY) {
            removePlayerFromLobby(this.hostState, playerId);
          }
          this.broadcastState();
        }
        return;
      }

      const spectatorId = this.peerIdToSpectatorId.get(connection.peer);
      if (spectatorId) {
        this.peerIdToSpectatorId.delete(connection.peer);
        this.spectatorConnections.delete(spectatorId);
      }
    });

    connection.on("error", (error) => {
      this.setError(
        `Host connection error: ${error?.message || String(error)}`,
      );
    });
  }

  handleHostMessage(connection, message) {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "intro") {
      const playerId = message.playerId;
      const name = normalizePlayerName(message.name) || "Guest";
      const requestedViewerRole = message.viewerRole === "spectator" ? "spectator" : "player";
      const hasStarted = this.hostState.phase !== PHASES.LOBBY;
      const allowStartedSpectatorJoin = Boolean(this.hostState.settings?.allowSpectatorJoinAfterStart);

      if (!playerId) {
        connection.send({ type: "error", message: "Missing player id." });
        connection.close();
        return;
      }

      const existing = this.hostState.players.find(
        (player) => player.id === playerId,
      );
      const canAutoSpectateLateJoin = Boolean(hasStarted && !existing && allowStartedSpectatorJoin);

      if (requestedViewerRole === "spectator" && hasStarted && !allowStartedSpectatorJoin) {
        connection.send({
          type: "error",
          message: "Game already started. New players cannot join.",
          errorKey: "error.game_started_no_join",
        });
        connection.close();
        return;
      }

      if (requestedViewerRole === "spectator" || canAutoSpectateLateJoin) {
        const spectatorId = String(playerId);
        this.peerIdToSpectatorId.set(connection.peer, spectatorId);
        this.spectatorConnections.set(spectatorId, connection);

        connection.send({
          type: "intro_ack",
          roomId: this.roomId,
          hostId: this.localPlayerId,
          viewerRole: "spectator",
        });

        this.broadcastState();
        return;
      }

      if (hasStarted && !existing) {
        connection.send({
          type: "error",
          message: "Game already started. New players cannot join.",
        });
        connection.close();
        return;
      }

      if (existing) {
        existing.name = name;
        markPlayerConnection(this.hostState, playerId, true);
      } else {
        const addResult = addPlayerToLobby(this.hostState, {
          id: playerId,
          name,
          connected: true,
          isBot: false,
        });
        if (!addResult.ok) {
          connection.send({ type: "error", message: addResult.error });
          connection.close();
          return;
        }
      }

      this.peerIdToPlayerId.set(connection.peer, playerId);
      this.hostConnections.set(playerId, connection);

      connection.send({
        type: "intro_ack",
        roomId: this.roomId,
        hostId: this.localPlayerId,
        viewerRole: "player",
      });

      this.broadcastState();
      return;
    }

    if (message.type === "action") {
      const playerId = this.peerIdToPlayerId.get(connection.peer);
      if (!playerId) {
        const spectatorId = this.peerIdToSpectatorId.get(connection.peer);
        if (spectatorId) {
          connection.send({
            type: "error",
            message: "Spectators cannot send game actions.",
            errorKey: "error.spectators_cannot_act",
          });
        } else {
          connection.send({ type: "error", message: "Not registered in room." });
        }
        return;
      }
      this.applyHostAction(playerId, message.action, connection);
      return;
    }

    if (message.type === "rename") {
      const playerId = this.peerIdToPlayerId.get(connection.peer);
      if (!playerId) {
        connection.send({ type: "error", message: "Not registered in room." });
        return;
      }

      if (!this.hostState || this.hostState.phase !== PHASES.LOBBY) {
        connection.send({
          type: "error",
          message: "You can only rename while the room is in lobby.",
        });
        return;
      }

      const player = this.hostState.players.find((entry) => entry.id === playerId);
      if (!player) {
        connection.send({ type: "error", message: "Player not found." });
        return;
      }

      const nextName = normalizePlayerName(message.name);
      if (!nextName) {
        connection.send({ type: "error", message: "Name cannot be empty." });
        return;
      }

      const previousName = player.name;
      player.name = nextName;
      pushLogEvent(
        this.hostState,
        "player_renamed",
        {
          playerId,
          previousName,
          nextName,
        },
        `${previousName} is now known as ${nextName}.`,
      );
      this.saveHostCheckpoint("rename_player");
      this.broadcastState();
    }
  }

  handleGuestMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "state") {
      this.viewState = sanitizeStateForViewer(
        message.state,
        this.localPlayerId,
      );
      this.persistDebugLog(this.viewState);
      this.setStatusToken(
        "status.room_title",
        { roomId: message.state.roomId },
        `Room ${message.state.roomId}`,
      );
      this.clearGuestStateTimeout();
      return;
    }

    if (message.type === "error") {
      const tokenKey = typeof message.errorKey === "string" && message.errorKey
        ? message.errorKey
        : localizeKnownError(message.message || "")?.key;
      const canRetryAsSpectator = Boolean(
        this.role === "guest"
        && this.guestViewRole === "player"
        && !this.startedJoinFallbackToSpectatorTried
        && tokenKey === "error.game_started_no_join",
      );
      if (canRetryAsSpectator) {
        this.startedJoinFallbackToSpectatorTried = true;
        void this.joinRoom({
          roomId: this.roomId,
          name: this.localName || "Spectator",
          signalingUrl: this.signalingUrl,
          iceServersJson: this.iceServersConfig,
          asSpectator: true,
          preserveStartedJoinFallbackToSpectatorTried: true,
        });
        return;
      }

      if (typeof message.errorKey === "string" && message.errorKey) {
        this.setErrorToken(
          message.errorKey,
          typeof message.errorParams === "object" && message.errorParams ? message.errorParams : {},
          message.message || "",
        );
      } else {
        this.setError(message.message || "Host rejected request");
      }
      this.clearGuestStateTimeout();
      return;
    }

    if (message.type === "intro_ack") {
      if (message.viewerRole === "spectator") {
        this.guestViewRole = "spectator";
      } else if (message.viewerRole === "player") {
        this.guestViewRole = "player";
      }

      this.setStatusToken(
        "status.joined_syncing",
        { roomId: message.roomId },
        `Joined room ${message.roomId}. Syncing state...`,
      );
      this.scheduleGuestStateTimeout();
    }
  }

  refreshLocalView() {
    if (!this.hostState) {
      return;
    }
    const spectatorCount = this.spectatorConnections.size;
    const state = {
      ...toPublicState(this.hostState, this.localPlayerId),
      spectatorCount,
    };
    this.viewState = sanitizeStateForViewer(state, this.localPlayerId);
    this.persistDebugLog(this.hostState);
  }

  broadcastState() {
    if (!this.hostState) {
      return;
    }

    this.refreshLocalView();

    for (const [playerId, connection] of this.hostConnections.entries()) {
      if (!connection.open) {
        continue;
      }
      try {
        const spectatorCount = this.spectatorConnections.size;
        const scopedState = sanitizeStateForViewer(
          {
            ...toPublicState(this.hostState, playerId),
            spectatorCount,
          },
          playerId,
        );
        connection.send({
          type: "state",
          state: scopedState,
        });
      } catch (error) {
        this.setError(
          `Could not send state to ${playerId}: ${error?.message || String(error)}`,
        );
      }
    }

    const spectatorCount = this.spectatorConnections.size;
    const spectatorState = sanitizeStateForViewer(
      {
        ...toPublicState(this.hostState, ""),
        spectatorCount,
      },
      "",
    );
    for (const [spectatorId, connection] of this.spectatorConnections.entries()) {
      if (!connection.open) {
        continue;
      }

      try {
        connection.send({
          type: "state",
          state: spectatorState,
        });
      } catch (error) {
        this.setError(
          `Could not send state to spectator ${spectatorId}: ${error?.message || String(error)}`,
        );
      }
    }
  }

  applyHostAction(actorId, action, sourceConnection = null) {
    if (!this.hostState) {
      return;
    }

    const result = applyAction(this.hostState, actorId, action);
    if (!result.ok) {
      if (sourceConnection && sourceConnection.open) {
        sourceConnection.send({
          type: "error",
          message: result.error,
          errorKey: result.errorKey,
          errorParams: result.errorParams,
        });
      }
      if (actorId === this.localPlayerId) {
        if (result.errorKey) {
          this.setErrorToken(result.errorKey, result.errorParams || {}, result.error || "");
        } else {
          this.setError(result.error);
        }
      }
      return;
    }

    this.clearError();
    this.runBotsUntilHumanNeeded();
    this.saveHostCheckpoint("action");
    this.broadcastState();
  }

  runBotsUntilHumanNeeded() {
    if (!this.hostState || this.botTurnTimerHandle) {
      return;
    }

    if (
      this.hostState.phase === PHASES.GAME_OVER ||
      this.hostState.phase === PHASES.LOBBY
    ) {
      return;
    }

    const actorId = getExpectedActorId(this.hostState);
    const actor = this.hostState.players.find((player) => player.id === actorId);
    if (!actor || !actor.isBot) {
      return;
    }

    const fastBotTurns = Boolean(this.hostState.settings?.fastBotTurns);
    const thinkBase = fastBotTurns ? FAST_BOT_THINK_BASE_MS : BOT_THINK_BASE_MS;
    const thinkJitter = fastBotTurns ? FAST_BOT_THINK_JITTER_MS : BOT_THINK_JITTER_MS;
    const delay = thinkBase + Math.floor(Math.random() * thinkJitter);
    this.botTurnTimerHandle = setTimeout(() => {
      this.botTurnTimerHandle = null;

      if (!this.hostState) {
        return;
      }

      if (
        this.hostState.phase === PHASES.GAME_OVER ||
        this.hostState.phase === PHASES.LOBBY
      ) {
        return;
      }

      const actingId = getExpectedActorId(this.hostState);
      const actingBot = this.hostState.players.find((player) => player.id === actingId);
      if (!actingBot || !actingBot.isBot) {
        return;
      }

      const botStrategy = resolveBotStrategy(this.hostState.settings?.botStrategy || DEFAULT_BOT_STRATEGY);
      const botAction = chooseBotAction(this.hostState, actingBot.id, botStrategy);
      if (!botAction) {
        return;
      }

      const result = applyAction(this.hostState, actingBot.id, botAction);
      if (!result.ok) {
        pushLogEvent(
          this.hostState,
          "bot_action_failed",
          {
            playerId: actingBot.id,
            playerName: actingBot.name,
            error: result.error || "Unknown action failure",
          },
          `Bot action failed for ${actingBot.name}: ${result.error}`,
        );
        this.saveHostCheckpoint("bot_action_error");
        this.broadcastState();
        return;
      }

      this.clearError();
      this.saveHostCheckpoint("bot_action");
      this.broadcastState();
      this.runBotsUntilHumanNeeded();
    }, delay);
  }

  sendAction(action) {
    this.clearError();

    if (this.isSpectator) {
      this.setErrorToken("error.spectators_cannot_act");
      return;
    }

    if (this.isHost) {
      this.applyHostAction(this.localPlayerId, action);
      return;
    }

    if (!this.guestConnection || !this.guestConnection.open) {
      this.setError("Not connected to host.");
      return;
    }

    this.guestConnection.send({
      type: "action",
      action,
    });
  }

  addBot() {
    if (
      !this.isHost ||
      !this.hostState ||
      this.hostState.phase !== PHASES.LOBBY
    ) {
      return;
    }

    const botId = `bot-${uuidv4()}`;
    const botName = `Bot ${this.hostState.players.filter((player) => player.isBot).length + 1}`;
    const result = addPlayerToLobby(this.hostState, {
      id: botId,
      name: botName,
      isBot: true,
      connected: true,
    });
    if (!result.ok) {
      this.setError(result.error);
      return;
    }
    this.clearError();
    this.saveHostCheckpoint("add_bot");
    this.broadcastState();
  }

  renameLobbyParticipant(playerId, name) {
    const nextName = normalizePlayerName(name);
    if (!nextName) {
      this.setError("Name cannot be empty.");
      return;
    }

    if (this.isHost) {
      if (!this.hostState || this.hostState.phase !== PHASES.LOBBY) {
        return;
      }

      const player = this.hostState.players.find((entry) => entry.id === playerId);
      if (!player) {
        return;
      }

      if (!(player.id === this.localPlayerId || player.isBot)) {
        return;
      }

      if (player.name === nextName) {
        return;
      }

      const previousName = player.name;
      player.name = nextName;
      pushLogEvent(
        this.hostState,
        "player_renamed",
        {
          playerId,
          previousName,
          nextName,
        },
        `${previousName} is now known as ${nextName}.`,
      );

      if (player.id === this.localPlayerId) {
        this.localName = nextName;
        if (this.roomId) {
          this.saveRoomIdentity(this.roomId, this.localPlayerId, nextName);
        }
      }

      this.clearError();
      this.saveHostCheckpoint("rename_player");
      this.broadcastState();
      return;
    }

    if (!this.isGuest || playerId !== this.localPlayerId) {
      return;
    }

    if (!this.viewState || this.viewState.phase !== PHASES.LOBBY) {
      this.setError("You can only rename yourself in the lobby.");
      return;
    }

    if (!this.guestConnection || !this.guestConnection.open) {
      this.setError("Not connected to host.");
      return;
    }

    this.localName = nextName;
    if (this.roomId) {
      this.saveRoomIdentity(this.roomId, this.localPlayerId, nextName);
    }
    this.clearError();
    this.guestConnection.send({
      type: "rename",
      name: nextName,
    });
  }

  removeBot(botId) {
    if (
      !this.isHost ||
      !this.hostState ||
      this.hostState.phase !== PHASES.LOBBY
    ) {
      return;
    }

    const bot = this.hostState.players.find(
      (player) => player.id === botId && player.isBot,
    );
    if (!bot) {
      return;
    }

    removePlayerFromLobby(this.hostState, botId);
    this.saveHostCheckpoint("remove_bot");
    this.broadcastState();
  }

  updateLobbySettings(settingsPatch) {
    if (
      !this.isHost ||
      !this.hostState ||
      this.hostState.phase !== PHASES.LOBBY
    ) {
      return;
    }

    const result = setLobbySettings(
      this.hostState,
      this.localPlayerId,
      settingsPatch,
    );
    if (!result.ok) {
      this.setError(result.error);
      return;
    }

    this.clearError();
    this.saveHostCheckpoint("update_settings");
    this.broadcastState();
  }

  startGame() {
    if (!this.isHost || !this.hostState) {
      return;
    }

    const result = startGame(this.hostState);
    if (!result.ok) {
      this.setError(result.error);
      return;
    }

    this.clearError();
    this.runBotsUntilHumanNeeded();
    this.saveHostCheckpoint("start_game");
    this.broadcastState();
  }

  leaveRoom() {
    this.resetRuntime();
    this.role = "idle";
    this.guestViewRole = "player";
    this.startedJoinFallbackToSpectatorTried = false;
    this.roomId = "";
    this.hostState = null;
    this.viewState = null;
    this.connectionStatus = "idle";
    this.setStatusToken("status.not_connected", {}, "Not connected");
    this.clearError();
  }
}

export const appStore = new AppStore();
