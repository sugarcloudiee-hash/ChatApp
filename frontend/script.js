const messagesEl = document.getElementById("messages");
const presenceEl = document.getElementById("presence");
const typingIndicator = document.getElementById("typingIndicator");
const syncPlayerPanel = document.getElementById("syncPlayerPanel");
const syncPlayerTitle = document.getElementById("syncPlayerTitle");
const syncPlayerStatus = document.getElementById("syncPlayerStatus");
const syncVideo = document.getElementById("syncVideo");
const syncAudio = document.getElementById("syncAudio");
const syncEmbed = document.getElementById("syncEmbed");
const syncExternalCard = document.getElementById("syncExternalCard");
const syncExternalLink = document.getElementById("syncExternalLink");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const filePreview = document.getElementById("filePreview");

const loginOverlay = document.getElementById("loginOverlay");
const meLabel = document.getElementById("meLabel");
const roomKeyLabel = document.getElementById("roomKeyLabel");
const copyInviteBtn = document.getElementById("copyInviteBtn");
const connectionStatus = document.getElementById("connectionStatus");
const hostBadge = document.getElementById("hostBadge");
const memberBadge = document.getElementById("memberBadge");
const changeUserBtn = document.getElementById("changeUserBtn");
const toastContainer = document.getElementById("toastContainer");
const pendingModal = document.getElementById("pendingModal");
const pendingModalContent = document.getElementById("pendingModalContent");
const pendingModalClose = document.getElementById("pendingModalClose");
const overlayDialog = document.getElementById("loginOverlay");
let overlayKeydownHandler = null;
let modalKeydownHandler = null;

const authSection = document.getElementById("authSection");
const roomSetupSection = document.getElementById("roomSetupSection");
const authTabLogin = document.getElementById("authTabLogin");
const authTabSignup = document.getElementById("authTabSignup");
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");
const authSubmitBtn = document.getElementById("authSubmitBtn");

const createTabBtn = document.getElementById("tabCreate");
const joinTabBtn = document.getElementById("tabJoin");

// Create Room Screen
const createScreen = document.getElementById("createScreen");
const createRoomKey = document.getElementById("createRoomKey");
const generateKeyBtn = document.getElementById("generateKeyBtn");
const roomPrivacy = document.getElementById("roomPrivacy");
const createSubmitBtn = document.getElementById("createSubmitBtn");

// Join Room Screen
const joinScreen = document.getElementById("joinScreen");
const joinRoomKey = document.getElementById("joinRoomKey");
const joinInviteToken = document.getElementById("joinInviteToken");
const joinSubmitBtn = document.getElementById("joinSubmitBtn");
const inviteByUsernameWrap = document.getElementById("inviteByUsernameWrap");
const inviteUsernameInput = document.getElementById("inviteUsernameInput");
const inviteUsernameBtn = document.getElementById("inviteUsernameBtn");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authConfirmPassword = document.getElementById("authConfirmPassword");

const REACTION_EMOJIS = ["\u2764\uFE0F", "\uD83D\uDC4D", "\uD83D\uDE02", "\uD83C\uDF89", "\uD83D\uDE2E"];
// Use your backend Flask server URL here.
// If you deploy the frontend separately, this should point to the backend service URL.
// Replace the default URL below with your Render service URL if different.
const BACKEND_BASE_URL = window.BACKEND_BASE_URL || window.location.origin;
const SUPABASE_URL = window.SUPABASE_URL || "https://qxsatceefmktxnyxoevy.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4c2F0Y2VlZm1rdHhueXhvZXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDg3MzgsImV4cCI6MjA5MTM4NDczOH0._FJvDdLXA6JdKhOU3O0oK6Lfi1fcRTCAaaHsp-Ehj20";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let supabaseSession = null;
let supabaseUser = null;
let socket = null;
let username = "";
let displayName = "";
let roomKey = "";
let avatar = "";
let typingTimeout = null;
let isTyping = false;
let isHost = false;
let awaitingApproval = false;
let pendingRequests = [];  // For host: list of pending join requests
let roomMemberCount = 0;  // Current members in room
let roomIsPrivate = true;
let roomInviteToken = "";
let roomInviteLink = "";
let currentAuthMode = "login";
let suppressVideoSync = false;

