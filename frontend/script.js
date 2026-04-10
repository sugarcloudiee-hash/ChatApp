const messagesEl = document.getElementById("messages");
const presenceEl = document.getElementById("presence");
const typingIndicator = document.getElementById("typingIndicator");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");

const loginOverlay = document.getElementById("loginOverlay");
const meLabel = document.getElementById("meLabel");
const roomKeyLabel = document.getElementById("roomKeyLabel");
const changeUserBtn = document.getElementById("changeUserBtn");

// Choice Screen
const choiceScreen = document.getElementById("choiceScreen");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

// Create Room Screen
const createScreen = document.getElementById("createScreen");
const createUsername = document.getElementById("createUsername");
const createDisplayName = document.getElementById("createDisplayName");
const createRoomKey = document.getElementById("createRoomKey");
const generateKeyBtn = document.getElementById("generateKeyBtn");
const maxMembersInput = document.getElementById("maxMembersInput");
const createCancelBtn = document.getElementById("createCancelBtn");
const createSubmitBtn = document.getElementById("createSubmitBtn");

// Join Room Screen
const joinScreen = document.getElementById("joinScreen");
const joinUsername = document.getElementById("joinUsername");
const joinDisplayName = document.getElementById("joinDisplayName");
const joinRoomKey = document.getElementById("joinRoomKey");
const joinCancelBtn = document.getElementById("joinCancelBtn");
const joinSubmitBtn = document.getElementById("joinSubmitBtn");

const REACTION_EMOJIS = ["❤️", "👍", "😂", "🎉", "😮"];
// Use your backend Flask server URL here.
// If you deploy the frontend separately, this should point to the backend service URL.
// Replace the default URL below with your Render service URL if different.
const BACKEND_BASE_URL = window.BACKEND_BASE_URL || "https://chatapp-1-ctza.onrender.com";
let socket = null;
let username = sessionStorage.getItem("username") || "";
let displayName = sessionStorage.getItem("displayName") || "";
let roomKey = sessionStorage.getItem("roomKey") || "";
let avatar = sessionStorage.getItem("avatar") || "";
let sessionToken = sessionStorage.getItem("sessionToken") || "";
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

function updateRoomInfo() {
  roomKeyLabel.textContent = roomKey ? `Room: ${roomKey}` : "No room selected";
  meLabel.textContent = `Signed in as ${displayName || username}`;
}

function showScreen(screenId) {
  choiceScreen.style.display = screenId === 'choice' ? 'flex' : 'none';
  createScreen.style.display = screenId === 'create' ? 'block' : 'none';
  joinScreen.style.display = screenId === 'join' ? 'block' : 'none';
}

function showLogin(show) {
  loginOverlay.classList.toggle("hidden", !show);
  if (show) {
    showScreen('choice');
    createUsername.value = username;
    createDisplayName.value = displayName;
    joinUsername.value = username;
    joinDisplayName.value = displayName;
  }
}

function generateInviteKey() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID().split("-")[0];
  }
  return Math.random().toString(36).slice(2, 10);
}

function setIdentity(name, display, room) {
  username = String(name || "").trim();
  displayName = String(display || "").trim() || username;
  roomKey = String(room || "").trim();
  if (!username || !roomKey) return false;
  avatar = avatarForName(displayName || username);
  sessionStorage.setItem("username", username);
  sessionStorage.setItem("displayName", displayName);
  sessionStorage.setItem("roomKey", roomKey);
  sessionStorage.setItem("avatar", avatar);
  updateRoomInfo();
  return true;
}

async function createSession() {
  const res = await fetch(`${BACKEND_BASE_URL}/session`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ username, display_name: displayName }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Unable to create session");
  }

  const data = await res.json();
  sessionToken = data.token;
  sessionStorage.setItem("sessionToken", sessionToken);
  return data;
}

function resetTyping() {
  if (!socket || !socket.connected) return;
  isTyping = false;
  socket.emit("typing", { typing: false });
}

