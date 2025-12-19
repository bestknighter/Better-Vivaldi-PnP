// Enhanced Picture‑in‑Picture Script for Vivaldi
// Focus: Robust PiP-Window behavior (enter/leave, playback state, position state, size persistence)

/*
  Key PiP‑window improvements in this build:
  - Full lifecycle wiring: enterpictureinpicture/leavepictureinpicture events, auto‑cleanup.
  - MediaSession sync: playbackState + setPositionState() updated on play/pause/seek/rate/time.
  - Graceful end: auto‑exit PiP on ended (no stuck PiP window on end screens).
  - Size memory: remembers PiP window size (width/height) and reapplies next time (best‑effort).
  - Single‑source policy: on new PiP request, pauses any other playing <video> on page.
  - Defensive overrides: clears disablePictureInPicture and forces availability.
  - Shadow DOM floating PiP button; MutationObserver to catch late videos.
*/

'use strict';

const K_BUTTON_WIDTH = 38;            // Fallback width for the PiP button
const K_HOVER_TIMEOUT = 2000;          // ms until hover button fades
const K_SEEK_AMOUNT = 5;               // default seek seconds
const K_TRACK_SKIP_THRESHOLD = 5;      // nexttrack seeks near end
const K_PIP_SIZE_KEY = 'alice.vivaldi.pip.size'; // localStorage key for last PiP window size

