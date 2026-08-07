const ACCOUNTS = {
  xuhan: { label: "Xu Han", short: "XUHAN" },
  yuyang: { label: "Yu Yang", short: "YUYANG" },
};

const PASSCODE_HASH = "e3bae8b911c20ede90e10e4331ab61d4af8d4337015381c9bf1bdc4f63b31f04";
const PRIVATE_MANIFEST_URL = "private-vault/manifest.json";
const HOMEPAGE_PHOTO_KEY = "sBxpnrXnPGYpkslUIz32CS9SljnEKbiQe1yxw9rs81I=";
const RELATIONSHIP_START_DATE = "2026-02-24";
const COVER_ROTATION_MS = 6000;
const REMOTE_SYNC_MS = 3000;
const SYNC_REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const SYNC_API_URL = String(window.ONLY_US_CONFIG?.syncApiUrl || "").replace(/\/+$/, "");
const REMOTE_STATE_MAGIC = "ONLYUS01";
const REMOTE_KDF_ITERATIONS = 310000;

const els = {
  loginView: document.querySelector("#loginView"),
  loginForm: document.querySelector("#loginForm"),
  accountPicker: document.querySelector("#accountPicker"),
  passcodeInput: document.querySelector("#passcodeInput"),
  loginModeText: document.querySelector("#loginModeText"),
  loginError: document.querySelector("#loginError"),
  loginSubmit: document.querySelector("#loginSubmit"),
  spaceShell: document.querySelector("#spaceShell"),
  activeAccountLabel: document.querySelector("#activeAccountLabel"),
  logoutButton: document.querySelector("#logoutButton"),
  tabButtons: document.querySelectorAll(".tab-button"),
  views: document.querySelectorAll(".view-panel"),
  dayCount: document.querySelector("#dayCount"),
  messageCount: document.querySelector("#messageCount"),
  postCount: document.querySelector("#postCount"),
  wishCount: document.querySelector("#wishCount"),
  messageList: document.querySelector("#messageList"),
  chatForm: document.querySelector("#chatForm"),
  messageInput: document.querySelector("#messageInput"),
  recordButton: document.querySelector("#recordButton"),
  stopRecordButton: document.querySelector("#stopRecordButton"),
  clearVoiceButton: document.querySelector("#clearVoiceButton"),
  voicePreviewWrap: document.querySelector("#voicePreviewWrap"),
  voicePreview: document.querySelector("#voicePreview"),
  dailyForm: document.querySelector("#dailyForm"),
  postTitle: document.querySelector("#postTitle"),
  postMood: document.querySelector("#postMood"),
  postBody: document.querySelector("#postBody"),
  postAttachment: document.querySelector("#postAttachment"),
  attachmentLabel: document.querySelector("#attachmentLabel"),
  postList: document.querySelector("#postList"),
  albumGrid: document.querySelector("#albumGrid"),
  loginPhotoFrames: document.querySelectorAll("[data-login-photo-slot]"),
  dynamicCoverFrames: document.querySelectorAll(".cover-stack .dynamic-cover-frame"),
  wishForm: document.querySelector("#wishForm"),
  wishInput: document.querySelector("#wishInput"),
  wishList: document.querySelector("#wishList"),
  photoDialog: document.querySelector("#photoDialog"),
  closePhotoDialog: document.querySelector("#closePhotoDialog"),
  dialogImage: document.querySelector("#dialogImage"),
  dialogCaption: document.querySelector("#dialogCaption"),
  toast: document.querySelector("#toast"),
};

let activeAccount = "xuhan";
let selectedAccount = "xuhan";
let recordedVoice = null;
let mediaRecorder = null;
let recordingChunks = [];
let toastTimer = null;
let coverTimer = null;
let loginPhotoTimer = null;
let remoteSyncTimer = null;
let remoteMutationInProgress = false;
let featuredPhotos = [];
let coverRotationIndex = 0;
let loginPhotoRotationIndex = 0;
let builtInPhotos = [];
let spacePasscode = "";
let remoteSha = null;
let remoteState = emptyRemoteState();
const objectUrls = new Set();
const privatePhotoUrls = new Set();

init();

async function init() {
  setupLoginMode();
  bindEvents();
  void loadHomepagePhotos();
}