function extractFirstUrl(text) {
  const input = String(text || "").trim();
  if (!input) return "";
  const match = input.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

function normalizeUrl(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}

function parseYouTubeId(urlObj) {
  const host = (urlObj.hostname || "").toLowerCase();
  if (host === "youtu.be") {
    return urlObj.pathname.replace(/^\//, "").split("/")[0] || "";
  }
  if (host.endsWith("youtube.com")) {
    if (urlObj.pathname === "/watch") {
      return urlObj.searchParams.get("v") || "";
    }
    if (urlObj.pathname.startsWith("/shorts/")) {
      return urlObj.pathname.split("/")[2] || "";
    }
    if (urlObj.pathname.startsWith("/embed/")) {
      return urlObj.pathname.split("/")[2] || "";
    }
  }
  return "";
}

function parseGoogleDriveId(urlObj) {
  const host = (urlObj.hostname || "").toLowerCase();
  if (!host.endsWith("drive.google.com")) return "";

  const fromQuery = urlObj.searchParams.get("id");
  if (fromQuery) return fromQuery;

  const filePattern = urlObj.pathname.match(/\/file\/d\/([^/]+)/i);
  if (filePattern && filePattern[1]) return filePattern[1];

  const ucPattern = urlObj.pathname.match(/\/uc$/i);
  if (ucPattern) {
    return urlObj.searchParams.get("export") ? (urlObj.searchParams.get("id") || "") : "";
  }

  return "";
}

function resolveDropboxVideoUrl(urlObj) {
  const host = (urlObj.hostname || "").toLowerCase();
  if (host.endsWith("dropboxusercontent.com")) {
    return urlObj.toString();
  }
  if (!host.endsWith("dropbox.com")) return "";

  const direct = new URL(urlObj.toString());
  direct.searchParams.delete("dl");
  direct.searchParams.set("raw", "1");
  return direct.toString();
}

function isGooglePhotosUrl(urlObj) {
  const host = (urlObj.hostname || "").toLowerCase();
  return host === "photos.google.com" || host.endsWith(".photos.google.com");
}

function resolveStreamSource(input, preferredKind = "") {
  const urlText = normalizeUrl(input);
  if (!urlText) return null;

  let urlObj;
  try {
    urlObj = new URL(urlText);
  } catch {
    return null;
  }

  const forceKind = String(preferredKind || "").trim().toLowerCase();
  const ext = (urlObj.pathname.split(".").pop() || "").toLowerCase();
  const directVideoExts = new Set(["mp4", "webm", "ogg", "ogv", "mov", "m4v"]);
  const directAudioExts = new Set(["mp3", "wav", "m4a", "aac", "oga", "ogg", "opus", "flac", "webm"]);

  const youtubeId = parseYouTubeId(urlObj);
  if (youtubeId) {
    return {
      kind: "embed",
      provider: "YouTube",
      sourceUrl: urlText,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`,
      label: "YouTube stream",
    };
  }

  const driveId = parseGoogleDriveId(urlObj);
  if (driveId) {
    return {
      kind: "embed",
      provider: "Google Drive",
      sourceUrl: urlText,
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      label: "Google Drive stream",
    };
  }

  const dropboxVideoUrl = resolveDropboxVideoUrl(urlObj);
  if (dropboxVideoUrl) {
    return {
      kind: "video",
      provider: "Dropbox",
      sourceUrl: dropboxVideoUrl,
      embedUrl: "",
      label: "Dropbox stream",
    };
  }

  if (isGooglePhotosUrl(urlObj)) {
    return {
      kind: "external",
      provider: "Google Photos",
      sourceUrl: urlText,
      embedUrl: "",
      label: "Google Photos link",
    };
  }

  if (forceKind === "embed") {
    return null;
  }

  if (forceKind === "audio") {
    return {
      kind: "audio",
      provider: "Direct",
      sourceUrl: urlText,
      embedUrl: "",
      label: "Shared audio",
    };
  }

  if (forceKind === "video" || directVideoExts.has(ext) || urlObj.pathname.includes("/download/")) {
    return {
      kind: "video",
      provider: "Direct",
      sourceUrl: urlText,
      embedUrl: "",
      label: "Shared video",
    };
  }

  if (directAudioExts.has(ext)) {
    return {
      kind: "audio",
      provider: "Direct",
      sourceUrl: urlText,
      embedUrl: "",
      label: "Shared audio",
    };
  }

  return null;
}

function createStreamActionButton(streamInfo, title, sourceKind = "") {
  if (!streamInfo) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sync-video-btn";
  if (streamInfo.kind === "embed") {
    button.textContent = `Open ${streamInfo.provider} stream`;
  } else if (streamInfo.kind === "external") {
    button.textContent = `Open ${streamInfo.provider} link`;
  } else if (streamInfo.kind === "audio") {
    button.textContent = "Listen together";
  } else {
    button.textContent = streamInfo.provider === "Dropbox" ? "Watch Dropbox stream" : "Watch together";
  }
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    loadSyncedVideo(streamInfo.sourceUrl, title || streamInfo.label, sourceKind || streamInfo.kind);
  });
  return button;
}

function getSyncedVideoPayload() {
  if (!syncVideo || !syncAudio) return null;

  if (!syncAudio.classList.contains("hidden") && syncAudio.src) {
    return {
      source_url: syncAudio.dataset.sourceUrl || syncAudio.src,
      source_kind: syncAudio.dataset.sourceKind || "audio",
      source_title: syncPlayerTitle ? syncPlayerTitle.textContent : "",
      current_time: Number.isFinite(syncAudio.currentTime) ? syncAudio.currentTime : 0,
      playing: !syncAudio.paused,
      playback_rate: syncAudio.playbackRate || 1,
    };
  }

  if (!syncVideo.src || syncVideo.classList.contains("hidden")) return null;
  return {
    source_url: syncVideo.dataset.sourceUrl || syncVideo.src,
    source_kind: syncVideo.dataset.sourceKind || "video",
    source_title: syncPlayerTitle ? syncPlayerTitle.textContent : "",
    current_time: Number.isFinite(syncVideo.currentTime) ? syncVideo.currentTime : 0,
    playing: !syncVideo.paused,
    playback_rate: syncVideo.playbackRate || 1,
  };
}

function setSyncPlayerVisible(visible) {
  if (!syncPlayerPanel) return;
  syncPlayerPanel.classList.toggle("hidden", !visible);
}

function updateSyncPlayerStatus(text) {
  if (syncPlayerStatus) {
    syncPlayerStatus.textContent = text;
  }
}

function applySyncedVideoState(state) {
  if (!syncVideo) return;
  if (!state || !state.source_url) {
    syncVideo.pause();
    syncVideo.removeAttribute("src");
    syncVideo.load();
    syncVideo.classList.remove("hidden");
    delete syncVideo.dataset.sourceKind;
    if (syncAudio) {
      syncAudio.pause();
      syncAudio.removeAttribute("src");
      syncAudio.load();
      syncAudio.classList.add("hidden");
      delete syncAudio.dataset.sourceKind;
    }
    if (syncEmbed) {
      syncEmbed.classList.add("hidden");
      syncEmbed.removeAttribute("src");
    }
    if (syncExternalCard) {
      syncExternalCard.classList.add("hidden");
    }
    if (syncExternalLink) {
      syncExternalLink.removeAttribute("href");
    }
    setSyncPlayerVisible(false);
    if (syncPlayerTitle) syncPlayerTitle.textContent = "No shared media loaded";
    updateSyncPlayerStatus("Idle");
    return;
  }

  const nextSource = state.source_url;
  const sourceKind = String(state.source_kind || "").trim().toLowerCase();
  const streamInfo = resolveStreamSource(nextSource, sourceKind);
  if (!streamInfo) {
    updateSyncPlayerStatus("Unsupported stream URL");
    return;
  }

  if (streamInfo.kind === "embed") {
    if (syncEmbed) {
      const currentEmbed = syncEmbed.getAttribute("src") || "";
      if (currentEmbed !== streamInfo.embedUrl) {
        syncEmbed.setAttribute("src", streamInfo.embedUrl);
      }
      syncEmbed.classList.remove("hidden");
    }
    syncVideo.pause();
    syncVideo.classList.add("hidden");
    syncVideo.removeAttribute("src");
    syncVideo.load();
    syncVideo.dataset.sourceUrl = streamInfo.sourceUrl;
    syncVideo.dataset.sourceKind = "embed";
    if (syncAudio) {
      syncAudio.pause();
      syncAudio.classList.add("hidden");
      syncAudio.removeAttribute("src");
      syncAudio.load();
    }
    if (syncExternalCard) {
      syncExternalCard.classList.add("hidden");
    }
    if (syncExternalLink) {
      syncExternalLink.removeAttribute("href");
    }
    if (syncPlayerTitle) syncPlayerTitle.textContent = state.source_title || streamInfo.label;
    setSyncPlayerVisible(true);
    updateSyncPlayerStatus("Streaming");
    return;
  }

  if (streamInfo.kind === "external") {
    if (syncEmbed) {
      syncEmbed.classList.add("hidden");
      syncEmbed.removeAttribute("src");
    }
    syncVideo.pause();
    syncVideo.classList.add("hidden");
    syncVideo.removeAttribute("src");
    syncVideo.load();
    syncVideo.dataset.sourceUrl = streamInfo.sourceUrl;
    syncVideo.dataset.sourceKind = "external";
    if (syncAudio) {
      syncAudio.pause();
      syncAudio.classList.add("hidden");
      syncAudio.removeAttribute("src");
      syncAudio.load();
    }
    if (syncExternalCard) {
      syncExternalCard.classList.remove("hidden");
    }
    if (syncExternalLink) {
      syncExternalLink.href = streamInfo.sourceUrl;
      syncExternalLink.textContent = `Open ${streamInfo.provider} in new tab`;
    }
    if (syncPlayerTitle) syncPlayerTitle.textContent = state.source_title || streamInfo.label;
    setSyncPlayerVisible(true);
    updateSyncPlayerStatus("Open link to watch");
    return;
  }

  if (streamInfo.kind === "audio" && syncAudio) {
    if (syncEmbed) {
      syncEmbed.classList.add("hidden");
      syncEmbed.removeAttribute("src");
    }
    if (syncExternalCard) {
      syncExternalCard.classList.add("hidden");
    }
    if (syncExternalLink) {
      syncExternalLink.removeAttribute("href");
    }

    syncVideo.pause();
    syncVideo.classList.add("hidden");
    syncVideo.removeAttribute("src");
    syncVideo.load();

    syncAudio.classList.remove("hidden");
    const nextTitle = state.source_title || "Shared audio";
    const nextTime = Math.max(0, Number(state.position ?? state.current_time ?? 0) || 0);
    const shouldPlay = Boolean(state.playing);
    const nextRate = Number(state.playback_rate || 1) || 1;
    const sourceChanged = syncAudio.dataset.sourceUrl !== streamInfo.sourceUrl;

    syncAudio.dataset.sourceUrl = streamInfo.sourceUrl;
    syncAudio.dataset.sourceKind = "audio";
    if (syncPlayerTitle) syncPlayerTitle.textContent = nextTitle;
    setSyncPlayerVisible(true);
    updateSyncPlayerStatus(shouldPlay ? "Playing" : "Paused");

    const finalizeAudio = () => {
      suppressVideoSync = true;
      syncAudio.playbackRate = nextRate;
      try {
        if (Math.abs(syncAudio.currentTime - nextTime) > 0.25) {
          syncAudio.currentTime = nextTime;
        }
      } catch (err) {
        console.warn("Unable to sync audio time", err);
      }
      if (shouldPlay) {
        const playPromise = syncAudio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      } else {
        syncAudio.pause();
      }
      window.setTimeout(() => {
        suppressVideoSync = false;
      }, 150);
    };

    if (sourceChanged) {
      syncAudio.src = streamInfo.sourceUrl;
      syncAudio.load();
      syncAudio.addEventListener("loadedmetadata", finalizeAudio, { once: true });
      return;
    }

    if (syncAudio.readyState >= 1) {
      finalizeAudio();
      return;
    }

    syncAudio.addEventListener("loadedmetadata", finalizeAudio, { once: true });
    return;
  }

  if (syncEmbed) {
    syncEmbed.classList.add("hidden");
    syncEmbed.removeAttribute("src");
  }
  if (syncExternalCard) {
    syncExternalCard.classList.add("hidden");
  }
  if (syncExternalLink) {
    syncExternalLink.removeAttribute("href");
  }
  if (syncAudio) {
    syncAudio.pause();
    syncAudio.classList.add("hidden");
    syncAudio.removeAttribute("src");
    syncAudio.load();
  }

  syncVideo.classList.remove("hidden");
  const nextTitle = state.source_title || "Shared video";
  const nextTime = Math.max(0, Number(state.position ?? state.current_time ?? 0) || 0);
  const shouldPlay = Boolean(state.playing);
  const nextRate = Number(state.playback_rate || 1) || 1;
  const sourceChanged = syncVideo.dataset.sourceUrl !== streamInfo.sourceUrl;

  syncVideo.dataset.sourceUrl = streamInfo.sourceUrl;
  syncVideo.dataset.sourceKind = "video";
  if (syncPlayerTitle) syncPlayerTitle.textContent = nextTitle;
  setSyncPlayerVisible(true);
  updateSyncPlayerStatus(shouldPlay ? "Playing" : "Paused");

  const finalize = () => {
    suppressVideoSync = true;
    syncVideo.playbackRate = nextRate;
    try {
      if (Math.abs(syncVideo.currentTime - nextTime) > 0.25) {
        syncVideo.currentTime = nextTime;
      }
    } catch (err) {
      console.warn("Unable to sync video time", err);
    }
    if (shouldPlay) {
      const playPromise = syncVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } else {
      syncVideo.pause();
    }
    window.setTimeout(() => {
      suppressVideoSync = false;
    }, 150);
  };

  if (sourceChanged) {
    syncVideo.src = streamInfo.sourceUrl;
    syncVideo.load();
    syncVideo.addEventListener("loadedmetadata", finalize, { once: true });
    return;
  }

  if (syncVideo.readyState >= 1) {
    finalize();
    return;
  }

  syncVideo.addEventListener("loadedmetadata", finalize, { once: true });
}

function emitSyncedVideoState() {
  if (!socket || !socket.connected || suppressVideoSync) return;
  const payload = getSyncedVideoPayload();
  if (!payload || !payload.source_url) return;
  socket.emit("video_sync_state", payload);
}

function loadSyncedVideo(sourceUrl, sourceTitle, sourceKind = "") {
  if (!sourceUrl) return;
  const streamInfo = resolveStreamSource(sourceUrl, sourceKind);
  if (!streamInfo) {
    showToast("Unsupported stream URL. Try Google Drive, Dropbox, Google Photos, YouTube, or a direct video/audio file.", { type: "error" });
    return;
  }
  applySyncedVideoState({
    source_url: streamInfo.sourceUrl,
    source_kind: streamInfo.kind,
    source_title: sourceTitle || streamInfo.label || "Shared video",
    current_time: 0,
    playing: false,
    playback_rate: 1,
  });
  if (socket && socket.connected) {
    socket.emit("video_sync_load", {
      source_url: streamInfo.sourceUrl,
      source_kind: streamInfo.kind,
      source_title: sourceTitle || streamInfo.label || "Shared video",
    });
  }
}

function setControlsEnabled(enabled) {
  if (awaitingApproval) {
    sendBtn.disabled = true;
    attachBtn.disabled = true;
  } else {
    sendBtn.disabled = !enabled;
    attachBtn.disabled = !enabled;
  }
}

function clearAuthErrors() {
  [authEmail, authPassword, authConfirmPassword].forEach((input) => {
    if (!input) return;
    const errorEl = document.getElementById(`${input.id}Error`);
    if (errorEl) {
      errorEl.textContent = "";
    }
    input.classList.remove("invalid");
  });
}

function validateAuthForm(mode = "login") {
  let valid = true;
  clearAuthErrors();

  const email = authEmail.value.trim();
  const password = authPassword.value;
  const confirmPassword = authConfirmPassword ? authConfirmPassword.value : "";

  if (!email) {
    const errorEl = document.getElementById("authEmailError");
    if (errorEl) errorEl.textContent = "Enter your email.";
    authEmail.classList.add("invalid");
    valid = false;
  } else if (!/^\S+@\S+\.\S+$/.test(email)) {
    const errorEl = document.getElementById("authEmailError");
    if (errorEl) errorEl.textContent = "Enter a valid email.";
    authEmail.classList.add("invalid");
    valid = false;
  }

  if (!password) {
    const errorEl = document.getElementById("authPasswordError");
    if (errorEl) errorEl.textContent = "Enter your password.";
    authPassword.classList.add("invalid");
    valid = false;
  }

  if (mode === "signup") {
    if (password.length < 6) {
      const errorEl = document.getElementById("authPasswordError");
      if (errorEl) errorEl.textContent = "Use at least 6 characters.";
      authPassword.classList.add("invalid");
      valid = false;
    }
    if (!confirmPassword) {
      const errorEl = document.getElementById("authConfirmPasswordError");
      if (errorEl) errorEl.textContent = "Confirm your password.";
      authConfirmPassword.classList.add("invalid");
      valid = false;
    } else if (password !== confirmPassword) {
      const errorEl = document.getElementById("authConfirmPasswordError");
      if (errorEl) errorEl.textContent = "Passwords do not match.";
      authConfirmPassword.classList.add("invalid");
      valid = false;
    }
  }

  return valid;
}

function setAuthState(user, session) {
  supabaseUser = user;
  supabaseSession = session;
  if (user) {
    username = user.email || username;
    displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || username;
    avatar = avatarForName(displayName || username);
  }
}

async function restoreAuth() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const session = data?.session;
    if (session?.user) {
      setAuthState(session.user, session);
    }
    return session;
  } catch (err) {
    console.warn("Supabase session restore failed", err);
    return null;
  }
}

async function signInWithEmail(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message || "Unable to log in.");
  }
  if (!data?.session?.user) {
    throw new Error("Login failed, please retry.");
  }
  setAuthState(data.session.user, data.session);
  return data.session;
}

async function signUpWithEmail(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    throw new Error(error.message || "Unable to create account.");
  }
  if (!data?.session?.user) {
    throw new Error("Sign-up succeeded. Check your email to verify, then log in.");
  }
  setAuthState(data.session.user, data.session);
  return data.session;
}

async function authenticate(mode = "login") {
  if (supabaseSession?.access_token) {
    return supabaseSession;
  }
  if (!validateAuthForm(mode)) {
    throw new Error("Invalid auth credentials.");
  }
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const session = mode === "signup"
    ? await signUpWithEmail(email, password)
    : await signInWithEmail(email, password);
  return session;
}

function getAuthorizationHeader() {
  return supabaseSession?.access_token ? `Bearer ${supabaseSession.access_token}` : "";
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

let lastMessageDate = "";

function shouldShowDateSeparator(messageIso) {
  const date = formatDate(messageIso);
  if (date !== lastMessageDate) {
    lastMessageDate = date;
    return date;
  }
  return null;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeText(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}

function avatarForName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function avatarColor(name) {
  let hash = 0;
  for (const ch of String(name || "")) {
    hash = (hash * 31 + ch.codePointAt(0)) % 360;
  }
  return `hsl(${hash || 200}deg 75% 55%)`;
}

function getMessageNode(messageId) {
  return Array.from(messagesEl.children).find((node) => node.dataset.id === messageId);
}

function renderPresence(members) {
  presenceEl.innerHTML = "";
  if (!members || members.length === 0) {
    presenceEl.innerHTML = '<span style="color: var(--muted); font-size: 12px;">No one else is online yet.</span>';
    return;
  }

  members.forEach((member) => {
    const isHostMarked = member.is_host;
    const pill = document.createElement("span");
    pill.className = "member-pill";
    pill.innerHTML = `
      <span class="avatar-pill" style="background:${avatarColor(member.username)}">${escapeText(member.avatar || avatarForName(member.display_name || member.username))}</span>
      <span>${escapeText(member.display_name || member.username)}${isHostMarked ? ' <span style="font-size: 14px;">👑</span>' : ''}</span>
    `;
    presenceEl.appendChild(pill);
  });
  
  const countBadge = document.createElement("span");
  countBadge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(47, 107, 255, 0.18);
    border: 1px solid rgba(47, 107, 255, 0.35);
    border-radius: 999px;
    font-size: 12px;
    color: var(--blue);
    margin-left: auto;
  `;
  countBadge.textContent = `${roomMemberCount} members`;
  presenceEl.appendChild(countBadge);
}

function renderTyping(users) {
  const others = (users || []).filter((name) => name !== username);
  if (others.length === 0) {
    typingIndicator.innerHTML = "";
    return;
  }
  const text = others.length === 1 ? `${others[0]} is typing` : `${others.join(", ")} are typing`;
  typingIndicator.innerHTML = `<span>${escapeText(text)}</span><span class="typing-dots">•••</span>`;
}

function setConnectionStatus(status) {
  connectionStatus.textContent = status;
  connectionStatus.style.color = status === 'Connected' ? '#7EE787' : status === 'Connecting…' ? '#A9D6FF' : '#FF9FAB';
}

function showEmptyState() {
  messagesEl.innerHTML = `
    <div class="empty-state">
      <div>
        <h2>No messages yet</h2>
        <p>Send the first message to start the conversation.</p>
      </div>
    </div>
  `;
}

function clearEmptyState() {
  const emptyState = messagesEl.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFileSelection(file) {
  const maxSize = 50 * 1024 * 1024;
  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/ogg",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a",
    "application/pdf",
    "text/plain",
  ];

  if (!file) return "No file selected.";
  if (file.size > maxSize) return "File is too large. Max size is 50MB.";
  if (!allowedTypes.includes(file.type)) return "File type is not supported. Allowed: PNG, JPG, GIF, MP4, MP3, WAV, OGG, M4A, PDF, TXT.";
  return null;
}

function hideFilePreview() {
  if (filePreview.dataset.previewUrl) {
    URL.revokeObjectURL(filePreview.dataset.previewUrl);
    delete filePreview.dataset.previewUrl;
  }
  filePreview.innerHTML = "";
  filePreview.classList.add("hidden");
}

function setFileUploadProgress(percent) {
  const progressBar = filePreview.querySelector(".upload-progress-bar");
  const label = filePreview.querySelector(".upload-progress-label");
  const progress = filePreview.querySelector(".upload-progress");
  if (progressBar && label && progress) {
    progress.classList.remove("hidden");
    progressBar.style.width = `${percent}%`;
    label.textContent = `Uploading... ${percent}%`;
  }
}

function showFilePreview(file) {
  hideFilePreview();
  const previewType = detectType(file);
  const previewUrl = URL.createObjectURL(file);
  filePreview.dataset.previewUrl = previewUrl;

  let previewHtml = "";
  if (previewType === "image") {
    previewHtml = `<img class="preview-media" src="${previewUrl}" alt="${escapeText(file.name)}" />`;
  } else if (previewType === "video") {
    previewHtml = `<video class="preview-media" src="${previewUrl}" controls muted playsinline></video>`;
  } else if (previewType === "audio") {
    previewHtml = `<audio class="preview-media" src="${previewUrl}" controls></audio>`;
  } else {
    previewHtml = `<div class="preview-placeholder">Preview unavailable for this file type.</div>`;
  }

  filePreview.innerHTML = `
    <div class="file-preview-card">
      ${previewHtml}
      <div class="preview-content">
        <div class="preview-details">
          <strong>${escapeText(file.name)}</strong>
          <span>${formatFileSize(file.size)} • ${escapeText(file.type || "Unknown type")}</span>
        </div>
        <div class="upload-progress hidden">
          <div class="upload-progress-bar" style="width: 0%"></div>
        </div>
        <span class="upload-progress-label"></span>
        <div class="file-preview-actions">
          <button type="button" class="btn ghost small" data-action="cancel">Cancel</button>
          <button type="button" class="btn primary small" data-action="send">Send file</button>
        </div>
      </div>
    </div>
  `;

  const cancelButton = filePreview.querySelector("button[data-action=cancel]");
  const sendButton = filePreview.querySelector("button[data-action=send]");

  cancelButton.addEventListener("click", () => {
    hideFilePreview();
  });

  sendButton.addEventListener("click", async () => {
    cancelButton.disabled = true;
    sendButton.disabled = true;
    attachBtn.disabled = true;
    try {
      const uploaded = await uploadFile(file, (percent) => setFileUploadProgress(percent));
      socket.emit("send_message", {
        message: file.name,
        type: previewType,
        file_url: uploaded.file_url,
      });
      hideFilePreview();
    } catch (err) {
      alert(err.message || "File upload failed.");
      cancelButton.disabled = false;
      sendButton.disabled = false;
      attachBtn.disabled = false;
    }
  });

  filePreview.classList.remove("hidden");
}

function updateRoomInfo() {
  const privacyText = roomIsPrivate ? "Private" : "Public";
  roomKeyLabel.textContent = roomKey ? `Room: ${roomKey} (${privacyText})` : "No room selected";
  meLabel.textContent = `Signed in as ${displayName || username}`;
  if (roomKey) {
    copyInviteBtn.disabled = false;
  } else {
    copyInviteBtn.disabled = true;
  }
  hostBadge.classList.toggle('hidden', !isHost);
  memberBadge.classList.toggle('hidden', roomMemberCount <= 0);
  memberBadge.textContent = roomMemberCount > 0 ? `${roomMemberCount} online` : '';
  inviteByUsernameWrap.classList.toggle('hidden', !isHost || !roomKey);
}

function setActiveTab(tab) {
  const createActive = tab === 'create';
  createScreen.classList.toggle('hidden', !createActive);
  joinScreen.classList.toggle('hidden', createActive);
  createTabBtn.classList.toggle('active', createActive);
  joinTabBtn.classList.toggle('active', !createActive);
  createTabBtn.setAttribute('aria-selected', createActive ? 'true' : 'false');
  joinTabBtn.setAttribute('aria-selected', createActive ? 'false' : 'true');
  if (createActive) {
    createRoomKey.focus();
  } else {
    joinRoomKey.focus();
  }
}

function setAuthMode(mode) {
  const signup = mode === "signup";
  currentAuthMode = signup ? "signup" : "login";
  authTabLogin.classList.toggle("active", !signup);
  authTabSignup.classList.toggle("active", signup);
  authTabLogin.setAttribute("aria-selected", signup ? "false" : "true");
  authTabSignup.setAttribute("aria-selected", signup ? "true" : "false");
  confirmPasswordGroup.classList.toggle("hidden", !signup);
  authPassword.setAttribute("autocomplete", signup ? "new-password" : "current-password");
  authSubmitBtn.textContent = signup ? "Create account" : "Login";
  clearAuthErrors();
}

function setOverlaySection(section) {
  const showAuth = section === "auth";
  authSection.classList.toggle("hidden", !showAuth);
  roomSetupSection.classList.toggle("hidden", showAuth);
  if (showAuth) {
    authEmail.focus();
  } else {
    setActiveTab('create');
  }
}

function setFieldError(input, message) {
  const errorEl = document.getElementById(`${input.id}Error`);
  if (!errorEl) return;
  errorEl.textContent = message || "";
  input.classList.toggle("invalid", Boolean(message));
}

function clearFormErrors(section) {
  section.querySelectorAll(".field-error").forEach((el) => { el.textContent = ""; });
  section.querySelectorAll(".input.invalid").forEach((input) => { input.classList.remove("invalid"); });
}

function validateRoomForm(section, roomKeyInput) {
  let valid = true;
  clearFormErrors(section);
  if (!roomKeyInput.value.trim()) {
    setFieldError(roomKeyInput, "Room key is required.");
    valid = false;
  }
  return valid;
}

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(container);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showLogin(show) {
  loginOverlay.classList.toggle("hidden", !show);
  if (show) {
    if (supabaseSession?.access_token) {
      setOverlaySection("room");
    } else {
      setOverlaySection("auth");
      setAuthMode(currentAuthMode);
    }
    clearFormErrors(createScreen);
    clearFormErrors(joinScreen);
    clearAuthErrors();
    overlayKeydownHandler = (event) => trapFocus(event, loginOverlay);
    overlayDialog.addEventListener('keydown', overlayKeydownHandler);
  } else {
    if (overlayKeydownHandler) {
      overlayDialog.removeEventListener('keydown', overlayKeydownHandler);
      overlayKeydownHandler = null;
    }
  }
}

function generateInviteKey() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID().split("-")[0];
  }
  return Math.random().toString(36).slice(2, 10);
}

function setRoomKey(room) {
  roomKey = String(room || "").trim();
  if (!roomKey) return false;
  updateRoomInfo();
  return true;
}

async function fetchCurrentUser() {
  const res = await fetch(`${BACKEND_BASE_URL}/me`);
  if (!res.ok) {
    throw new Error("Unable to verify current user via Supabase.");
  }

  const data = await res.json();
  const user = data.user || {};
  username = user.username || "";
  displayName = user.display_name || user.email || "";
  avatar = user.avatar || avatarForName(displayName || username);
  updateRoomInfo();
}

async function createSession() {
  const res = await fetch(`${BACKEND_BASE_URL}/session`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Unable to create session");
  }

  return res.json();
}

function resetTyping() {
  if (!socket || !socket.connected) return;
  isTyping = false;
  socket.emit("typing", { typing: false });
}

function showToast(message, options = {}) {
  const { type = 'info', duration = 4000, persistent = false } = options;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  if (persistent) {
    toast.classList.add('toast-persistent');
  }
  toastContainer.appendChild(toast);

  if (!persistent) {
    setTimeout(() => {
      toast.remove();
    }, duration);
  }
  return toast;
}

function clearPendingApprovalToast() {
  const toast = toastContainer.querySelector('.toast-persistent');
  if (toast) toast.remove();
}

function renderPendingRequests() {
  if (!pendingRequests.length) {
    pendingModalContent.innerHTML = '<div class="pending-empty">No pending requests at this time.</div>';
    return;
  }

  pendingModalContent.innerHTML = pendingRequests.map((request) => `
    <div class="pending-request-card">
      <div class="pending-request-details">
        <div class="pending-request-avatar">${escapeText(avatarForName(request.display_name || request.username))}</div>
        <div class="pending-request-name">
          <strong>${escapeText(request.display_name || request.username)}</strong>
          <span>${escapeText(request.username)}</span>
        </div>
      </div>
      <div class="pending-request-actions">
        <button type="button" class="btn ghost small" data-action="reject" data-username="${escapeText(request.username)}">Reject</button>
        <button type="button" class="btn primary small" data-action="approve" data-username="${escapeText(request.username)}">Approve</button>
      </div>
    </div>
  `).join('');

  pendingModalContent.querySelectorAll('[data-action=approve]').forEach((button) => {
    button.addEventListener('click', () => {
      approveJoin(button.dataset.username);
      pendingRequests = pendingRequests.filter((r) => r.username !== button.dataset.username);
      renderPendingRequests();
    });
  });

  pendingModalContent.querySelectorAll('[data-action=reject]').forEach((button) => {
    button.addEventListener('click', () => {
      rejectJoin(button.dataset.username);
      pendingRequests = pendingRequests.filter((r) => r.username !== button.dataset.username);
      renderPendingRequests();
    });
  });
}

function openPendingRequestsModal() {
  renderPendingRequests();
  pendingModal.classList.remove('hidden');
  modalKeydownHandler = (event) => {
    if (event.key === 'Escape') {
      closePendingRequestsModal();
      return;
    }
    trapFocus(event, pendingModal);
  };
  pendingModal.addEventListener('keydown', modalKeydownHandler);
  pendingModalClose.focus();
}

function closePendingRequestsModal() {
  pendingModal.classList.add('hidden');
  if (modalKeydownHandler) {
    pendingModal.removeEventListener('keydown', modalKeydownHandler);
    modalKeydownHandler = null;
  }
}

function showPendingRequests() {
  if (!isHost) return;
  openPendingRequestsModal();
  showToast(`New join request received`, { duration: 4500, type: 'info' });
}

function approveJoin(guestUsername) {
  if (!socket || !socket.connected) {
    alert("Not connected");
    return;
  }
  socket.emit("approve_join", { username: guestUsername });
}

function rejectJoin(guestUsername) {
  if (!socket || !socket.connected) {
    alert("Not connected");
    return;
  }
  socket.emit("reject_join", { username: guestUsername });
}

function hydrateJoinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sharedRoom = String(params.get("room") || "").trim();
  const sharedInvite = String(params.get("invite") || "").trim();
  if (!sharedRoom) return;

  joinRoomKey.value = sharedRoom;
  roomKey = sharedRoom;

  if (sharedInvite) {
    joinInviteToken.value = sharedInvite;
    roomInviteToken = sharedInvite;
  }
}

function sendTypingStatus() {
  if (!socket || !socket.connected) return;
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing", { typing: true });
  }
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit("typing", { typing: false });
  }, 900);
}

