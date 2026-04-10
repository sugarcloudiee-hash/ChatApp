const messagesEl = document.getElementById("messages");
const presenceEl = document.getElementById("presence");
const typingIndicator = document.getElementById("typingIndicator");
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

const createTabBtn = document.getElementById("tabCreate");
const joinTabBtn = document.getElementById("tabJoin");

// Create Room Screen
const createScreen = document.getElementById("createScreen");
const createRoomKey = document.getElementById("createRoomKey");
const generateKeyBtn = document.getElementById("generateKeyBtn");
const maxMembersInput = document.getElementById("maxMembersInput");
const createSubmitBtn = document.getElementById("createSubmitBtn");

// Join Room Screen
const joinScreen = document.getElementById("joinScreen");
const joinRoomKey = document.getElementById("joinRoomKey");
const joinSubmitBtn = document.getElementById("joinSubmitBtn");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");

const REACTION_EMOJIS = ["❤️", "👍", "😂", "🎉", "😮"];
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
let username = sessionStorage.getItem("username") || "";
let displayName = sessionStorage.getItem("displayName") || "";
let roomKey = sessionStorage.getItem("roomKey") || "";
let avatar = sessionStorage.getItem("avatar") || "";
let typingTimeout = null;
let isTyping = false;
let isHost = false;
let awaitingApproval = false;
let pendingRequests = [];  // For host: list of pending join requests
let roomMaxMembers = 10;  // Current room capacity
let roomMemberCount = 0;  // Current members in room

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
  [authEmail, authPassword].forEach((input) => {
    const errorEl = document.getElementById(`${input.id}Error`);
    if (errorEl) {
      errorEl.textContent = "";
    }
    input.classList.remove("invalid");
  });
}

function validateAuthForm() {
  let valid = true;
  clearAuthErrors();

  const email = authEmail.value.trim();
  const password = authPassword.value;

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

  return valid;
}