function bindEvents() {
  els.accountPicker.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="account"]')) return;
    selectedAccount = event.target.value;
    els.loginError.textContent = "";
  });

  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", logout);
  els.chatForm.addEventListener("submit", sendMessage);
  els.recordButton.addEventListener("click", startRecording);
  els.stopRecordButton.addEventListener("click", stopRecording);
  els.clearVoiceButton.addEventListener("click", clearVoice);
  els.dailyForm.addEventListener("submit", savePost);
  els.postAttachment.addEventListener("change", updateAttachmentLabel);
  els.wishForm.addEventListener("submit", saveWish);
  els.closePhotoDialog.addEventListener("click", () => els.photoDialog.close());

  els.tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function setupLoginMode() {
  els.loginModeText.textContent = "选择账号，输入空间暗号进入你们的小空间";
}

async function handleLogin(event) {
  event.preventDefault();
  els.loginError.textContent = "";

  const passcode = els.passcodeInput.value.trim();

  if (!passcode) {
    els.loginError.textContent = "请输入空间暗号";
    return;
  }

  if ((await hashPasscode(passcode)) !== PASSCODE_HASH) {
    els.loginError.textContent = "暗号不正确，请重新输入";
    els.passcodeInput.select();
    return;
  }

  els.loginSubmit.disabled = true;
  els.loginSubmit.textContent = "正在解锁...";

  try {
    spacePasscode = passcode;
    await loadRemoteState({ force: true });
    activeAccount = selectedAccount;
    els.passcodeInput.value = "";
    await enterSpace();
  } catch (error) {
    spacePasscode = "";
    els.loginError.textContent = loginErrorMessage(error);
  } finally {
    els.loginSubmit.disabled = false;
    els.loginSubmit.textContent = "进入空间";
  }
}

function loginErrorMessage(error) {
  if (error.name === "AbortError") return "同步服务响应超时，请稍后重试";
  if (location.protocol === "file:") return "请通过 GitHub Pages 链接打开网站";
  if (!isSyncApiConfigured()) return "请先在 config.js 中配置 Worker 地址";
  if (error.status === 401) return "空间暗号验证失败";
  if (error.status === 403) return "当前网站地址没有同步权限";
  return "连接同步服务失败，请稍后重试";
}

function isSyncApiConfigured() {
  return /^https:\/\//.test(SYNC_API_URL) && !SYNC_API_URL.includes("PASTE_YOUR_WORKER_URL_HERE");
}

async function hashPasscode(passcode) {
  const bytes = new TextEncoder().encode(passcode);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadHomepagePhotos() {
  releasePrivatePhotoUrls();
  builtInPhotos = [];

  try {
    const manifestResponse = await fetch(PRIVATE_MANIFEST_URL, { cache: "no-cache" });
    if (!manifestResponse.ok) throw new Error("homepage photo manifest unavailable");

    const manifest = await manifestResponse.json();
    if (manifest.version !== 2 || manifest.cipher !== "AES-GCM") {
      throw new Error("unsupported homepage photo format");
    }

    const key = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(HOMEPAGE_PHOTO_KEY),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const selectedPhotos = manifest.photos.filter((photo) => photo.featured !== false);
    const decryptedPhotos = new Array(selectedPhotos.length);

    const outcomes = await Promise.allSettled(selectedPhotos.map(async (photo, index) => {
      const photoUrl = new URL(photo.file, manifestResponse.url);
      photoUrl.searchParams.set("v", photo.sha256.slice(0, 12));
      const response = await fetch(photoUrl.href, { cache: "force-cache" });
      if (!response.ok) throw new Error(`homepage photo unavailable: ${photo.id}`);

      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(photo.iv) },
        key,
        await response.arrayBuffer(),
      );
      const url = URL.createObjectURL(new Blob([plaintext], { type: photo.mimeType }));
      privatePhotoUrls.add(url);
      decryptedPhotos[index] = { src: url, caption: photo.caption };
      builtInPhotos = decryptedPhotos.filter(Boolean);
      syncLoginPhotos(builtInPhotos);
    }));

    builtInPhotos = decryptedPhotos.filter(Boolean);
    if (builtInPhotos.length === 0) throw new Error("no homepage photos could be loaded");
    outcomes
      .filter((outcome) => outcome.status === "rejected")
      .forEach((outcome) => console.warn("A homepage photo could not be loaded.", outcome.reason));
    if (!els.spaceShell.classList.contains("is-hidden")) await refreshAll();
  } catch (error) {
    releasePrivatePhotoUrls();
    builtInPhotos = [];
    console.error("Homepage photos could not be loaded.", error);
  }
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function enterSpace() {
  els.loginView.classList.add("is-hidden");
  els.spaceShell.classList.remove("is-hidden");
  els.activeAccountLabel.textContent = ACCOUNTS[activeAccount].short;
  await refreshAll();
  startRemoteSync();
}

