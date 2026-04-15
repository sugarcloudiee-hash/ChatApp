(function () {
  const DRIFT_THRESHOLD_SECONDS = 1;
  const HOST_SYNC_INTERVAL_MS = 5000;
  const YT_SEEK_POLL_MS = 400;
  const YT_SEEK_DELTA_THRESHOLD = 1.2;

  const elements = {
    urlInput: document.getElementById("watchPartyUrl"),
    typeSelect: document.getElementById("watchPartyType"),
    setButton: document.getElementById("watchPartySetBtn"),
    hostHint: document.getElementById("watchPartyHostHint"),
    ytContainer: document.getElementById("ytPlayerContainer"),
    html5Player: document.getElementById("html5Player"),
  };

  let socket = null;
  let isHostFn = () => false;
  let syncTimer = null;
  let ytPlayer = null;
  let ytReadyPromise = null;
  let suppressLocalEvents = false;
  let ytLastKnownTime = 0;
  let ytLastSampleAt = 0;
  let ytSeekMonitorTimer = null;
  let currentState = {
    video_url: "",
    video_type: "html5",
    timestamp: 0,
    status: "paused",
  };

  function isYouTubeUrl(url) {
    return /(youtube\.com|youtu\.be)/i.test(url || "");
  }

  function extractYouTubeId(url) {
    if (!url) return "";
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/i);
    if (shortMatch && shortMatch[1]) return shortMatch[1];

    const watchMatch = url.match(/[?&]v=([^?&]+)/i);
    if (watchMatch && watchMatch[1]) return watchMatch[1];

    const embedMatch = url.match(/youtube\.com\/embed\/([^?&]+)/i);
    if (embedMatch && embedMatch[1]) return embedMatch[1];

    return "";
  }

  function normalizeHtml5VideoUrl(url) {
    if (!url) return "";
    const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (driveFileMatch && driveFileMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
    }

    const driveOpenMatch = url.match(/[?&]id=([^&]+)/i);
    if (/drive\.google\.com/i.test(url) && driveOpenMatch && driveOpenMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${driveOpenMatch[1]}`;
    }

    return url;
  }

  function setHostUIState() {
    const host = isHostFn();
    elements.urlInput.disabled = !host;
    elements.typeSelect.disabled = !host;
    elements.setButton.disabled = !host;
    elements.hostHint.textContent = host
      ? "Host controls are enabled."
      : "Only the host can set or control playback.";
  }

  function loadYouTubeApi() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve();
    }

    if (!ytReadyPromise) {
      ytReadyPromise = new Promise((resolve) => {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function () {
          if (typeof previous === "function") previous();
          resolve();
        };

        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      });
    }

    return ytReadyPromise;
  }

  function startYouTubeSeekMonitor() {
    stopYouTubeSeekMonitor();
    ytLastKnownTime = 0;
    ytLastSampleAt = Date.now();
    ytSeekMonitorTimer = setInterval(() => {
      if (
        !ytPlayer ||
        suppressLocalEvents ||
        !isHostFn() ||
        typeof ytPlayer.getCurrentTime !== "function" ||
        typeof ytPlayer.getPlayerState !== "function"
      ) {
        return;
      }

      const current = ytPlayer.getCurrentTime() || 0;
      const now = Date.now();
      const elapsed = (now - ytLastSampleAt) / 1000;
      const delta = current - ytLastKnownTime;
      const playerState = ytPlayer.getPlayerState();

      if (playerState === window.YT?.PlayerState?.PLAYING) {
        if (Math.abs(delta - elapsed) > YT_SEEK_DELTA_THRESHOLD) {
          emitPlaybackEvent("seek", current);
        }
      } else if (Math.abs(delta) > YT_SEEK_DELTA_THRESHOLD) {
        emitPlaybackEvent("seek", current);
      }

      ytLastKnownTime = current;
      ytLastSampleAt = now;
    }, YT_SEEK_POLL_MS);
  }

  function stopYouTubeSeekMonitor() {
    if (ytSeekMonitorTimer) {
      clearInterval(ytSeekMonitorTimer);
      ytSeekMonitorTimer = null;
    }
  }

  function getLocalTimestamp() {
    if (currentState.video_type === "youtube" && ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
      return ytPlayer.getCurrentTime() || 0;
    }
    if (currentState.video_type === "html5") {
      return elements.html5Player.currentTime || 0;
    }
    return 0;
  }

  function emitToRoom(eventName, payload) {
    if (!socket || !socket.connected || !isHostFn()) return;
    socket.emit(eventName, payload);
  }

  function emitPlaybackEvent(kind, timestamp) {
    const payload = { timestamp: Math.max(0, Number(timestamp || 0)) };
    if (kind === "play") {
      emitToRoom("video_play", payload);
      emitToRoom("play", payload);
      return;
    }
    if (kind === "pause") {
      emitToRoom("video_pause", payload);
      emitToRoom("pause", payload);
      return;
    }
    if (kind === "seek") {
      emitToRoom("video_seek", payload);
      emitToRoom("seek", payload);
    }
  }

  function startHostSync() {
    stopHostSync();
    syncTimer = setInterval(() => {
      if (!socket || !socket.connected || !isHostFn() || !currentState.video_url) return;
      emitToRoom("video_sync", {
        ...currentState,
        timestamp: getLocalTimestamp(),
      });
    }, HOST_SYNC_INTERVAL_MS);
  }

  function stopHostSync() {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  async function ensureYouTubePlayer(videoId, startAt = 0) {
    await loadYouTubeApi();

    if (!ytPlayer) {
      ytPlayer = new window.YT.Player("ytPlayerContainer", {
        height: "360",
        width: "100%",
        videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          start: Math.max(0, Math.floor(startAt || 0)),
        },
        events: {
          onStateChange: onYouTubeStateChange,
        },
      });
      return;
    }

    ytPlayer.loadVideoById(videoId, Math.max(0, Math.floor(startAt || 0)));
  }

  function showPlayer(type) {
    elements.ytContainer.style.display = type === "youtube" ? "block" : "none";
    elements.html5Player.style.display = type === "html5" ? "block" : "none";
  }

  function onYouTubeStateChange(event) {
    if (suppressLocalEvents || !isHostFn()) return;

    ytLastKnownTime = getLocalTimestamp();
    ytLastSampleAt = Date.now();

    if (event.data === window.YT.PlayerState.PLAYING) {
      emitPlaybackEvent("play", getLocalTimestamp());
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      emitPlaybackEvent("pause", getLocalTimestamp());
    }
  }

  function bindHtml5Events() {
    const video = elements.html5Player;
    video.addEventListener("play", () => {
      if (suppressLocalEvents) return;
      emitPlaybackEvent("play", video.currentTime || 0);
    });

    video.addEventListener("pause", () => {
      if (suppressLocalEvents) return;
      emitPlaybackEvent("pause", video.currentTime || 0);
    });

    video.addEventListener("seeked", () => {
      if (suppressLocalEvents) return;
      emitPlaybackEvent("seek", video.currentTime || 0);
    });
  }

  function applyDriftCorrection(serverTimestamp) {
    const localTs = getLocalTimestamp();
    if (Math.abs(localTs - serverTimestamp) <= DRIFT_THRESHOLD_SECONDS) return;

    if (currentState.video_type === "youtube" && ytPlayer && typeof ytPlayer.seekTo === "function") {
      ytPlayer.seekTo(serverTimestamp, true);
      return;
    }

    if (currentState.video_type === "html5") {
      elements.html5Player.currentTime = serverTimestamp;
    }
  }

  async function applyVideoSet(state) {
    currentState = {
      ...currentState,
      ...state,
      timestamp: Number(state.timestamp || 0),
    };

    if (!currentState.video_url) return;

    suppressLocalEvents = true;
    try {
      if (currentState.video_type === "youtube") {
        showPlayer("youtube");
        startYouTubeSeekMonitor();
        const videoId = extractYouTubeId(currentState.video_url);
        if (!videoId) return;
        await ensureYouTubePlayer(videoId, currentState.timestamp || 0);
      } else {
        showPlayer("html5");
        stopYouTubeSeekMonitor();
        const normalized = normalizeHtml5VideoUrl(currentState.video_url);
        if (elements.html5Player.src !== normalized) {
          elements.html5Player.src = normalized;
        }
        elements.html5Player.currentTime = Math.max(0, currentState.timestamp || 0);
      }
    } finally {
      suppressLocalEvents = false;
    }
  }

  async function applyPlaybackState(state) {
    currentState = {
      ...currentState,
      ...state,
      timestamp: Number(state.timestamp || 0),
    };

    suppressLocalEvents = true;
    try {
      applyDriftCorrection(currentState.timestamp || 0);
      if (currentState.video_type === "youtube" && ytPlayer) {
        if (currentState.status === "playing") {
          ytPlayer.playVideo();
        } else {
          ytPlayer.pauseVideo();
        }
      } else if (currentState.video_type === "html5") {
        if (currentState.status === "playing") {
          await elements.html5Player.play().catch(() => {});
        } else {
          elements.html5Player.pause();
        }
      }
    } finally {
      suppressLocalEvents = false;
    }
  }

  function onSetVideoClick() {
    if (!isHostFn()) return;

    const rawUrl = elements.urlInput.value.trim();
    if (!rawUrl) {
      alert("Please provide a video URL");
      return;
    }

    const requestedType = elements.typeSelect.value;
    const videoType = requestedType === "youtube" || requestedType === "html5"
      ? requestedType
      : (isYouTubeUrl(rawUrl) ? "youtube" : "html5");

    const payload = {
      video_url: rawUrl,
      video_type: videoType,
      timestamp: 0,
      status: "paused",
    };

    emitToRoom("video_set", payload);
  }

  function bindSocketHandlers() {
    if (!socket) return;

    socket.on("video_set", (state) => {
      applyVideoSet(state || {});
    });

    socket.on("video_play", (state) => {
      applyPlaybackState({ ...(state || {}), status: "playing" });
    });

    socket.on("video_pause", (state) => {
      applyPlaybackState({ ...(state || {}), status: "paused" });
    });

    socket.on("video_seek", (state) => {
      applyPlaybackState({ ...(state || {}), status: currentState.status || "paused" });
    });

    socket.on("video_sync", (state) => {
      applyPlaybackState(state || {});
    });

    socket.on("play", (payload) => {
      applyPlaybackState({ ...(payload || {}), status: "playing" });
    });

    socket.on("pause", (payload) => {
      applyPlaybackState({ ...(payload || {}), status: "paused" });
    });

    socket.on("seek", (payload) => {
      applyPlaybackState({ ...(payload || {}), status: currentState.status || "paused" });
    });
  }

  function unbindSocketHandlers() {
    if (!socket) return;
    socket.off("video_set");
    socket.off("video_play");
    socket.off("video_pause");
    socket.off("video_seek");
    socket.off("video_sync");
    socket.off("play");
    socket.off("pause");
    socket.off("seek");
  }

  function init(options) {
    isHostFn = options && typeof options.isHost === "function" ? options.isHost : () => false;

    bindHtml5Events();
    elements.setButton.addEventListener("click", onSetVideoClick);
    setHostUIState();
  }

  function attachSocket(newSocket) {
    if (socket === newSocket) return;

    if (socket) {
      unbindSocketHandlers();
      stopHostSync();
    }

    socket = newSocket;
    bindSocketHandlers();
    startHostSync();
  }

  function onRoleUpdated() {
    setHostUIState();
  }

  function reset() {
    stopHostSync();
    stopYouTubeSeekMonitor();
    currentState = {
      video_url: "",
      video_type: "html5",
      timestamp: 0,
      status: "paused",
    };
    showPlayer("html5");
    elements.html5Player.pause();
    elements.html5Player.removeAttribute("src");
    elements.html5Player.load();
  }

  window.WatchParty = {
    init,
    attachSocket,
    onRoleUpdated,
    reset,
  };
})();