function renderMessage(msg) {
  const mine = msg.sender === username;
  const bubble = document.createElement("div");
  bubble.className = `bubble ${mine ? "mine" : "theirs"}`;
  bubble.dataset.id = msg.id;

  const row = document.createElement("div");
  row.className = "bubble-row";

  const avatar = document.createElement("span");
  avatar.className = "message-avatar";
  avatar.textContent = escapeText(msg.avatar || avatarForName(msg.display_name || msg.sender));
  row.appendChild(avatar);

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "bubble-content";

  const header = document.createElement("div");
  header.className = "message-top";

  const titleGroup = document.createElement("div");
  titleGroup.className = "message-title";

  const senderEl = document.createElement("span");
  senderEl.className = "sender";
  senderEl.textContent = mine ? "You" : msg.display_name || msg.sender;

  const timeEl = document.createElement("span");
  timeEl.className = "time";
  timeEl.textContent = formatTime(msg.timestamp);

  titleGroup.append(senderEl, timeEl);
  header.appendChild(titleGroup);

  const controls = document.createElement("div");
  controls.className = "message-controls";

  if (!msg.deleted) {
    const reactionToggle = document.createElement("button");
    reactionToggle.type = "button";
    reactionToggle.className = "reaction-toggle";
    reactionToggle.textContent = "React";

    const reactionMenu = document.createElement("div");
    reactionMenu.className = "reaction-menu";

    REACTION_EMOJIS.forEach((emoji) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = emoji;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        socket?.emit("react_message", { id: msg.id, emoji });
        reactionMenu.classList.remove("visible");
      });
      reactionMenu.appendChild(button);
    });

    reactionToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      reactionMenu.classList.toggle("visible");
    });

    controls.append(reactionToggle, reactionMenu);
  }

  if (mine && !msg.deleted) {
    const actionToggle = document.createElement("button");
    actionToggle.type = "button";
    actionToggle.className = "action-toggle";
    actionToggle.textContent = "...";

    const actionMenu = document.createElement("div");
    actionMenu.className = "action-menu";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const newText = prompt("Edit message", msg.message || "");
      if (newText === null || newText.trim() === "") return;
      socket?.emit("edit_message", { id: msg.id, message: newText.trim() });
      actionMenu.classList.remove("visible");
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!confirm("Delete this message?")) return;
      socket?.emit("delete_message", { id: msg.id });
      actionMenu.classList.remove("visible");
    });

    actionMenu.append(editButton, deleteButton);
    actionToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      actionMenu.classList.toggle("visible");
    });

    controls.append(actionToggle, actionMenu);
  }

  header.appendChild(controls);
  contentWrapper.appendChild(header);

  const content = document.createElement("div");
  content.className = "text";

  if (msg.deleted) {
    content.textContent = "Message deleted.";
    content.classList.add("deleted-text");
    contentWrapper.appendChild(content);
  } else if (msg.type === "image" && msg.file_url) {
    const img = document.createElement("img");
    img.className = "media";
    img.src = msg.file_url;
    img.alt = msg.message || "image";
    contentWrapper.appendChild(img);
    if (msg.message) {
      content.textContent = msg.message;
      contentWrapper.appendChild(content);
    }
  } else if (msg.type === "video" && msg.file_url) {
    const video = document.createElement("video");
    video.className = "media";
    video.src = msg.file_url;
    video.controls = true;
    contentWrapper.appendChild(video);
    const streamInfo = resolveStreamSource(msg.file_url, "video");
    const syncButton = createStreamActionButton(streamInfo, msg.message || "Shared video", "video");
    if (syncButton) {
      contentWrapper.appendChild(syncButton);
    }
    if (msg.message) {
      content.textContent = msg.message;
      contentWrapper.appendChild(content);
    }
  } else if (msg.type === "audio" && msg.file_url) {
    const audio = document.createElement("audio");
    audio.className = "media";
    audio.src = msg.file_url;
    audio.controls = true;
    contentWrapper.appendChild(audio);
    const streamInfo = resolveStreamSource(msg.file_url, "audio");
    const syncButton = createStreamActionButton(streamInfo, msg.message || "Shared audio", "audio");
    if (syncButton) {
      contentWrapper.appendChild(syncButton);
    }
    if (msg.message) {
      content.textContent = msg.message;
      contentWrapper.appendChild(content);
    }
  } else if (msg.type === "file" && msg.file_url) {
    const a = document.createElement("a");
    a.className = "fileLink";
    a.href = msg.file_url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = msg.message || "Download file";
    contentWrapper.appendChild(a);
    const streamInfo = resolveStreamSource(msg.file_url);
    const streamButton = createStreamActionButton(streamInfo, msg.message || "Shared video");
    if (streamButton) {
      contentWrapper.appendChild(streamButton);
    }
  } else {
    content.textContent = msg.message || "";
    contentWrapper.appendChild(content);
    const textUrl = extractFirstUrl(msg.message || "");
    const streamInfo = resolveStreamSource(textUrl);
    const streamButton = createStreamActionButton(streamInfo, msg.message || streamInfo?.label || "Shared video");
    if (streamButton) {
      const hint = document.createElement("div");
      hint.className = "message-status";
      hint.textContent = `Stream link detected: ${streamInfo.provider}`;
      contentWrapper.append(hint, streamButton);
    }
  }

  if (msg.edited && !msg.deleted) {
    const edited = document.createElement("div");
    edited.className = "message-status";
    edited.textContent = "Edited";
    contentWrapper.appendChild(edited);
  }

  const reactions = msg.reactions || {};
  const reactionSummary = Object.entries(reactions).map(([emoji, value]) => `${emoji} ${value}`).join("   ");
  if (reactionSummary) {
    const reactionRow = document.createElement("div");
    reactionRow.className = "reaction-bar";
    const counts = document.createElement("span");
    counts.className = "reaction-summary";
    counts.textContent = reactionSummary;
    reactionRow.appendChild(counts);
    contentWrapper.appendChild(reactionRow);
  }

  const readCount = msg.reads ? Object.keys(msg.reads).length : 0;
  if (readCount > 0) {
    const readStatus = document.createElement("div");
    readStatus.className = "message-status";
    readStatus.textContent = readCount === 1 ? "Read by 1" : `Read by ${readCount}`;
    contentWrapper.appendChild(readStatus);
  }

  row.appendChild(contentWrapper);
  bubble.appendChild(row);

  bubble.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  return bubble;
}