function logout() {
  els.spaceShell.classList.add("is-hidden");
  els.loginView.classList.remove("is-hidden");
  releaseObjectUrls();
  featuredPhotos = [];
  remoteState = emptyRemoteState();
  remoteSha = null;
  spacePasscode = "";
  window.clearInterval(coverTimer);
  window.clearInterval(loginPhotoTimer);
  window.clearInterval(remoteSyncTimer);
  setupLoginMode();
  syncLoginPhotos(builtInPhotos);
}

function switchView(viewId) {
  els.tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  });
  els.views.forEach((view) => {
    view.classList.toggle("is-active", view.id === viewId);
  });
}

async function refreshAll() {
  const [messages, posts, wishes] = await Promise.all([
    getAll("messages"),
    getAll("posts"),
    getAll("wishes"),
  ]);

  renderMessages(messages);
  renderPosts(posts);
  renderWishes(wishes);
  const albumPhotos = buildAlbumPhotos(posts);
  renderAlbum(albumPhotos);
  syncFeaturedPhotos(albumPhotos);
  renderStats(messages, posts, wishes);
}

function renderStats(messages, posts, wishes) {
  els.messageCount.textContent = messages.length;
  els.postCount.textContent = posts.length;
  els.wishCount.textContent = wishes.filter((wish) => !wish.done).length;

  const start = new Date(`${RELATIONSHIP_START_DATE}T00:00:00`);
  const now = new Date();
  const diff = Math.max(0, Math.floor((stripTime(now) - stripTime(start)) / 86400000) + 1);
  els.dayCount.textContent = String(diff);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function sendMessage(event) {
  event.preventDefault();
  const text = els.messageInput.value.trim();
  if (!text && !recordedVoice) {
    showToast("写点文字或录一段语音");
    return;
  }

  if (recordedVoice && recordedVoice.size > MAX_ATTACHMENT_BYTES) {
    showToast("语音不能超过 8MB");
    return;
  }

  await put("messages", {
    id: crypto.randomUUID(),
    author: activeAccount,
    text,
    voiceBlob: recordedVoice,
    voiceType: recordedVoice?.type || "",
    createdAt: Date.now(),
  });

  els.messageInput.value = "";
  clearVoice();
  await refreshAll();
  scrollMessagesToBottom();
}

function renderMessages(messages) {
  releaseObjectUrls();
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  els.messageList.replaceChildren();

  if (!sorted.length) {
    els.messageList.append(emptyState("这里会放下你们慢慢说出口的话"));
    return;
  }

  sorted.forEach((message) => {
    const item = document.createElement("article");
    item.className = `message ${message.author === activeAccount ? "mine" : "partner"}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.append(span(ACCOUNTS[message.author]?.label || message.author));
    meta.append(span(formatDateTime(message.createdAt)));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "icon-delete";
    removeButton.textContent = "删除";
    removeButton.addEventListener("click", async () => {
      await del("messages", message.id);
      await refreshAll();
    });
    meta.append(removeButton);
    item.append(meta);

    if (message.text) {
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = message.text;
      item.append(text);
    }

    if (message.voiceBlob) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = objectUrl(message.voiceBlob);
      item.append(audio);
    }

    els.messageList.append(item);
  });
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("当前浏览器不支持录音");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordingChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", () => {
      recordedVoice = new Blob(recordingChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      els.voicePreview.src = objectUrl(recordedVoice);
      els.voicePreviewWrap.classList.remove("is-hidden");
      stream.getTracks().forEach((track) => track.stop());
      els.recordButton.disabled = false;
      els.stopRecordButton.disabled = true;
      showToast("语音已录好");
    });
    mediaRecorder.start();
    els.recordButton.disabled = true;
    els.stopRecordButton.disabled = false;
    showToast("正在录音");
  } catch (error) {
    showToast("没有拿到麦克风权限");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

function clearVoice() {
  recordedVoice = null;
  els.voicePreview.removeAttribute("src");
  els.voicePreviewWrap.classList.add("is-hidden");
}

async function savePost(event) {
  event.preventDefault();
  const title = els.postTitle.value.trim();
  const body = els.postBody.value.trim();
  const file = els.postAttachment.files[0];

  if (!title && !body && !file) {
    showToast("留下点今天的内容");
    return;
  }

  if (file && file.size > MAX_ATTACHMENT_BYTES) {
    showToast("单个附件不能超过 8MB");
    return;
  }

  await put("posts", {
    id: crypto.randomUUID(),
    author: activeAccount,
    title: title || "没有标题的一天",
    mood: els.postMood.value,
    body,
    attachmentBlob: file || null,
    attachmentName: file?.name || "",
    attachmentType: file?.type || "",
    createdAt: Date.now(),
  });

  els.dailyForm.reset();
  updateAttachmentLabel();
  await refreshAll();
  showToast("日常已保存");
}

function updateAttachmentLabel() {
  const file = els.postAttachment.files[0];
  els.attachmentLabel.textContent = file ? file.name : "添加照片、音频或视频";
}

function renderPosts(posts) {
  const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  els.postList.replaceChildren();

  if (!sorted.length) {
    els.postList.append(emptyState("日常会在这里慢慢变多"));
    return;
  }

  sorted.forEach((post) => {
    const card = document.createElement("article");
    card.className = "post-card";

    const header = document.createElement("header");
    const titleWrap = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = post.title;
    const meta = document.createElement("p");
    meta.className = "meta-line";
    meta.textContent = `${ACCOUNTS[post.author]?.label || post.author} · ${formatDateTime(post.createdAt)}`;
    titleWrap.append(title, meta);

    const mood = document.createElement("span");
    mood.className = "mood-badge";
    mood.textContent = post.mood || "甜";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button";
    removeButton.textContent = "删除";
    removeButton.addEventListener("click", async () => {
      await del("posts", post.id);
      await refreshAll();
    });

    header.append(titleWrap, mood, removeButton);
    card.append(header);

    if (post.body) {
      const body = document.createElement("p");
      body.className = "post-body";
      body.textContent = post.body;
      card.append(body);
    }

    const media = renderAttachment(post);
    if (media) card.append(media);
    els.postList.append(card);
  });
}

function renderAttachment(post) {
  if (!post.attachmentBlob) return null;
  const url = objectUrl(post.attachmentBlob);

  if (post.attachmentType?.startsWith("image/")) {
    const image = document.createElement("img");
    image.className = "post-media";
    image.src = url;
    image.alt = post.attachmentName || "日常照片";
    image.addEventListener("click", () => openPhoto(url, post.title));
    return image;
  }

  if (post.attachmentType?.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = url;
    return audio;
  }

  if (post.attachmentType?.startsWith("video/")) {
    const video = document.createElement("video");
    video.controls = true;
    video.className = "post-media";
    video.src = url;
    return video;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = post.attachmentName || "attachment";
  link.textContent = post.attachmentName || "下载附件";
  return link;
}

function buildAlbumPhotos(posts) {
  const uploadedPhotos = posts
    .filter((post) => post.attachmentBlob && post.attachmentType?.startsWith("image/"))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((post) => ({
      src: objectUrl(post.attachmentBlob),
      caption: post.title || "日常照片",
    }));

  return [...uploadedPhotos, ...builtInPhotos];
}

function renderAlbum(photos) {
  els.albumGrid.replaceChildren();

  photos.forEach((photo) => {
    els.albumGrid.append(photoTile(photo.src, photo.caption));
  });
}

function syncFeaturedPhotos(photos) {
  featuredPhotos = photos;
  coverRotationIndex = 0;
  updateFeaturedCovers();

  window.clearInterval(coverTimer);
  if (featuredPhotos.length > 3) {
    coverTimer = window.setInterval(() => {
      coverRotationIndex = (coverRotationIndex + 1) % featuredPhotos.length;
      updateFeaturedCovers();
    }, COVER_ROTATION_MS);
  }
}

function syncLoginPhotos(photos) {
  loginPhotoRotationIndex = 0;
  updateLoginPhotos(photos);

  window.clearInterval(loginPhotoTimer);
  if (photos.length > 3) {
    loginPhotoTimer = window.setInterval(() => {
      loginPhotoRotationIndex = (loginPhotoRotationIndex + 1) % photos.length;
      updateLoginPhotos(photos);
    }, COVER_ROTATION_MS);
  }
}

function updateLoginPhotos(photos) {
  els.loginPhotoFrames.forEach((frame) => {
    const slot = Number(frame.dataset.loginPhotoSlot || 0);
    const photo = photos[(loginPhotoRotationIndex + slot) % photos.length];
    if (!photo) return;
    crossfadeCover(frame, photo);
  });
}

function updateFeaturedCovers() {
  els.dynamicCoverFrames.forEach((frame) => {
    const slot = Number(frame.dataset.coverSlot || 0);
    const photo = featuredPhotos[(coverRotationIndex + slot) % featuredPhotos.length];
    if (!photo) return;
    crossfadeCover(frame, photo);
  });
}

function crossfadeCover(frame, photo) {
  const layers = Array.from(frame.querySelectorAll(".cover-layer"));
  const activeLayer = layers.find((layer) => layer.classList.contains("is-active"));
  const nextLayer = layers.find((layer) => layer !== activeLayer);
  const activeSource = activeLayer?.dataset.source || activeLayer?.getAttribute("src");

  if (!activeLayer || !nextLayer || activeSource === photo.src) return;

  frame.dataset.pendingSource = photo.src;
  nextLayer.src = photo.src;
  nextLayer.alt = photo.caption;
  nextLayer.dataset.source = photo.src;

  const reveal = () => {
    if (frame.dataset.pendingSource !== photo.src) return;
    requestAnimationFrame(() => {
      nextLayer.classList.add("is-active");
      activeLayer.classList.remove("is-active");
    });
  };

  if (nextLayer.complete && nextLayer.naturalWidth > 0) {
    reveal();
  } else {
    nextLayer.addEventListener("load", reveal, { once: true });
  }
}

function photoTile(src, caption) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "photo-tile";

  const image = document.createElement("img");
  image.src = src;
  image.alt = caption;
  const label = document.createElement("span");
  label.textContent = caption;
  button.append(image, label);
  button.addEventListener("click", () => openPhoto(src, caption));
  return button;
}

function openPhoto(src, caption) {
  els.dialogImage.src = src;
  els.dialogCaption.textContent = caption;
  if (typeof els.photoDialog.showModal === "function") {
    els.photoDialog.showModal();
  }
}

async function saveWish(event) {
  event.preventDefault();
  const text = els.wishInput.value.trim();
  if (!text) {
    showToast("写下一个愿望");
    return;
  }

  await put("wishes", {
    id: crypto.randomUUID(),
    author: activeAccount,
    text,
    done: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  els.wishInput.value = "";
  await refreshAll();
}

function renderWishes(wishes) {
  const sorted = [...wishes].sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
  els.wishList.replaceChildren();

  if (!sorted.length) {
    els.wishList.append(emptyState("想一起完成的事会放在这里"));
    return;
  }

  sorted.forEach((wish) => {
    const item = document.createElement("article");
    item.className = `wish-item ${wish.done ? "is-done" : ""}`;

    const copy = document.createElement("label");
    copy.className = "wish-copy";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = wish.done;
    checkbox.addEventListener("change", async () => {
      wish.done = checkbox.checked;
      wish.updatedAt = Date.now();
      await put("wishes", wish);
      await refreshAll();
    });
    const text = document.createElement("span");
    text.textContent = wish.text;
    copy.append(checkbox, text);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button";
    removeButton.textContent = "删除";
    removeButton.addEventListener("click", async () => {
      await del("wishes", wish.id);
      await refreshAll();
    });

    item.append(copy, removeButton);
    els.wishList.append(item);
  });
}

async function serializeBlobs(items) {
  return Promise.all(
    items.map(async (item) => {
      const copy = { ...item };
      if (copy.voiceBlob) {
        copy.voiceData = await blobToDataUrl(copy.voiceBlob);
        delete copy.voiceBlob;
      }
      if (copy.attachmentBlob) {
        copy.attachmentData = await blobToDataUrl(copy.attachmentBlob);
        delete copy.attachmentBlob;
      }
      return copy;
    }),
  );
}

async function deserializeBlobs(items) {
  return Promise.all(
    items.map(async (item) => {
      const copy = { ...item };
      if (copy.voiceData) {
        copy.voiceBlob = dataUrlToBlob(copy.voiceData);
        delete copy.voiceData;
      }
      if (copy.attachmentData) {
        copy.attachmentBlob = dataUrlToBlob(copy.attachmentData);
        delete copy.attachmentData;
      }
      return copy;
    }),
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function emptyRemoteState() {
  return { messages: [], posts: [], wishes: [] };
}

async function syncRequest(path, options = {}) {
  if (!isSyncApiConfigured()) throw new Error("sync API is not configured");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(`${SYNC_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-Space-Passcode": spacePasscode,
        ...options.headers,
      },
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = new Error(`Sync request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.status === 204 ? null : response.json();
}

async function loadRemoteState({ force = false } = {}) {
  const result = await syncRequest("/state");
  if (!result.exists) {
    remoteState = emptyRemoteState();
    remoteSha = null;
    return true;
  }

  if (!force && result.sha === remoteSha) return false;
  if (!result.content) throw new Error("remote state content unavailable");

  remoteState = await decryptRemoteState(base64ToBytes(result.content));
  remoteSha = result.sha;
  return true;
}

async function saveRemoteState(message) {
  const encryptedBytes = await encryptRemoteState();
  if (encryptedBytes.length > 90 * 1024 * 1024) {
    throw new Error("remote state is too large");
  }
  const body = {
    message,
    content: bytesToBase64(encryptedBytes),
  };
  if (remoteSha) body.sha = remoteSha;

  const result = await syncRequest("/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  remoteSha = result.sha;
}

async function encryptRemoteState() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveRemoteKey(salt);
  const serializable = {
    version: 1,
    messages: await serializeBlobs(remoteState.messages),
    posts: await serializeBlobs(remoteState.posts),
    wishes: remoteState.wishes,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(serializable));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const magic = new TextEncoder().encode(REMOTE_STATE_MAGIC);
  const output = new Uint8Array(magic.length + salt.length + iv.length + ciphertext.length);
  output.set(magic, 0);
  output.set(salt, magic.length);
  output.set(iv, magic.length + salt.length);
  output.set(ciphertext, magic.length + salt.length + iv.length);
  return output;
}

async function decryptRemoteState(bytes) {
  const magicLength = REMOTE_STATE_MAGIC.length;
  const minimumLength = magicLength + 16 + 12 + 16;
  if (bytes.length < minimumLength) throw new Error("remote state is invalid");

  const magic = new TextDecoder().decode(bytes.slice(0, magicLength));
  if (magic !== REMOTE_STATE_MAGIC) throw new Error("remote state format is invalid");

  const salt = bytes.slice(magicLength, magicLength + 16);
  const iv = bytes.slice(magicLength + 16, magicLength + 28);
  const ciphertext = bytes.slice(magicLength + 28);
  const key = await deriveRemoteKey(salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));

  if (parsed.version !== 1) throw new Error("remote state version is unsupported");
  return {
    messages: await deserializeBlobs(parsed.messages || []),
    posts: await deserializeBlobs(parsed.posts || []),
    wishes: parsed.wishes || [],
  };
}

async function deriveRemoteKey(salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(spacePasscode),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: REMOTE_KDF_ITERATIONS,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 32768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function getAll(storeName) {
  return [...(remoteState[storeName] || [])];
}

async function put(storeName, value) {
  const apply = () => {
    const items = remoteState[storeName];
    const index = items.findIndex((item) => item.id === value.id);
    if (index >= 0) items[index] = value;
    else items.push(value);
  };

  await mutateRemoteState(apply, `Update ${storeName} by ${activeAccount}`);
  return value.id;
}

async function del(storeName, id) {
  const apply = () => {
    remoteState[storeName] = remoteState[storeName].filter((item) => item.id !== id);
  };

  await mutateRemoteState(apply, `Delete from ${storeName} by ${activeAccount}`);
}

async function mutateRemoteState(apply, message) {
  remoteMutationInProgress = true;
  apply();

  try {
    await saveRemoteState(message);
  } catch (error) {
    if (error.status !== 409 && error.status !== 422) {
      showToast("GitHub 同步失败，请重试");
      throw error;
    }
    await loadRemoteState({ force: true });
    apply();
    await saveRemoteState(message);
  } finally {
    remoteMutationInProgress = false;
  }
}

function startRemoteSync() {
  window.clearInterval(remoteSyncTimer);
  remoteSyncTimer = window.setInterval(async () => {
    if (remoteMutationInProgress || !spacePasscode || !isSyncApiConfigured()) return;
    try {
      const changed = await loadRemoteState();
      if (changed) await refreshAll();
    } catch (error) {
      // A temporary network failure should not interrupt the current view.
    }
  }, REMOTE_SYNC_MS);
}

function emptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
}

function span(text) {
  const item = document.createElement("span");
  item.textContent = text;
  return item;
}

function objectUrl(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.add(url);
  return url;
}

function releasePrivatePhotoUrls() {
  privatePhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  privatePhotoUrls.clear();
}

function releaseObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    els.messageList.scrollTop = els.messageList.scrollHeight;
  });
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2200);
}