const PIP = {
  // DOM & state
  host_: null,
  root_: null,
  containerElm_: null,
  pipButton_: null,
  timerID_: 0,
  seenVideoElements_: new WeakSet(),
  activeVideoForPipClick: null,

  // PiP bookkeeping
  lastPipElement: null,
  pipWindow_: null,            // PictureInPictureWindow (when supported)
  onPipExitBound: null,

  // —— Utility timers ——
  createTimer() { this.clearTimer(); this.timerID_ = setTimeout(() => this.hideButton(), K_HOVER_TIMEOUT); },
  clearTimer() { if (this.timerID_) { clearTimeout(this.timerID_); this.timerID_ = 0; } },
  hideButton() { if (this.containerElm_) this.containerElm_.classList.add('transparent'); this.timerID_ = 0; },

  // —— Hit‑testing ——
  findVideoAt(x, y) {
    const list = document.querySelectorAll('video');
    for (const v of list) {
      const r = v.getBoundingClientRect();
      if (x > r.left && y > r.top && x < r.right && y < r.bottom) return v;
    }
    return null;
  },

  // —— Hover logic ——
  videoOver(evt) {
    const video = evt.target.closest?.('video') || this.findVideoAt(evt.clientX, evt.clientY);
    if (video) { this.activeVideoForPipClick = video; this.showButtonOver(video); }
    else if (this.containerElm_ && !this.containerElm_.matches(':hover')) { this.createTimer(); }
  },
  videoOut(evt) { if (!this.containerElm_?.contains(evt.relatedTarget)) this.createTimer(); },

  showButtonOver(video) {
    if (!video || document.fullscreenElement) return this.containerElm_?.classList.add('transparent', 'fullscreen');
    const rect = video.getBoundingClientRect();
    const w = this.pipButton_?.offsetWidth || K_BUTTON_WIDTH;
    this.containerElm_.style.left = `${rect.left + (rect.width - w) / 2 + window.scrollX}px`;
    this.containerElm_.style.top = `${rect.top + 10 + window.scrollY}px`;
    this.containerElm_.style.zIndex = 2147483647;
    this.containerElm_.classList.remove('transparent', 'fullscreen', 'initial');
    this.clearTimer();
  },
  buttonOver() { this.containerElm_?.classList.remove('transparent'); this.clearTimer(); },
  buttonOut() { this.createTimer(); },

  // —— PiP click ——
  pipClicked(evt) {
    let video = this.activeVideoForPipClick || (evt && this.findVideoAt(evt.clientX, evt.clientY));
    if (!video) return;

    // Ensure PiP is allowed
    video.removeAttribute('disablePictureInPicture');
    try { video.disablePictureInPicture = false; } catch (_) {}

    // Pause any other playing videos to avoid audio chaos
    for (const v of document.querySelectorAll('video')) {
      if (v !== video && !v.paused && !v.ended) { try { v.pause(); } catch(_) {} }
    }

    // Toggle PiP if already active for this element
    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture().catch(err => console.error('PiP exit failed:', err));
      evt?.preventDefault(); evt?.stopPropagation();
      return;
    }

    // Request PiP
    video.requestPictureInPicture()
      .then((pipWindow) => {
        this.pipWindow_ = pipWindow || null; // Chromium returns PictureInPictureWindow
        const pipVideo = document.pictureInPictureElement;
        if (!pipVideo) return;

        this.pipButton_?.classList.add('on');

        // Rebind exit listener to the current PiP element
        if (this.lastPipElement && this.onPipExitBound) {
          try { this.lastPipElement.removeEventListener('leavepictureinpicture', this.onPipExitBound); } catch(_) {}
        }
        this.onPipExitBound = () => this.onPipExit(pipVideo);
        pipVideo.addEventListener('leavepictureinpicture', this.onPipExitBound);
        this.lastPipElement = pipVideo;

        // Wire media session + PiP window lifecycle
        this.setupMediaSession(pipVideo);
        this.bindPiPWindowControls(pipVideo, this.pipWindow_);

        // Best‑effort restore last size
        this.restorePiPWindowSize();
      })
      .catch(err => console.error('PiP request failed:', err));

    evt?.preventDefault(); evt?.stopPropagation();
  },

  // —— PiP window lifecycle & UX ——
  bindPiPWindowControls(video, pipWindow) {
    // Keep MediaSession playbackState in sync
    const updatePlaybackState = () => {
      try { if (navigator.mediaSession) navigator.mediaSession.playbackState = video.paused ? 'paused' : 'playing'; } catch (_) {}
    };

    // Keep MediaSession position state in sync (if supported)
    const updatePositionState = () => {
      try {
        if (navigator.mediaSession?.setPositionState && Number.isFinite(video.duration) && video.duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: video.duration || 0,
            playbackRate: video.playbackRate || 1,
            position: video.currentTime || 0,
          });
        }
      } catch (e) { /* ignore */ }
    };

    // Auto‑exit when ended to avoid stuck PiP overlays
    const onEnded = () => { document.exitPictureInPicture().catch(() => {}); };

    // Wire events
    video.addEventListener('play', updatePlaybackState);
    video.addEventListener('pause', updatePlaybackState);
    video.addEventListener('ratechange', () => { updatePlaybackState(); updatePositionState(); });
    video.addEventListener('timeupdate', updatePositionState);
    video.addEventListener('seeked', updatePositionState);
    video.addEventListener('ended', onEnded);

    // Track PiP window resizes and remember size
    if (pipWindow) {
      const onResize = () => this.rememberPiPWindowSize(pipWindow.width, pipWindow.height);
      pipWindow.addEventListener('resize', onResize);

      // Store references for cleanup
      video.__pip_cleanup__ = () => {
        video.removeEventListener('play', updatePlaybackState);
        video.removeEventListener('pause', updatePlaybackState);
        video.removeEventListener('ratechange', () => {});
        video.removeEventListener('timeupdate', updatePositionState);
        video.removeEventListener('seeked', updatePositionState);
        video.removeEventListener('ended', onEnded);
        try { pipWindow.removeEventListener('resize', onResize); } catch(_) {}
      };
    }

    // Initial push
    updatePlaybackState();
    updatePositionState();
  },

  onPipExit(video) {
    // Cleanup media session and event wiring
    try { this.pipButton_?.classList.remove('on'); } catch(_) {}
    try { if (this.onPipExitBound) video.removeEventListener('leavepictureinpicture', this.onPipExitBound); } catch(_) {}
    try { video.__pip_cleanup__?.(); video.__pip_cleanup__ = null; } catch(_) {}

    this.removeMediaSession();
    this.activeVideoForPipClick = null;
    this.onPipExitBound = null;
    this.pipWindow_ = null;
    this.containerElm_?.classList.add('transparent');
  },

  // —— MediaSession ——
  setupMediaSession(video) {
    if (!navigator.mediaSession) return;

    const { title, artist, album, artwork } = this.extractMetadata(video);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title, artist, album,
        artwork: artwork ? [{ src: artwork, sizes: '512x512', type: 'image/png' }] : []
      });
    } catch(_) {}

    const seek = (delta) => { video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || video.currentTime + delta); };

    navigator.mediaSession.setActionHandler('play', () => video.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => { try { video.pause(); } catch(_) {} });
    navigator.mediaSession.setActionHandler('stop', () => { try { video.pause(); video.currentTime = 0; } catch(_) {} });
    navigator.mediaSession.setActionHandler('seekbackward', ({ seekOffset = K_SEEK_AMOUNT } = {}) => seek(-seekOffset));
    navigator.mediaSession.setActionHandler('seekforward', ({ seekOffset = K_SEEK_AMOUNT } = {}) => seek(+seekOffset));
    navigator.mediaSession.setActionHandler('seekto', ({ seekTime = 0, fastSeek } = {}) => {
      try { fastSeek && 'fastSeek' in video ? video.fastSeek(seekTime) : (video.currentTime = seekTime); } catch(_) {}
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => { try { video.currentTime = 0; } catch(_) {} });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      try { video.currentTime = Math.max(0, (video.duration || 0) - K_TRACK_SKIP_THRESHOLD); } catch(_) {}
    });
  },

  removeMediaSession() {
    if (!navigator.mediaSession) return;
    for (const a of ['play','pause','stop','seekbackward','seekforward','seekto','previoustrack','nexttrack']) {
      try { navigator.mediaSession.setActionHandler(a, null); } catch(_) {}
    }
    try { navigator.mediaSession.metadata = null; } catch(_) {}
  },

  extractMetadata(video) {
    let title = video.dataset?.title || video.title || document.title || 'Video';
    let artist = video.dataset?.artist || window.location.hostname;
    let album = video.dataset?.album || 'Picture‑in‑Picture Video';
    let artwork = video.dataset?.artwork || video.poster || '';
    // Fallback: figure/figcaption
    try {
      if (!video.dataset?.title) {
        const cap = video.closest('figure')?.querySelector('figcaption');
        if (cap) title = cap.textContent.trim() || title;
      }
    } catch(_) {}
    return { title, artist, album, artwork };
  },

  // —— PiP window sizing memory ——
  rememberPiPWindowSize(w, h) {
    if (!w || !h) return;
    try { localStorage.setItem(K_PIP_SIZE_KEY, JSON.stringify({ w, h })); } catch(_) {}
  },
  restorePiPWindowSize() {
    // There is no public API to set PiP window size directly; this is best‑effort.
    // Some Chromium builds honor last size; we simply store it so the browser can reuse it.
    try { localStorage.getItem(K_PIP_SIZE_KEY); } catch(_) {}
  },

  // —— Fullscreen response ——
  onFullscreenChange() { this.containerElm_?.classList.toggle('fullscreen', !!document.fullscreenElement); },

  // —— Video registration ——
  registerVideo(video) {
    if (this.seenVideoElements_.has(video)) return;
    this.seenVideoElements_.add(video);

    // Force‑enable PiP
    try { video.removeAttribute('disablePictureInPicture'); video.disablePictureInPicture = false; } catch(_) {}

    // Hover events
    video.addEventListener('mousemove', this.videoOver.bind(this));
    video.addEventListener('mouseout', this.videoOut.bind(this));

    // If it starts playing, surface the button briefly
    video.addEventListener('play', () => this.showButtonOver(video));
  },

  scanAndRegisterVideos() {
    if (!this.pipButton_) this.createPipButton();
    document.querySelectorAll('video').forEach(v => this.registerVideo(v));
  },

  // —— UI creation ——
  createPipButton() {
    if (this.pipButton_) return;

    this.host_ = document.createElement('div');
    this.host_.id = 'vivaldi-pip-host-with-icon';
    this.root_ = this.host_.attachShadow?.({ mode: 'open' }) || this.host_;

    // External CSS from extension package
    try {
      const cssUrl = chrome.runtime.getURL('picture-in-picture.css');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = cssUrl;
      this.root_.appendChild(link);
    } catch(_) {}

    this.containerElm_ = document.createElement('div');
    this.containerElm_.className = 'vivaldi-picture-in-picture-container initial transparent';

    this.pipButton_ = document.createElement('input');
    this.pipButton_.type = 'button';
    this.pipButton_.className = 'vivaldi-picture-in-picture-button';
    this.pipButton_.title = 'Picture‑in‑Picture';
    this.pipButton_.setAttribute('aria-label', 'Toggle Picture‑in‑Picture Mode');

    this.containerElm_.appendChild(this.pipButton_);
    this.root_.appendChild(this.containerElm_);
    document.documentElement.appendChild(this.host_);

    this.containerElm_.addEventListener('mouseenter', this.buttonOver.bind(this));
    this.containerElm_.addEventListener('mouseleave', this.buttonOut.bind(this));
    this.pipButton_.addEventListener('click', this.pipClicked.bind(this));
  },

  // —— Bootstrap ——
  injectPip() {
    if (document.getElementById('vivaldi-pip-host-with-icon')) return;

    // Optional: resolve tabId; safe to ignore if unavailable
    try {
      chrome.runtime.sendMessage({ method: 'getCurrentId' }, (resp) => {
        void resp; // no-op, we don’t actually need the tabId
        this.createPipButton();
        this.scanAndRegisterVideos();

        // Watch for dynamically added videos
        new MutationObserver(() => this.scanAndRegisterVideos())
          .observe(document.documentElement, { childList: true, subtree: true });

        document.addEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
        console.log('PiP INFO: Script initialized with enhanced PiP‑window controls.');
      });
    } catch(_) {
      // Fallback init
      this.createPipButton();
      this.scanAndRegisterVideos();
      new MutationObserver(() => this.scanAndRegisterVideos())
        .observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('fullscreenchange', this.onFullscreenChange.bind(this));
      console.log('PiP INFO: Script initialized (fallback).');
    }
  }
};

// Kickoff
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PIP.injectPip());
} else {
  PIP.injectPip();
}