function showPendingRequests() {
  if (!isHost || pendingRequests.length === 0) {
    return;
  }

  const requestsHtml = pendingRequests.map(r => `
    <div style="padding: 12px; margin: 8px 0; background: #1a2838; border: 1px solid rgba(47,107,255,0.3); border-radius: 10px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
      <span style="font-size: 14px;">${escapeText(r.display_name || r.username)}</span>
      <div style="display: flex; gap: 8px;">
        <button onclick="approveJoin('${escapeText(r.username)}')" style="padding: 8px 12px; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; min-height: 36px;">Approve</button>
        <button onclick="rejectJoin('${escapeText(r.username)}')" style="padding: 8px 12px; background: #f44336; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; min-height: 36px;">Reject</button>
      </div>
    </div>
  `).join("");

  const panel = document.createElement("div");
  panel.id = "pendingRequestsPanel";
  panel.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 50vh;
    background: rgba(11, 18, 32, 0.98);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px 16px 0 0;
    padding: 16px;
    box-shadow: 0 -2px 20px rgba(0,0,0,0.3);
    z-index: 999;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  `;
  panel.innerHTML = `
    <div style="position: sticky; top: 0; background: rgba(11, 18, 32, 0.98); padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.12);">
      <h3 style="margin: 0; font-size: 16px; color: rgba(255, 255, 255, 0.92);">Join Requests <span style="font-size: 12px; color: rgba(255, 255, 255, 0.65);">(${pendingRequests.length})</span></h3>
    </div>
    <div>${requestsHtml}</div>
  `;

  const existingPanel = document.getElementById("pendingRequestsPanel");
  if (existingPanel) {
    existingPanel.replaceWith(panel);
  } else {
    document.body.appendChild(panel);
  }
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

  const header = document.createElement("div");
  header.className = "meta";

  const senderEl = document.createElement("span");
  senderEl.className = "sender";
  senderEl.textContent = mine ? "You" : msg.display_name || msg.sender;

  const timeEl = document.createElement("span");
  timeEl.className = "time";
  timeEl.textContent = formatTime(msg.timestamp);

  header.append(senderEl, timeEl);
  bubble.appendChild(header);

  const content = document.createElement("div");
  content.className = "text";

  if (msg.deleted) {
    content.textContent = "Message deleted.";
    content.classList.add("deleted-text");
    bubble.appendChild(content);
  } else if (msg.type === "image" && msg.file_url) {
    const img = document.createElement("img");
    img.className = "media";
    img.src = msg.file_url;
    img.alt = msg.message || "image";
    bubble.appendChild(img);
    if (msg.message) {
      content.textContent = msg.message;
      bubble.appendChild(content);
    }
  } else if (msg.type === "video" && msg.file_url) {
    const video = document.createElement("video");
    video.className = "media";
    video.src = msg.file_url;
    video.controls = true;
    bubble.appendChild(video);
    if (msg.message) {
      content.textContent = msg.message;
      bubble.appendChild(content);
    }
  } else if (msg.type === "file" && msg.file_url) {
    const a = document.createElement("a");
    a.className = "fileLink";
    a.href = msg.file_url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = msg.message || "Download file";
    bubble.appendChild(a);
  } else {
    content.textContent = msg.message || "";
    bubble.appendChild(content);
  }

  if (msg.edited && !msg.deleted) {
    const edited = document.createElement("div");
    edited.className = "message-status";
    edited.textContent = "Edited";
    bubble.appendChild(edited);
  }

  if (!msg.deleted) {
    const reactionRow = document.createElement("div");
    reactionRow.className = "reaction-bar";

    REACTION_EMOJIS.forEach((emoji) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reaction-button";
      button.textContent = emoji;
      button.addEventListener("click", () => {
        socket?.emit("react_message", { id: msg.id, emoji });
      });
      reactionRow.appendChild(button);
    });

    const counts = document.createElement("span");
    counts.className = "reaction-counts";
    const reactions = msg.reactions || {};
    counts.textContent = Object.entries(reactions)
      .map(([emoji, value]) => `${emoji} ${value}`)
      .join("   ");
    if (counts.textContent) {
      reactionRow.appendChild(counts);
    }
    bubble.appendChild(reactionRow);
  }

  if (mine && !msg.deleted) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const editButton = document.createElement("button");
    editButton.className = "btn ghost small";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", async () => {
      const newText = prompt("Edit message", msg.message || "");
      if (newText === null || newText.trim() === "") return;
      socket?.emit("edit_message", { id: msg.id, message: newText.trim() });
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "btn ghost small";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      if (!confirm("Delete this message?")) return;
      socket?.emit("delete_message", { id: msg.id });
    });

    actions.append(editButton, deleteButton);
    bubble.appendChild(actions);
  }

  const readCount = msg.reads ? Object.keys(msg.reads).length : 0;
  if (readCount > 0) {
    const readStatus = document.createElement("div");
    readStatus.className = "message-status";
    readStatus.textContent = readCount === 1 ? "Read by 1" : `Read by ${readCount}`;
    bubble.appendChild(readStatus);
  }

  return bubble;
}

function appendMessage(msg) {
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
  socket = io(BACKEND_BASE_URL, {
    transports: ["polling"],
    auth: {
      session_token: sessionToken,
      room_key: roomKey,
      max_members: parseInt(sessionStorage.getItem("roomMaxMembers") || "10"),
    },
    query: { room_key: roomKey },
    upgrade: false,
  });

  socket.on("connect", () => {
    setControlsEnabled(true);
  });

  socket.on("message_history", (history) => {
    messagesEl.innerHTML = "";
    lastMessageDate = "";
    (history || []).forEach((message) => appendMessage(message));
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
  });

  socket.on("awaiting_approval", ({ message, host }) => {
    awaitingApproval = true;
    setControlsEnabled(false);
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
    if (awaitingApproval && guest === username) {
      awaitingApproval = false;
      messagesEl.innerHTML = "";
      setControlsEnabled(true);
      // Message history will be sent by the server after approval
    }
    showPendingRequests();
  });

  socket.on("join_rejected", ({ reason }) => {
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
    socket.disconnect();
    socket = null;
  });

  socket.on("disconnect", () => {
    setControlsEnabled(false);
    isHost = false;
    awaitingApproval = false;
    pendingRequests = [];
    lastMessageDate = "";
    const panel = document.getElementById("pendingRequestsPanel");
    if (panel) panel.remove();
  });
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BACKEND_BASE_URL}/upload?room_key=${encodeURIComponent(roomKey)}`, {
    method: "POST",
    body: fd,
    headers: {
      "X-Session-Token": sessionToken,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Upload failed");
  }
  return res.json();
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
    sender: username,
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
      sender: username,
      message: file.name,
      type,
      file_url: uploaded.file_url,
    });
  } finally {
    sendBtn.disabled = false;
    attachBtn.disabled = false;
  }
}

