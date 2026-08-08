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
const SYNC_REQUEST_TIMEOUT_MS = 12000;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const IMAGE_MAX_EDGE = 1600;
const IMAGE_WEBP_QUALITY = 0.76;
const MESSAGE_PAGE_SIZE = 20;
const POST_PAGE_SIZE = 6;
const PRELOAD_PAGES = 1;
const SYNC_API_URL = String(window.ONLY_US_CONFIG?.syncApiUrl || "").replace(/\/+$/, "");
const REMOTE_STATE_MAGIC_V1 = "ONLYUS01";
const REMOTE_STATE_MAGIC_V2 = "ONLYUS02";
const REMOTE_LEGACY_KDF_ITERATIONS = 310000;
const REMOTE_KEY_CONTEXT = "only-us-state-v2:2026-02-24:";

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
  clearVoiceButton: document.querySelector("#clearVoiceButton"),
  voicePreviewWrap: document.querySelector("#voicePreviewWrap"),
  voicePreview: document.querySelector("#voicePreview"),
  messagePhotoInput: document.querySelector("#messagePhotoInput"),
  clearMessagePhotoButton: document.querySelector("#clearMessagePhotoButton"),
  messagePhotoPreviewWrap: document.querySelector("#messagePhotoPreviewWrap"),
  messagePhotoPreview: document.querySelector("#messagePhotoPreview"),
  dailyForm: document.querySelector("#dailyForm"),
  postTitle: document.querySelector("#postTitle"),
  postMood: document.querySelector("#postMood"),
  postBody: document.querySelector("#postBody"),
  postAttachment: document.querySelector("#postAttachment"),
  attachmentLabel: document.querySelector("#attachmentLabel"),
  savePostButton: document.querySelector("#savePostButton"),
  postList: document.querySelector("#postList"),
  albumForm: document.querySelector("#albumForm"),
  albumPhotoInput: document.querySelector("#albumPhotoInput"),
  albumUploadLabel: document.querySelector("#albumUploadLabel"),
  albumCaption: document.querySelector("#albumCaption"),
  saveAlbumButton: document.querySelector("#saveAlbumButton"),
  albumGrid: document.querySelector("#albumGrid"),
  featuredPhotoCount: document.querySelector("#featuredPhotoCount"),
  loginPhotoFrames: document.querySelectorAll("[data-login-photo-slot]"),
  dynamicCoverFrames: document.querySelectorAll(".cover-stack .dynamic-cover-frame"),
  wishForm: document.querySelector("#wishForm"),
  wishInput: document.querySelector("#wishInput"),
  wishList: document.querySelector("#wishList"),
  photoDialog: document.querySelector("#photoDialog"),
  closePhotoDialog: document.querySelector("#closePhotoDialog"),
  dialogImage: document.querySelector("#dialogImage"),
  dialogCaption: document.querySelector("#dialogCaption"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmCancel: document.querySelector("#confirmCancel"),
  confirmDelete: document.querySelector("#confirmDelete"),
  toast: document.querySelector("#toast"),
  syncRetryButton: document.querySelector("#syncRetryButton"),
  syncStatusText: document.querySelector("#syncStatusText"),
};