function setAuthState(user, session) {
  supabaseUser = user;
  supabaseSession = session;
  if (user) {
    username = user.email || username;
    displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || username;
    avatar = avatarForName(displayName || username);
    sessionStorage.setItem("username", username);
    sessionStorage.setItem("displayName", displayName);
    sessionStorage.setItem("avatar", avatar);
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

async function signInOrSignUp(email, password) {
  let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error && error.status === 400) {
    const signUpResult = await supabaseClient.auth.signUp({ email, password });
    if (signUpResult.error) {
      throw signUpResult.error;
    }
    if (!signUpResult.data.session) {
      throw new Error("Check your email to confirm sign-up before signing in.");
    }
    data = signUpResult.data;
    error = signUpResult.error;
  }

  if (error) {
    throw new Error(error.message || "Unable to sign in.");
  }

  if (!data?.session?.user) {
    throw new Error("Auth failed, please retry.");
  }

  setAuthState(data.session.user, data.session);
  return data.session;
}

async function authenticate() {
  if (supabaseSession?.access_token) {
    return supabaseSession;
  }
  if (!validateAuthForm()) {
    throw new Error("Invalid auth credentials.");
  }
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const session = await signInOrSignUp(email, password);
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
  countBadge.textContent = `${roomMemberCount}/${roomMaxMembers} members`;
  presenceEl.appendChild(countBadge);
  
  // Add host capacity control if user is host
  if (isHost) {
    const settingsBtn = document.createElement("button");
    settingsBtn.className = "btn ghost small";
    settingsBtn.style.cssText = "margin-left: 8px;";
    settingsBtn.textContent = "⚙️ Settings";
    settingsBtn.onclick = showCapacitySettings;
    presenceEl.appendChild(settingsBtn);
  }
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
    "application/pdf",
    "text/plain",
  ];

  if (!file) return "No file selected.";
  if (file.size > maxSize) return "File is too large. Max size is 50MB.";
  if (!allowedTypes.includes(file.type)) return "File type is not supported. Allowed: PNG, JPG, GIF, MP4, PDF, TXT.";
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
  roomKeyLabel.textContent = roomKey ? `Room: ${roomKey}` : "No room selected";
  meLabel.textContent = `Signed in as ${displayName || username}`;
  if (roomKey) {
    copyInviteBtn.disabled = false;
  } else {
    copyInviteBtn.disabled = true;
  }
  hostBadge.classList.toggle('hidden', !isHost);
  memberBadge.classList.toggle('hidden', roomMemberCount <= 0);
  memberBadge.textContent = roomMaxMembers ? `${roomMemberCount}/${roomMaxMembers}` : '';
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
    setActiveTab('create');
    createRoomKey.value = createRoomKey.value || "";
    joinRoomKey.value = joinRoomKey.value || "";
    clearFormErrors(createScreen);
    clearFormErrors(joinScreen);
    clearAuthErrors();
    overlayKeydownHandler = (event) => trapFocus(event, loginOverlay);
    overlayDialog.addEventListener('keydown', overlayKeydownHandler);
    authEmail.focus();
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
  sessionStorage.setItem("roomKey", roomKey);
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
  sessionStorage.setItem("username", username);
  sessionStorage.setItem("displayName", displayName);
  sessionStorage.setItem("avatar", avatar);
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

function showCapacitySettings() {
  const newCapacity = prompt(`Set maximum members for this room (1-100):\n\nCurrent: ${roomMaxMembers}`, roomMaxMembers);
  if (newCapacity === null) return;
  
  const capacity = parseInt(newCapacity);
  if (isNaN(capacity) || capacity < 1 || capacity > 100) {
    alert("Please enter a number between 1 and 100");
    return;
  }
  
  if (!socket || !socket.connected) {
    alert("Not connected");
    return;
  }
  
  socket.emit("update_room_capacity", { max_members: capacity });
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
  } else {
    content.textContent = msg.message || "";
    contentWrapper.appendChild(content);
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
    transports: ["polling"],
    auth: {
      access_token: supabaseSession?.access_token,
      room_key: roomKey,
      max_members: parseInt(sessionStorage.getItem("roomMaxMembers") || "10"),
    },
    query: { room_key: roomKey },
    upgrade: false,
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

  socket.on("presence_update", ({ members, host, max_members, member_count }) => {
    isHost = host === username;
    if (max_members) roomMaxMembers = max_members;
    if (typeof member_count === 'number') roomMemberCount = member_count;
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
    roomMaxMembers = max_members;
    roomMemberCount = member_count;
    // Trigger re-render of presence
    const members = Object.values(ROOM_MEMBERS || {});
    renderPresence(members);
  });

  socket.on("typing_update", ({ typing }) => {
    renderTyping(typing || []);
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
  const maxMembers = parseInt(maxMembersInput.value) || 10;
  
  if (!validateRoomForm(createScreen, createRoomKey)) {
    return;
  }
  
  if (maxMembers < 1 || maxMembers > 100) {
    setFieldError(maxMembersInput, "Enter a number between 1 and 100.");
    return;
  }
  
  if (!setRoomKey(rkey)) return;
  try {
    await authenticate();
    sessionStorage.setItem("roomMaxMembers", maxMembers);
    showLogin(false);
    updateRoomInfo();
    connectSocket();
  } catch (err) {
    alert(err.message || "Failed to authenticate");
  }
});


createRoomKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") maxMembersInput.focus();
});

maxMembersInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createSubmitBtn.click();
});

// Join Room
joinSubmitBtn.addEventListener("click", async () => {
  const rkey = joinRoomKey.value.trim();
  
  if (!validateRoomForm(joinScreen, joinRoomKey)) {
    return;
  }
  
  if (!setRoomKey(rkey)) return;
  try {
    await authenticate();
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

copyInviteBtn.addEventListener("click", async () => {
  if (!roomKey) return;
  try {
    await navigator.clipboard.writeText(roomKey);
    copyInviteBtn.textContent = "Copied";
    setTimeout(() => {
      copyInviteBtn.textContent = "Copy invite";
    }, 1200);
  } catch {
    alert("Copy failed. Please copy the room key manually.");
  }
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
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("displayName");
  sessionStorage.removeItem("roomKey");
  sessionStorage.removeItem("avatar");
  username = "";
  displayName = "";
  roomKey = "";
  avatar = "";
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

// Reset date separator tracking
lastMessageDate = "";

(async () => {
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