// Choice Screen
createRoomBtn.addEventListener("click", () => {
  showScreen('create');
  createUsername.focus();
});

joinRoomBtn.addEventListener("click", () => {
  showScreen('join');
  joinUsername.focus();
});

// Create Room
generateKeyBtn.addEventListener("click", () => {
  createRoomKey.value = generateInviteKey();
});

createCancelBtn.addEventListener("click", () => {
  showScreen('choice');
});

createSubmitBtn.addEventListener("click", async () => {
  const usr = createUsername.value.trim();
  const dname = createDisplayName.value.trim() || usr;
  const rkey = createRoomKey.value.trim();
  const maxMembers = parseInt(maxMembersInput.value) || 10;
  
  if (!usr || !rkey) {
    alert("Username and room key are required");
    return;
  }
  
  if (maxMembers < 1 || maxMembers > 100) {
    alert("Max members must be between 1 and 100");
    return;
  }
  
  if (!setIdentity(usr, dname, rkey)) return;
  try {
    await createSession();
    // Send max_members to backend when creating room
    sessionStorage.setItem("roomMaxMembers", maxMembers);
    showLogin(false);
    updateRoomInfo();
    connectSocket();
  } catch (err) {
    alert(err.message || "Failed to create session");
  }
});

createUsername.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createDisplayName.focus();
});

createDisplayName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createRoomKey.focus();
});

createRoomKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") maxMembersInput.focus();
});

maxMembersInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") createSubmitBtn.click();
});

// Join Room
joinCancelBtn.addEventListener("click", () => {
  showScreen('choice');
});

joinSubmitBtn.addEventListener("click", async () => {
  const usr = joinUsername.value.trim();
  const dname = joinDisplayName.value.trim() || usr;
  const rkey = joinRoomKey.value.trim();
  
  if (!usr || !rkey) {
    alert("Username and room key are required");
    return;
  }
  
  if (!setIdentity(usr, dname, rkey)) return;
  try {
    await createSession();
    showLogin(false);
    updateRoomInfo();
    connectSocket();
  } catch (err) {
    alert(err.message || "Failed to create session");
  }
});

joinUsername.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinDisplayName.focus();
});

joinDisplayName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoomKey.focus();
});

joinRoomKey.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinSubmitBtn.click();
});

changeUserBtn.addEventListener("click", () => {
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("displayName");
  sessionStorage.removeItem("roomKey");
  sessionStorage.removeItem("avatar");
  sessionStorage.removeItem("sessionToken");
  username = "";
  displayName = "";
  roomKey = "";
  avatar = "";
  sessionToken = "";
  isHost = false;
  awaitingApproval = false;
  pendingRequests = [];
  lastMessageDate = "";
  const panel = document.getElementById("pendingRequestsPanel");
  if (panel) panel.remove();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
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
  await sendFileMessage(file);
});

// Reset date separator tracking
lastMessageDate = "";

if (username && roomKey && sessionToken) {
  // User already has session - restore UI state
  updateRoomInfo();
  showLogin(false);
  connectSocket();
} else {
  // No existing session - show login screens
  showLogin(true);
  setControlsEnabled(false);
}