let activeAccount = "xuhan";
let selectedAccount = "xuhan";
let recordedVoice = null;
let messagePhoto = null;
let messagePhotoPreviewUrl = "";
let mediaRecorder = null;
let recordingChunks = [];
let toastTimer = null;
let coverTimer = null;
let loginPhotoTimer = null;
let remoteSyncTimer = null;
let remoteMutationInProgress = false;
let remoteReadInProgress = false;
let activeReadAbortController = null;
let mutationQueue = Promise.resolve();
let remoteStateWasLegacy = false;
let featuredPhotos = [];
let coverRotationIndex = 0;
let loginPhotoRotationIndex = 0;
let builtInPhotos = [];
let spacePasscode = "";
let remoteSha = null;
let remoteState = emptyRemoteState();
let messageVisibleCount = MESSAGE_PAGE_SIZE * (PRELOAD_PAGES + 1);
let postVisibleCount = POST_PAGE_SIZE * (PRELOAD_PAGES + 1);
let previousMessageScrollTop = 0;
let previousPostScrollTop = 0;
let confirmResolver = null;
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
  els.recordButton.addEventListener("click", toggleRecording);
  els.clearVoiceButton.addEventListener("click", clearVoice);
  els.messagePhotoInput.addEventListener("change", prepareMessagePhoto);
  els.clearMessagePhotoButton.addEventListener("click", clearMessagePhoto);
  els.dailyForm.addEventListener("submit", savePost);
  els.postAttachment.addEventListener("change", updateAttachmentLabel);
  els.albumForm.addEventListener("submit", saveAlbumPhotos);
  els.albumPhotoInput.addEventListener("change", updateAlbumUploadLabel);
  els.syncRetryButton.addEventListener("click", () => void syncNow({ force: true, showProgress: true }));
  els.wishForm.addEventListener("submit", saveWish);
  els.closePhotoDialog.addEventListener("click", () => els.photoDialog.close());
  els.confirmCancel.addEventListener("click", () => closeConfirm(false));
  els.confirmDelete.addEventListener("click", () => closeConfirm(true));
  els.confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeConfirm(false);
  });
  els.messageList.addEventListener("scroll", handleMessageScroll, { passive: true });
  els.postList.addEventListener("scroll", handlePostScroll, { passive: true });

  els.tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
}