function appendMessage(msg) {
  clearEmptyState();
  const dateSeparator = shouldShowDateSeparator(msg.timestamp);
  if (dateSeparator) {
    const separator = document.createElement("div");
    separator.style.cssText = `
      text-align: center;
      margin: 16px 0 12px;
      font-size: 12px;
      color: var(--muted);
      padding: 8px 0;
      position: relative;
    `;
    separator.innerHTML = `<span style="background: var(--panel); padding: 0 12px;">${escapeText(dateSeparator)}</span>`;
    separator.style.borderTop = '1px solid var(--border)';
    messagesEl.appendChild(separator);
  }
  
  const node = renderMessage(msg);
  messagesEl.appendChild(node);
  scrollToBottom();
  if (socket && socket.connected) {
    socket.emit("read_message", { id: msg.id });
  }
}

function updateMessage(msg) {
  const existing = getMessageNode(msg.id);
  const node = renderMessage(msg);
  if (existing) {
    existing.replaceWith(node);
  } else {
    messagesEl.appendChild(node);
  }
  scrollToBottom();
}

function connectSocket() {
  if (socket) return;
  setControlsEnabled(false);
  setConnectionStatus('Connecting…');
  socket = io(BACKEND_BASE_URL, {
    transports: ["websocket"],
    auth: {
      access_token: supabaseSession?.access_token,
      room_key: roomKey,
      is_private: roomIsPrivate,
      invite_token: roomInviteToken,
    },
    query: { room_key: roomKey, invite: roomInviteToken },
  });

  socket.on("connect", () => {
    setControlsEnabled(true);
    setConnectionStatus('Connected');
  });

  socket.on("message_history", (history) => {
    messagesEl.innerHTML = "";
    lastMessageDate = "";
    if (!history || history.length === 0) {
      showEmptyState();
      return;
    }
    history.forEach((message) => appendMessage(message));
  });

  socket.on("receive_message", (message) => {
    const dateSeparator = shouldShowDateSeparator(message.timestamp);
    if (dateSeparator) {
      const separator = document.createElement("div");
      separator.style.cssText = `
        text-align: center;
        margin: 16px 0 12px;
        font-size: 12px;
        color: var(--muted);
        padding: 8px 0;
        position: relative;
      `;
      separator.innerHTML = `<span style="background: var(--panel); padding: 0 12px;">${escapeText(dateSeparator)}</span>`;
      separator.style.borderTop = '1px solid var(--border)';
      messagesEl.appendChild(separator);
    }
    appendMessage(message);
  });

  socket.on("message_edited", (message) => {
    updateMessage(message);
  });

  socket.on("message_deleted", (message) => {
    updateMessage(message);
  });

  socket.on("message_reaction", (message) => {
    updateMessage(message);
  });

  socket.on("read_receipt", (message) => {
    updateMessage(message);
  });

  socket.on("presence_update", ({ members, host, member_count, is_private, invite_token, invite_link }) => {
    isHost = host === username;
    if (typeof member_count === 'number') roomMemberCount = member_count;
    if (typeof is_private === 'boolean') roomIsPrivate = is_private;
    if (invite_token) {
      roomInviteToken = invite_token;
    }
    if (invite_link) {
      roomInviteLink = new URL(invite_link, window.location.origin).toString();
    }
    renderPresence(members);
    updateRoomInfo();
  });

  socket.on("awaiting_approval", ({ message, host }) => {
    awaitingApproval = true;
    setControlsEnabled(false);
    clearPendingApprovalToast();
    showToast(`Waiting for ${host} to approve your entry...`, { persistent: true, type: 'info' });
    messagesEl.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">
      <p>${escapeText(message)}</p>
      <p style="font-size: 0.9em; margin-top: 10px;">Waiting for ${escapeText(host)} to approve your entry...</p>
    </div>`;
  });

  socket.on("join_request", ({ username: guest, display_name }) => {
    if (!isHost) return;
    pendingRequests.push({ username: guest, display_name });
    showPendingRequests();
  });

  socket.on("join_approved", ({ username: guest }) => {
    pendingRequests = pendingRequests.filter(r => r.username !== guest);
    clearPendingApprovalToast();
    if (awaitingApproval && guest === username) {
      awaitingApproval = false;
      messagesEl.innerHTML = "";
      setControlsEnabled(true);
      // Message history will be sent by the server after approval
    }
    renderPendingRequests();
  });

  socket.on("join_rejected", ({ reason }) => {
    clearPendingApprovalToast();
    if (awaitingApproval) {
      showLogin(true);
      alert(reason || "Your request to join was rejected.");
      setControlsEnabled(false);
      socket.disconnect();
      socket = null;
    }
  });

  socket.on("room_capacity_updated", ({ max_members, member_count }) => {
    roomMemberCount = member_count;
    updateRoomInfo();
  });

  socket.on("user_invited", ({ room_key, invite_token, invite_link, from }) => {
    const action = confirm(`${from} invited you to room ${room_key}. Join now?`);
    if (!action) return;
    joinRoomKey.value = room_key;
    joinInviteToken.value = invite_token || "";
    roomKey = room_key;
    roomInviteToken = invite_token || "";
    roomInviteLink = invite_link ? new URL(invite_link, window.location.origin).toString() : "";
    showLogin(false);
    connectSocket();
  });

  socket.on("invite_result", ({ ok, message, username: invited }) => {
    if (ok) {
      showToast(`Invite sent to ${invited}`, { type: 'info' });
      return;
    }
    alert(message || "Unable to send invite");
  });

  socket.on("typing_update", ({ typing }) => {
    renderTyping(typing || []);
  });

  socket.on("video_sync_state", (state) => {
    applySyncedVideoState(state);
  });

  socket.on("connect_error", (err) => {
    showLogin(true);
    const m = err && err.message ? err.message : "Connection rejected. Check invite key.";
    alert(m);
    setControlsEnabled(false);
    setConnectionStatus('Disconnected');
    socket.disconnect();
    socket = null;
  });

  socket.on("disconnect", () => {
    setControlsEnabled(false);
    setConnectionStatus('Disconnected');
    isHost = false;
    awaitingApproval = false;
    pendingRequests = [];
    lastMessageDate = "";
    closePendingRequestsModal();
    clearPendingApprovalToast();
    applySyncedVideoState(null);
  });
}

async function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BACKEND_BASE_URL}/upload?room_key=${encodeURIComponent(roomKey)}`);
    if (supabaseSession?.access_token) {
      xhr.setRequestHeader("Authorization", `Bearer ${supabaseSession.access_token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === "function") {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (parseErr) {
          reject(new Error("Upload succeeded but response was invalid."));
        }
      } else {
        reject(new Error(xhr.responseText || "Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.onabort = () => reject(new Error("Upload aborted."));

    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

function detectType(file) {
  const t = (file && file.type) || "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "file";
}

async function sendTextMessage() {
  if (!socket || !socket.connected) {
    alert("Not connected. Check your invite key and click Join chat again.");
    return;
  }
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit("send_message", {
    message: text,
    type: "text",
    file_url: null,
  });
  messageInput.value = "";
  messageInput.focus();
}

async function sendFileMessage(file) {
  if (!socket || !socket.connected) {
    alert("Not connected. Check your invite key and click Join chat again.");
    return;
  }
  sendBtn.disabled = true;
  attachBtn.disabled = true;
  try {
    const type = detectType(file);
    const uploaded = await uploadFile(file);
    socket.emit("send_message", {
      message: file.name,
      type,
      file_url: uploaded.file_url,
    });
  } finally {
    sendBtn.disabled = false;
    attachBtn.disabled = false;
  }
}

// Create Room
authTabLogin.addEventListener("click", () => {
  setAuthMode("login");
});

authTabSignup.addEventListener("click", () => {
  setAuthMode("signup");
});

authSubmitBtn.addEventListener("click", async () => {
  try {
    await authenticate(currentAuthMode);
    setOverlaySection("room");
    updateRoomInfo();
  } catch (err) {
    alert(err.message || "Authentication failed.");
  }
});

authEmail.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    authPassword.focus();
  }
});

authPassword.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (currentAuthMode === "signup" && !confirmPasswordGroup.classList.contains("hidden")) {
    authConfirmPassword.focus();
    return;
  }
  authSubmitBtn.click();
});

authConfirmPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    authSubmitBtn.click();
  }
});

generateKeyBtn.addEventListener("click", () => {
  createRoomKey.value = generateInviteKey();
  setFieldError(createRoomKey, "");
});

createTabBtn.addEventListener("click", () => {
  setActiveTab('create');
});

joinTabBtn.addEventListener("click", () => {
  setActiveTab('join');
});

createSubmitBtn.addEventListener("click", async () => {
  const rkey = createRoomKey.value.trim();
  const privateRoom = (roomPrivacy?.value || "private") === "private";

  if (!supabaseSession?.access_token) {
    setOverlaySection("auth");
    alert("Please log in or sign up before creating a room.");
    return;
  }
  
  if (!validateRoomForm(createScreen, createRoomKey)) {
    return;
  }
  
  if (!setRoomKey(rkey)) return;
  try {
    roomIsPrivate = privateRoom;
    roomInviteToken = "";
    roomInviteLink = "";
    showLogin(false);
    updateRoomInfo();
    connectSocket();
  } catch (err) {
    alert(err.message || "Failed to authenticate");
  }
});


createRoomKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createSubmitBtn.click();
});

// Join Room
joinSubmitBtn.addEventListener("click", async () => {
  const rkey = joinRoomKey.value.trim();
  const inviteToken = joinInviteToken.value.trim();

  if (!supabaseSession?.access_token) {
    setOverlaySection("auth");
    alert("Please log in or sign up before joining a room.");
    return;
  }
  
  if (!validateRoomForm(joinScreen, joinRoomKey)) {
    return;
  }
  
  if (!setRoomKey(rkey)) return;
  try {
    roomInviteToken = inviteToken;
    showLogin(false);
    updateRoomInfo();
    connectSocket();
  } catch (err) {
    alert(err.message || "Failed to authenticate");
  }
});


joinRoomKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinSubmitBtn.click();
});

joinInviteToken.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinSubmitBtn.click();
});

copyInviteBtn.addEventListener("click", async () => {
  if (!roomKey) return;
  const inviteUrl = roomInviteLink || `${window.location.origin}/?room=${encodeURIComponent(roomKey)}${roomIsPrivate && roomInviteToken ? `&invite=${encodeURIComponent(roomInviteToken)}` : ""}`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    copyInviteBtn.textContent = "Copied";
    setTimeout(() => {
      copyInviteBtn.textContent = "Copy invite";
    }, 1200);
  } catch {
    alert("Copy failed. Please copy the room key manually.");
  }
});

inviteUsernameBtn.addEventListener("click", () => {
  const target = inviteUsernameInput.value.trim().toLowerCase();
  if (!target) {
    alert("Enter a username/email to invite.");
    return;
  }
  if (!socket || !socket.connected) {
    alert("Not connected");
    return;
  }
  socket.emit("invite_user", { username: target });
  inviteUsernameInput.value = "";
});

pendingModalClose.addEventListener("click", () => {
  closePendingRequestsModal();
});

document.addEventListener("click", () => {
  document.querySelectorAll('.reaction-menu.visible, .action-menu.visible').forEach((el) => {
    el.classList.remove('visible');
  });
});

changeUserBtn.addEventListener("click", async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.warn("Supabase sign out failed", err);
  }
  username = "";
  displayName = "";
  roomKey = "";
  avatar = "";
  roomInviteToken = "";
  roomInviteLink = "";
  roomIsPrivate = true;
  supabaseSession = null;
  supabaseUser = null;
  isHost = false;
  awaitingApproval = false;
  pendingRequests = [];
  lastMessageDate = "";
  closePendingRequestsModal();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  updateRoomInfo();
  showLogin(true);
});

sendBtn.addEventListener("click", async () => {
  await sendTextMessage();
});

messageInput.addEventListener("input", () => {
  sendTypingStatus();
});

messageInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    await sendTextMessage();
  }
});

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  const validationError = validateFileSelection(file);
  if (validationError) {
    alert(validationError);
    return;
  }
  showFilePreview(file);
});

if (syncVideo) {
  syncVideo.addEventListener("play", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
  syncVideo.addEventListener("pause", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
  syncVideo.addEventListener("seeked", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
  syncVideo.addEventListener("ratechange", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
}

if (syncAudio) {
  syncAudio.addEventListener("play", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
  syncAudio.addEventListener("pause", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
  syncAudio.addEventListener("seeked", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
  syncAudio.addEventListener("ratechange", () => {
    if (suppressVideoSync) return;
    emitSyncedVideoState();
  });
}

// Reset date separator tracking
lastMessageDate = "";

(async () => {
  hydrateJoinFromUrl();
  if (roomPrivacy) {
    roomPrivacy.value = roomIsPrivate ? "private" : "public";
  }

  await restoreAuth();

  if (supabaseSession) {
    if (roomKey) {
      updateRoomInfo();
      showLogin(false);
      connectSocket();
      return;
    }
    updateRoomInfo();
  }

  showLogin(true);
  setControlsEnabled(false);
})();

