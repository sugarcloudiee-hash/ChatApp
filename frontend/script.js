const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");

const loginOverlay = document.getElementById("loginOverlay");
const usernameInput = document.getElementById("usernameInput");
const chatKeyInput = document.getElementById("chatKeyInput");
const joinBtn = document.getElementById("joinBtn");
const meLabel = document.getElementById("meLabel");
const changeUserBtn = document.getElementById("changeUserBtn");

let socket = null;
let username = sessionStorage.getItem("username") || "";
let chatKey = sessionStorage.getItem("chatKey") || "";

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeText(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}

function renderMessage(msg) {
  const mine = msg.sender === username;
  const bubble = document.createElement("div");
  bubble.className = `bubble ${mine ? "mine" : "theirs"}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `
    <span class="sender">${escapeText(mine ? "You" : msg.sender)}</span>
    <span class="time">${escapeText(formatTime(msg.timestamp))}</span>
  `;

  const body = document.createElement("div");
  body.className = "text";

  if (msg.type === "image" && msg.file_url) {
    const img = document.createElement("img");
    img.className = "media";
    img.src = msg.file_url;
    img.alt = msg.message || "image";
    bubble.append(meta, img);
    if (msg.message) {
      const caption = document.createElement("div");
      caption.className = "text";
      caption.textContent = msg.message;
      bubble.append(caption);
    }
    return bubble;
  }

  if (msg.type === "video" && msg.file_url) {
    const video = document.createElement("video");
    video.className = "media";
    video.src = msg.file_url;
    video.controls = true;
    bubble.append(meta, video);
    if (msg.message) {
      const caption = document.createElement("div");
      caption.className = "text";
      caption.textContent = msg.message;
      bubble.append(caption);
    }
    return bubble;
  }

  if (msg.type === "file" && msg.file_url) {
    const a = document.createElement("a");
    a.className = "fileLink";
    a.href = msg.file_url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = msg.message || "Download file";
    bubble.append(meta, a);
    return bubble;
  }

  body.textContent = msg.message || "";
  bubble.append(meta, body);
  return bubble;
}

function appendMessage(msg) {
  messagesEl.appendChild(renderMessage(msg));
  scrollToBottom();
}

function setUsername(name) {
  username = String(name || "").trim();
  if (!username) return false;
  sessionStorage.setItem("username", username);
  meLabel.textContent = `Signed in as ${username}`;
  return true;
}

function showLogin(show) {
  loginOverlay.classList.toggle("hidden", !show);
  if (show) setTimeout(() => (usernameInput.value ? chatKeyInput.focus() : usernameInput.focus()), 0);
}

function connectSocket() {
  if (socket) return;
  socket = io({
    transports: ["websocket", "polling"],
    auth: { key: chatKey },
  });

  socket.on("message_history", (history) => {
    messagesEl.innerHTML = "";
    (history || []).forEach((m) => appendMessage(m));
  });

  socket.on("receive_message", (msg) => {
    appendMessage(msg);
  });

  socket.on("connect_error", (err) => {
    showLogin(true);
    alert(err && err.message ? err.message : "Connection rejected. Check invite key.");
  });
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/upload", {
    method: "POST",
    body: fd,
    headers: {
      "X-Chat-Key": chatKey,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Upload failed");
  }
  return await res.json();
}

function detectType(file) {
  const t = (file && file.type) || "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  return "file";
}

async function sendTextMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit("send_message", {
    sender: username,
    message: text,
    type: "text",
    file_url: null,
    key: chatKey,
  });
  messageInput.value = "";
  messageInput.focus();
}

async function sendFileMessage(file) {
  sendBtn.disabled = true;
  attachBtn.disabled = true;
  try {
    const type = detectType(file);
    const up = await uploadFile(file);
    socket.emit("send_message", {
      sender: username,
      message: file.name,
      type,
      file_url: up.file_url,
      key: chatKey,
    });
  } finally {
    sendBtn.disabled = false;
    attachBtn.disabled = false;
  }
}

joinBtn.addEventListener("click", () => {
  if (!setUsername(usernameInput.value)) return;
  chatKey = String(chatKeyInput.value || "").trim();
  if (!chatKey) return;
  sessionStorage.setItem("chatKey", chatKey);
  showLogin(false);
  connectSocket();
});

usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

chatKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click();
});

changeUserBtn.addEventListener("click", () => {
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("chatKey");
  username = "";
  chatKey = "";
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  showLogin(true);
});

sendBtn.addEventListener("click", async () => {
  if (!socket) return;
  await sendTextMessage();
});

messageInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    await sendTextMessage();
  }
});

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  if (!socket) return;
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  await sendFileMessage(file);
});

// Boot
if (username && chatKey) {
  meLabel.textContent = `Signed in as ${username}`;
  chatKeyInput.value = chatKey;
  showLogin(false);
  connectSocket();
} else {
  if (username) usernameInput.value = username;
  showLogin(true);
}