function setupLoginMode() {
  els.loginModeText.textContent = "把今天也留在只属于你们的地方";
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
  els.loginSubmit.textContent = "正在进入...";

  try {
    spacePasscode = passcode;
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
      decryptedPhotos[index] = {
        id: `builtin:${photo.id}`,
        source: "builtin",
        src: url,
        caption: photo.caption,
      };
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
  resetPagination();
  els.loginView.classList.add("is-hidden");
  els.spaceShell.classList.remove("is-hidden");
  els.activeAccountLabel.textContent = ACCOUNTS[activeAccount].short;
  setSyncStatus("syncing", "正在同步记录");
  await refreshAll();
  startRemoteSync();
  void syncNow({ force: true, showProgress: true });
}

function logout() {
  els.spaceShell.classList.add("is-hidden");
  els.loginView.classList.remove("is-hidden");
  releaseObjectUrls();
  featuredPhotos = [];
  remoteState = emptyRemoteState();
  remoteSha = null;
  remoteStateWasLegacy = false;
  resetPagination();
  clearVoice();
  clearMessagePhoto();
  spacePasscode = "";
  window.clearInterval(coverTimer);
  window.clearInterval(loginPhotoTimer);
  window.clearInterval(remoteSyncTimer);
  setupLoginMode();
  setSyncStatus("idle", "准备同步");
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
  releaseObjectUrls();
  const [messages, posts, wishes, photos] = await Promise.all([
    getAll("messages"),
    getAll("posts"),
    getAll("wishes"),
    getAll("photos"),
  ]);

  renderMessages(messages);
  renderPosts(posts);
  renderWishes(wishes);
  const albumPhotos = buildAlbumPhotos(posts, photos);
  renderAlbum(albumPhotos);
  const selectedPhotos = Array.isArray(remoteState.featuredPhotoIds)
    ? albumPhotos.filter((photo) => remoteState.featuredPhotoIds.includes(photo.id))
    : albumPhotos;
  syncFeaturedPhotos(selectedPhotos);
  els.featuredPhotoCount.textContent = `${selectedPhotos.length} 张用于轮播`;
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
  if (!text && !recordedVoice && !messagePhoto) {
    showToast("写点文字、录一段语音或选一张照片");
    return;
  }

  if (recordedVoice && recordedVoice.size > MAX_ATTACHMENT_BYTES) {
    showToast("语音不能超过 8MB");
    return;
  }

  const voice = recordedVoice;
  const photo = messagePhoto;
  const submitButton = els.chatForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "发送中...";

  try {
    await put("messages", {
      id: crypto.randomUUID(),
      author: activeAccount,
      text,
      voiceBlob: voice,
      voiceType: voice?.type || "",
      imageBlob: photo,
      imageType: photo?.type || "",
      imageName: photo?.name || "",
      createdAt: Date.now(),
    });
    els.messageInput.value = "";
    clearVoice();
    clearMessagePhoto();
    scrollMessagesToBottom();
    showToast("心里话已送达");
  } catch (error) {
    showToast("发送失败，内容还留在输入框中");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "发送";
  }
}

function renderMessages(messages) {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const startIndex = Math.max(0, sorted.length - messageVisibleCount);
  const visibleMessages = sorted.slice(startIndex);
  els.messageList.replaceChildren();

  if (!sorted.length) {
    els.messageList.append(emptyState("这里会放下你们慢慢说出口的话"));
    return;
  }

  if (startIndex > 0) {
    els.messageList.append(paginationHint(`上滑加载更早的 ${Math.min(MESSAGE_PAGE_SIZE, startIndex)} 条`));
  }

  visibleMessages.forEach((message) => {
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
      if (!await confirmDelete("删除这条心里话？", "文字、语音和照片都会一起删除，且无法恢复。")) return;
      await runDelete(() => del("messages", message.id), "心里话已删除");
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

    if (message.imageBlob) {
      const image = document.createElement("img");
      const url = objectUrl(message.imageBlob);
      image.className = "message-photo";
      image.src = url;
      image.alt = message.imageName || "心里话照片";
      image.addEventListener("click", () => openPhoto(url, message.text || "心里话照片"));
      item.append(image);
    }

    els.messageList.append(item);
  });
}

function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    stopRecording();
    return;
  }
  void startRecording();
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
      els.recordButton.classList.remove("is-recording");
      els.recordButton.textContent = "录音";
      showToast("语音已录好");
    });
    mediaRecorder.start();
    els.recordButton.classList.add("is-recording");
    els.recordButton.textContent = "停止";
    showToast("正在录音");
  } catch (error) {
    els.recordButton.classList.remove("is-recording");
    els.recordButton.textContent = "录音";
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

async function prepareMessagePhoto() {
  const file = els.messagePhotoInput.files[0];
  if (!file) {
    clearMessagePhoto();
    return;
  }

  els.messagePhotoInput.disabled = true;
  showToast("正在压缩照片...");
  try {
    const compressed = await compressImageFile(file);
    if (compressed.size > MAX_ATTACHMENT_BYTES) {
      showToast("照片压缩后仍超过 8MB，请换一张");
      clearMessagePhoto();
      return;
    }
    messagePhoto = compressed;
    if (messagePhotoPreviewUrl) URL.revokeObjectURL(messagePhotoPreviewUrl);
    messagePhotoPreviewUrl = URL.createObjectURL(compressed);
    els.messagePhotoPreview.src = messagePhotoPreviewUrl;
    els.messagePhotoPreviewWrap.classList.remove("is-hidden");
  } catch (error) {
    clearMessagePhoto();
    showToast("照片处理失败，请换一张重试");
  } finally {
    els.messagePhotoInput.disabled = false;
  }
}

function clearMessagePhoto() {
  messagePhoto = null;
  els.messagePhotoInput.value = "";
  els.messagePhotoPreview.removeAttribute("src");
  els.messagePhotoPreviewWrap.classList.add("is-hidden");
  if (messagePhotoPreviewUrl) URL.revokeObjectURL(messagePhotoPreviewUrl);
  messagePhotoPreviewUrl = "";
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

  els.savePostButton.disabled = true;

  try {
    let attachment = file || null;
    if (attachment?.type.startsWith("image/")) {
      els.savePostButton.textContent = "正在压缩照片...";
      attachment = await compressImageFile(attachment);
    }

    if (attachment && attachment.size > MAX_ATTACHMENT_BYTES) {
      showToast("压缩后仍超过 8MB，请换一个文件");
      return;
    }

    els.savePostButton.textContent = "正在保存...";
    await put("posts", {
      id: crypto.randomUUID(),
      author: activeAccount,
      title: title || "没有标题的一天",
      mood: els.postMood.value,
      body,
      attachmentBlob: attachment,
      attachmentName: attachment?.name || "",
      attachmentType: attachment?.type || "",
      createdAt: Date.now(),
    });

    els.dailyForm.reset();
    updateAttachmentLabel();
    scrollPostsToBottom();
    showToast("日常已保存");
  } catch (error) {
    showToast("保存失败，请检查同步状态后重试");
  } finally {
    els.savePostButton.disabled = false;
    els.savePostButton.textContent = "保存日常";
  }
}

function updateAttachmentLabel() {
  const file = els.postAttachment.files[0];
  if (!file) {
    els.attachmentLabel.textContent = "添加照片、音频或视频";
    return;
  }
  els.attachmentLabel.textContent = file.type.startsWith("image/")
    ? `${file.name} · 保存时自动压缩`
    : file.name;
}

async function compressImageFile(file) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();

  try {
    image.src = sourceUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("image decode failed"));
    });

    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, IMAGE_MAX_EDGE / longestEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let compressed = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/webp", IMAGE_WEBP_QUALITY);
    });
    if (!compressed) {
      compressed = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", IMAGE_WEBP_QUALITY);
      });
    }
    if (!compressed || (compressed.size >= file.size && file.size <= MAX_ATTACHMENT_BYTES)) return file;

    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    const extension = compressed.type === "image/webp" ? "webp" : "jpg";
    return new File([compressed], `${stem}.${extension}`, {
      type: compressed.type,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function renderPosts(posts) {
  const sorted = [...posts].sort((a, b) => a.createdAt - b.createdAt);
  const startIndex = Math.max(0, sorted.length - postVisibleCount);
  const visiblePosts = sorted.slice(startIndex);
  els.postList.replaceChildren();

  if (!sorted.length) {
    els.postList.append(emptyState("日常会在这里慢慢变多"));
    return;
  }

  if (startIndex > 0) {
    els.postList.append(paginationHint(`上滑加载更早的 ${Math.min(POST_PAGE_SIZE, startIndex)} 条`));
  }

  visiblePosts.forEach((post) => {
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
      if (!await confirmDelete("删除这条日常？", "日常中的文字、照片、语音或视频都会一起删除。")) return;
      await runDelete(() => del("posts", post.id), "日常已删除");
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

function buildAlbumPhotos(posts, photos) {
  const hiddenPhotoIds = new Set(remoteState.hiddenPhotoIds || []);
  const dailyPhotos = posts
    .filter((post) => post.attachmentBlob && post.attachmentType?.startsWith("image/"))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((post) => ({
      id: `post:${post.id}`,
      source: "post",
      recordId: post.id,
      src: objectUrl(post.attachmentBlob),
      caption: post.title || "日常照片",
      createdAt: post.createdAt,
    }));

  const albumPhotos = photos
    .filter((photo) => photo.imageBlob)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((photo) => ({
      id: `album:${photo.id}`,
      source: "album",
      recordId: photo.id,
      src: objectUrl(photo.imageBlob),
      caption: photo.caption || "相册照片",
      createdAt: photo.createdAt,
    }));

  return [...albumPhotos, ...dailyPhotos, ...builtInPhotos]
    .filter((photo) => !hiddenPhotoIds.has(photo.id));
}

function renderAlbum(photos) {
  els.albumGrid.replaceChildren();

  if (!photos.length) {
    els.albumGrid.append(emptyState("把喜欢的照片加入相册吧"));
    return;
  }

  photos.forEach((photo) => {
    els.albumGrid.append(photoTile(photo, photos));
  });
}

function updateAlbumUploadLabel() {
  const count = els.albumPhotoInput.files.length;
  els.albumUploadLabel.textContent = count
    ? `已选择 ${count} 张，保存时自动压缩`
    : "选择要珍藏的照片";
}

async function saveAlbumPhotos(event) {
  event.preventDefault();
  const files = Array.from(els.albumPhotoInput.files).filter((file) => file.type.startsWith("image/"));
  if (!files.length) {
    showToast("请先选择照片");
    return;
  }
  if (files.length > 12) {
    showToast("一次最多加入 12 张照片");
    return;
  }

  els.saveAlbumButton.disabled = true;
  const caption = els.albumCaption.value.trim();
  const prepared = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      els.saveAlbumButton.textContent = `压缩 ${index + 1}/${files.length}`;
      const image = await compressImageFile(files[index]);
      if (image.size > MAX_ATTACHMENT_BYTES) throw new Error("photo too large");
      prepared.push({
        id: crypto.randomUUID(),
        author: activeAccount,
        caption: caption || files[index].name.replace(/\.[^.]+$/, ""),
        imageBlob: image,
        imageType: image.type,
        imageName: image.name,
        createdAt: Date.now() + index,
      });
    }

    els.saveAlbumButton.textContent = "正在保存...";
    await mutateRemoteState((state) => {
      state.photos.push(...prepared);
    }, `Add album photos by ${activeAccount}`);
    els.albumForm.reset();
    updateAlbumUploadLabel();
    showToast(`${prepared.length} 张照片已加入相册`);
  } catch (error) {
    showToast(error.message === "photo too large" ? "照片压缩后仍然太大" : "照片保存失败，请重试");
  } finally {
    els.saveAlbumButton.disabled = false;
    els.saveAlbumButton.textContent = "加入相册";
  }
}

function syncFeaturedPhotos(photos) {
  featuredPhotos = photos;
  coverRotationIndex = 0;
  updateFeaturedCovers();

  window.clearInterval(coverTimer);
  if (!featuredPhotos.length) {
    els.dynamicCoverFrames.forEach((frame) => {
      frame.querySelectorAll(".cover-layer").forEach((layer) => {
        layer.removeAttribute("src");
        layer.removeAttribute("data-source");
      });
    });
    return;
  }
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

function photoTile(photo, allPhotos) {
  const tile = document.createElement("article");
  tile.className = "photo-tile";

  const image = document.createElement("img");
  image.src = photo.src;
  image.alt = photo.caption;
  image.tabIndex = 0;
  image.addEventListener("click", () => openPhoto(photo.src, photo.caption));
  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openPhoto(photo.src, photo.caption);
  });
  const label = document.createElement("span");
  label.className = "photo-caption";
  label.textContent = photo.caption;

  const actions = document.createElement("div");
  actions.className = "photo-actions";
  const isFeatured = !Array.isArray(remoteState.featuredPhotoIds)
    || remoteState.featuredPhotoIds.includes(photo.id);
  const featuredButton = document.createElement("button");
  featuredButton.type = "button";
  featuredButton.className = `photo-action ${isFeatured ? "is-featured" : ""}`;
  featuredButton.textContent = isFeatured ? "轮播中" : "设为轮播";
  featuredButton.title = isFeatured ? "从循环展示中移除" : "加入循环展示";
  featuredButton.addEventListener("click", async () => {
    featuredButton.disabled = true;
    try {
      await setPhotoFeatured(photo.id, !isFeatured, allPhotos);
    } catch (error) {
      showToast("轮播设置保存失败，请重试");
      featuredButton.disabled = false;
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "photo-action is-delete";
  deleteButton.textContent = "删除";
  deleteButton.addEventListener("click", async () => {
    if (!await confirmDelete("删除这张照片？", "照片将从相册和循环展示中移除。")) return;
    await runDelete(() => deleteAlbumPhoto(photo), "照片已删除");
  });

  actions.append(featuredButton, deleteButton);
  tile.append(image, label, actions);
  return tile;
}

async function setPhotoFeatured(photoId, enabled, allPhotos) {
  await mutateRemoteState((state) => {
    const selected = new Set(
      Array.isArray(state.featuredPhotoIds)
        ? state.featuredPhotoIds
        : allPhotos.map((photo) => photo.id),
    );
    if (enabled) selected.add(photoId);
    else selected.delete(photoId);
    state.featuredPhotoIds = [...selected];
  }, `Update featured photos by ${activeAccount}`);
  showToast(enabled ? "已加入循环展示" : "已从循环展示移除");
}

async function deleteAlbumPhoto(photo) {
  await mutateRemoteState((state) => {
    if (photo.source === "album") {
      state.photos = state.photos.filter((item) => item.id !== photo.recordId);
    } else if (photo.source === "post") {
      const post = state.posts.find((item) => item.id === photo.recordId);
      if (post) {
        post.attachmentBlob = null;
        post.attachmentName = "";
        post.attachmentType = "";
      }
    } else if (!state.hiddenPhotoIds.includes(photo.id)) {
      state.hiddenPhotoIds.push(photo.id);
    }

    if (Array.isArray(state.featuredPhotoIds)) {
      state.featuredPhotoIds = state.featuredPhotoIds.filter((id) => id !== photo.id);
    }
  }, `Delete album photo by ${activeAccount}`);
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

  const submitButton = els.wishForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "保存中...";
  try {
    await put("wishes", {
      id: crypto.randomUUID(),
      author: activeAccount,
      text,
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    els.wishInput.value = "";
    showToast("愿望已保存");
  } catch (error) {
    showToast("愿望保存失败，内容仍留在输入框中");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "加入愿望";
  }
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
      const nextDone = checkbox.checked;
      checkbox.checked = wish.done;
      checkbox.disabled = true;
      try {
        await put("wishes", { ...wish, done: nextDone, updatedAt: Date.now() });
      } catch (error) {
        checkbox.disabled = false;
        showToast("愿望状态保存失败，请重试");
      }
    });
    const text = document.createElement("span");
    text.textContent = wish.text;
    copy.append(checkbox, text);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost-button";
    removeButton.textContent = "删除";
    removeButton.addEventListener("click", async () => {
      if (!await confirmDelete("删除这个愿望？", "删除后将无法恢复。")) return;
      await runDelete(() => del("wishes", wish.id), "愿望已删除");
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
      if (copy.imageBlob) {
        copy.imageData = await blobToDataUrl(copy.imageBlob);
        delete copy.imageBlob;
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
      if (copy.imageData) {
        copy.imageBlob = dataUrlToBlob(copy.imageData);
        delete copy.imageData;
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
  return {
    messages: [],
    posts: [],
    wishes: [],
    photos: [],
    featuredPhotoIds: null,
    hiddenPhotoIds: [],
  };
}

async function syncRequest(path, options = {}, requestOptions = {}) {
  if (!isSyncApiConfigured()) throw new Error("sync API is not configured");

  const attempts = Math.max(1, requestOptions.attempts || 1);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await syncRequestOnce(path, options);
    } catch (error) {
      lastError = error;
      const retryable = !error.status && (error.name === "AbortError" || error instanceof TypeError);
      if (!retryable || attempt === attempts) throw error;
      requestOptions.onRetry?.(attempt, error);
      await new Promise((resolve) => window.setTimeout(resolve, 800 * attempt));
    }
  }

  throw lastError;
}

async function syncRequestOnce(path, options = {}) {

  const controller = new AbortController();
  const method = String(options.method || "GET").toUpperCase();
  const isStateRead = method === "GET" && path.startsWith("/state");
  if (isStateRead) activeReadAbortController = controller;
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
    if (activeReadAbortController === controller) activeReadAbortController = null;
  }

  if (!response.ok) {
    const error = new Error(`Sync request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.status === 204 ? null : response.json();
}

async function loadRemoteState({ force = false, attempts = 1, onRetry } = {}) {
  const statePath = force ? `/state?fresh=1&t=${Date.now()}` : "/state";
  const result = await syncRequest(statePath, {}, { attempts, onRetry });
  if (!result.exists) {
    remoteState = emptyRemoteState();
    remoteSha = null;
    return true;
  }

  if (!force && result.sha === remoteSha) return false;
  if (!result.content) throw new Error("remote state content unavailable");

  try {
    remoteState = await decryptRemoteState(base64ToBytes(result.content));
  } catch (error) {
    const recovery = await syncRequest("/state/recovery", {}, { attempts: 1 });
    if (!recovery?.exists || !recovery.content) throw error;
    remoteState = await decryptRemoteState(base64ToBytes(recovery.content));
    remoteStateWasLegacy = true;
  }
  remoteSha = result.sha;
  return true;
}

async function saveRemoteState(message, state = remoteState) {
  const encryptedBytes = await encryptRemoteState(state);
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

async function encryptRemoteState(state = remoteState) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveFastRemoteKey();
  const serializable = {
    version: 3,
    messages: await serializeBlobs(state.messages),
    posts: await serializeBlobs(state.posts),
    wishes: state.wishes,
    photos: await serializeBlobs(state.photos),
    featuredPhotoIds: state.featuredPhotoIds,
    hiddenPhotoIds: state.hiddenPhotoIds,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(serializable));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const magic = new TextEncoder().encode(REMOTE_STATE_MAGIC_V2);
  const output = new Uint8Array(magic.length + iv.length + ciphertext.length);
  output.set(magic, 0);
  output.set(iv, magic.length);
  output.set(ciphertext, magic.length + iv.length);
  return output;
}

async function decryptRemoteState(bytes) {
  const magicLength = REMOTE_STATE_MAGIC_V2.length;
  if (bytes.length < magicLength + 12 + 16) throw new Error("remote state is invalid");
  const magic = new TextDecoder().decode(bytes.slice(0, magicLength));
  let iv;
  let ciphertext;
  let key;

  if (magic === REMOTE_STATE_MAGIC_V2) {
    iv = bytes.slice(magicLength, magicLength + 12);
    ciphertext = bytes.slice(magicLength + 12);
    key = await deriveFastRemoteKey();
    remoteStateWasLegacy = false;
  } else if (magic === REMOTE_STATE_MAGIC_V1) {
    if (bytes.length < magicLength + 16 + 12 + 16) throw new Error("remote state is invalid");
    const salt = bytes.slice(magicLength, magicLength + 16);
    iv = bytes.slice(magicLength + 16, magicLength + 28);
    ciphertext = bytes.slice(magicLength + 28);
    key = await deriveLegacyRemoteKey(salt);
    remoteStateWasLegacy = true;
  } else {
    throw new Error("remote state format is invalid");
  }

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));

  if (![1, 2, 3].includes(parsed.version)) throw new Error("remote state version is unsupported");
  return {
    messages: await deserializeBlobs(parsed.messages || []),
    posts: await deserializeBlobs(parsed.posts || []),
    wishes: parsed.wishes || [],
    photos: await deserializeBlobs(parsed.photos || []),
    featuredPhotoIds: Array.isArray(parsed.featuredPhotoIds) ? parsed.featuredPhotoIds : null,
    hiddenPhotoIds: Array.isArray(parsed.hiddenPhotoIds) ? parsed.hiddenPhotoIds : [],
  };
}

async function deriveFastRemoteKey() {
  const material = new TextEncoder().encode(`${REMOTE_KEY_CONTEXT}${spacePasscode}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function deriveLegacyRemoteKey(salt) {
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
      iterations: REMOTE_LEGACY_KDF_ITERATIONS,
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
  const apply = (state) => {
    const items = state[storeName];
    const index = items.findIndex((item) => item.id === value.id);
    if (index >= 0) items[index] = value;
    else items.push(value);
  };

  await mutateRemoteState(apply, `Update ${storeName} by ${activeAccount}`);
  return value.id;
}

async function del(storeName, id) {
  const apply = (state) => {
    state[storeName] = state[storeName].filter((item) => item.id !== id);
  };

  await mutateRemoteState(apply, `Delete from ${storeName} by ${activeAccount}`);
}

function mutateRemoteState(apply, message) {
  const operation = mutationQueue.catch(() => {}).then(() => commitRemoteMutation(apply, message));
  mutationQueue = operation;
  return operation;
}

async function commitRemoteMutation(apply, message) {
  remoteMutationInProgress = true;
  setSyncStatus("syncing", "正在保存");
  activeReadAbortController?.abort();
  while (remoteReadInProgress) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  let candidate = cloneRemoteState(remoteState);
  apply(candidate);

  try {
    await saveRemoteState(message, candidate);
    remoteState = candidate;
    remoteStateWasLegacy = false;
    await refreshAll();
    setSyncStatus("ready", "已同步");
  } catch (error) {
    if (error.status !== 409 && error.status !== 422) {
      setSyncStatus("error", "保存失败，点击重试");
      showToast("GitHub 同步失败，请重试");
      throw error;
    }
    await loadRemoteState({ force: true });
    candidate = cloneRemoteState(remoteState);
    apply(candidate);
    await saveRemoteState(message, candidate);
    remoteState = candidate;
    remoteStateWasLegacy = false;
    await refreshAll();
    setSyncStatus("ready", "已同步");
  } finally {
    remoteMutationInProgress = false;
  }
}

function cloneRemoteState(state) {
  return {
    messages: state.messages.map((item) => ({ ...item })),
    posts: state.posts.map((item) => ({ ...item })),
    wishes: state.wishes.map((item) => ({ ...item })),
    photos: state.photos.map((item) => ({ ...item })),
    featuredPhotoIds: Array.isArray(state.featuredPhotoIds) ? [...state.featuredPhotoIds] : null,
    hiddenPhotoIds: [...(state.hiddenPhotoIds || [])],
  };
}

function startRemoteSync() {
  window.clearInterval(remoteSyncTimer);
  remoteSyncTimer = window.setInterval(() => {
    void syncNow();
  }, REMOTE_SYNC_MS);
}

async function syncNow({ force = false, showProgress = false } = {}) {
  if (remoteMutationInProgress || remoteReadInProgress || !spacePasscode || !isSyncApiConfigured()) return;
  remoteReadInProgress = true;
  if (showProgress) setSyncStatus("syncing", "正在同步记录");

  try {
    const keepMessagesAtBottom = isNearBottom(els.messageList);
    const keepPostsAtBottom = isNearBottom(els.postList);
    const changed = await loadRemoteState({ force });
    if (changed) {
      await refreshAll();
      if (keepMessagesAtBottom) scrollMessagesToBottom();
      if (keepPostsAtBottom) scrollPostsToBottom();
    }
    setSyncStatus("ready", "已同步");

    if (remoteStateWasLegacy && !remoteMutationInProgress) {
      remoteMutationInProgress = true;
      try {
        await saveRemoteState("Upgrade private space data");
        remoteStateWasLegacy = false;
      } catch (error) {
        remoteStateWasLegacy = true;
      } finally {
        remoteMutationInProgress = false;
      }
    }
  } catch (error) {
    const message = error.status === 401 ? "同步认证失败" : "网络较慢，点击重试";
    setSyncStatus("error", message);
  } finally {
    remoteReadInProgress = false;
  }
}

function setSyncStatus(state, text) {
  els.syncRetryButton.classList.remove("is-ready", "is-syncing", "is-error");
  if (state !== "idle") els.syncRetryButton.classList.add(`is-${state}`);
  els.syncStatusText.textContent = text;
}

function emptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
}

function paginationHint(text) {
  const hint = document.createElement("div");
  hint.className = "pagination-hint";
  hint.textContent = text;
  return hint;
}

function resetPagination() {
  messageVisibleCount = MESSAGE_PAGE_SIZE * (PRELOAD_PAGES + 1);
  postVisibleCount = POST_PAGE_SIZE * (PRELOAD_PAGES + 1);
  previousMessageScrollTop = 0;
  previousPostScrollTop = 0;
}

function handleMessageScroll() {
  const movingUp = els.messageList.scrollTop < previousMessageScrollTop;
  previousMessageScrollTop = els.messageList.scrollTop;
  if (!movingUp || els.messageList.scrollTop > 48 || messageVisibleCount >= remoteState.messages.length) return;

  const oldHeight = els.messageList.scrollHeight;
  const oldTop = els.messageList.scrollTop;
  messageVisibleCount += MESSAGE_PAGE_SIZE;
  renderMessages(remoteState.messages);
  requestAnimationFrame(() => {
    els.messageList.scrollTop = els.messageList.scrollHeight - oldHeight + oldTop;
    previousMessageScrollTop = els.messageList.scrollTop;
  });
}

function handlePostScroll() {
  const movingUp = els.postList.scrollTop < previousPostScrollTop;
  previousPostScrollTop = els.postList.scrollTop;
  if (!movingUp || els.postList.scrollTop > 48 || postVisibleCount >= remoteState.posts.length) return;

  const oldHeight = els.postList.scrollHeight;
  const oldTop = els.postList.scrollTop;
  postVisibleCount += POST_PAGE_SIZE;
  renderPosts(remoteState.posts);
  requestAnimationFrame(() => {
    els.postList.scrollTop = els.postList.scrollHeight - oldHeight + oldTop;
    previousPostScrollTop = els.postList.scrollTop;
  });
}

function confirmDelete(title, message) {
  if (confirmResolver) closeConfirm(false);
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(confirmed) {
  if (els.confirmDialog.open) els.confirmDialog.close();
  const resolve = confirmResolver;
  confirmResolver = null;
  resolve?.(confirmed);
}

async function runDelete(remove, successMessage) {
  try {
    await remove();
    showToast(successMessage);
  } catch (error) {
    showToast("删除失败，原内容仍然保留");
  }
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
    previousMessageScrollTop = els.messageList.scrollTop;
  });
}

function scrollPostsToBottom() {
  requestAnimationFrame(() => {
    els.postList.scrollTop = els.postList.scrollHeight;
    previousPostScrollTop = els.postList.scrollTop;
  });
}

function isNearBottom(element) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
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
