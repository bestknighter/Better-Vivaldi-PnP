// Enhanced Picture‑in‑Picture Script v2.6 for Vivaldi
// Features: Auto-PiP, Blacklist, Boss-Key, Visual Positioning, Stealth Mode, Min Dimensions, Button User Choice
// Language: English
// Author: MickyFoley

'use strict';

// —— Configuration Constants ——
const K_BUTTON_SIZE = 38;
const K_BUTTON_MARGIN = 15;
const K_HOVER_TIMEOUT = 2000;
const K_MAX_Z_INDEX = 2147483647;

// Storage Keys
const K_PIP_SIZE_KEY = 'vivaldi.pip.size';
const K_SETTING_AUTO_PIP = 'vivaldi.pip.auto';
const K_SETTING_AUTO_DELAY = 'vivaldi.pip.delay';
const K_SETTING_BLACKLIST = 'vivaldi.pip.blacklist';
const K_SETTING_POS = 'vivaldi.pip.position';
const K_SETTING_MIN_DUR = 'vivaldi.pip.minduration';
const K_SETTING_SEEK = 'vivaldi.pip.seek';
const K_SETTING_OPACITY = 'vivaldi.pip.opacity';
const K_SETTING_SHORTCUT = 'vivaldi.pip.shortcut';
const K_SETTING_MIN_WIDTH = 'vivaldi.pip.minwidth';
const K_SETTING_MIN_HEIGHT = 'vivaldi.pip.minheight';
const K_SETTING_HIDE_BUTTON_WHEN_ACTIVE = 'vivaldi.pip.hidebuttonwhenactive';

const PIP = {
  // —— State ——
  host_: null,
  root_: null,
  containerElm_: null,
  pipButton_: null,
  timerID_: 0,
  seenVideoElements_: new WeakSet(),
  
  // Active State
  activeVideoForPipClick: null,
  hoveredVideo: null,
  lastPipElement: null,
  pipWindow_: null,
  onPipExitBound: null,

  // Settings with Defaults
  settings: {
    autoPip: false,
    autoDelay: 1000,
    blacklist: ['tiktok.com', 'youtube.com/shorts'].join('\n'),
    position: 'top-right',
    minDuration: 10,
    minWidth: 200,
    minHeight: 150,
    seekInterval: 10,
    opacity: 0.7,
    shortcut: 'Alt+P',
    hideButtonWhenActive: false // false = button stays visible for easy toggle
  },

  // —— Utility Timers ——
  createTimer() {
    this.clearTimer();
    this.timerID_ = setTimeout(() => this.hideButton(), K_HOVER_TIMEOUT);
  },

  clearTimer() {
    if (this.timerID_) {
      clearTimeout(this.timerID_);
      this.timerID_ = 0;
    }
  },

  hideButton() {
    if (this.containerElm_) {
      this.containerElm_.classList.add('transparent');
    }
    this.timerID_ = 0;
  },

  // —— Hit‑testing & Video Finding ——
  findVideoAt(x, y) {
    const list = document.querySelectorAll('video');
    for (const v of list) {
      const r = v.getBoundingClientRect();
      if (x >= r.left && y >= r.top && x <= r.right && y <= r.bottom) {
        return v;
      }
    }
    return null;
  },

  findBestVideoForAction() {
    if (this.hoveredVideo && !this.hoveredVideo.ended) {
      return this.hoveredVideo;
    }
    
    const videos = Array.from(document.querySelectorAll('video'))
      .filter(v => v.readyState > 0 && !v.ended);

    // Prefer playing videos
    const playing = videos.filter(v => !v.paused);
    if (playing.length > 0) {
      return playing.sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0];
    }
    
    // Fallback to largest visible paused video
    return videos
      .filter(v => this.isVideoVisible_(v))
      .sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0];
  },

  // —— Hover Logic ——
  videoOver(evt) {
    if (!this.containerElm_) return;
    
    // Check blacklist first
    const blocked = this.settings.blacklist.split('\n').map(s => s.trim()).filter(s => s);
    if (blocked.some(domain => window.location.hostname.includes(domain))) {
      return;
    }

    const video = this.findVideoAt(evt.clientX, evt.clientY);
    
    // If user wants button hidden when PiP is active, don't show it
    if (this.settings.hideButtonWhenActive && video && document.pictureInPictureElement === video) {
      return;
    }

    if (video && this.isVideoEligible_(video)) {
      this.hoveredVideo = video;
      this.activeVideoForPipClick = video;
      this.showButtonOver(video);
    } else if (!this.containerElm_.matches(':hover')) {
      this.hoveredVideo = null;
      this.createTimer();
    }
  },

  videoOut(evt) {
    if (!this.containerElm_) return;
    
    if (!evt.relatedTarget || !evt.relatedTarget.closest('video')) {
      this.hoveredVideo = null;
    }
    if (!this.containerElm_.contains(evt.relatedTarget)) {
      this.createTimer();
    }
  },

  showButtonOver(video) {
    if (!this.containerElm_ || !video) return;
    
    if (document.fullscreenElement) {
      this.containerElm_.classList.add('transparent', 'fullscreen');
      return;
    }

    const rect = video.getBoundingClientRect();
    const btnSize = K_BUTTON_SIZE;
    
    // Check eligibility (dimensions + duration)
    if (!this.isVideoEligible_(video)) {
      this.containerElm_.classList.add('transparent');
      return;
    }
    
    // Calculate position based on settings
    let top = 0;
    let left = 0;

    const parts = this.settings.position.split('-');
    const yPos = parts[0]; // top, mid, bot
    const xPos = parts[1]; // left, center, right

    // Y Axis
    if (yPos === 'top') {
      top = rect.top + K_BUTTON_MARGIN;
    } else if (yPos === 'mid') {
      top = rect.top + (rect.height / 2) - (btnSize / 2);
    } else { // bot
      top = rect.bottom - btnSize - K_BUTTON_MARGIN;
    }

    // X Axis
    if (xPos === 'left') {
      left = rect.left + K_BUTTON_MARGIN;
    } else if (xPos === 'center') {
      left = rect.left + (rect.width / 2) - (btnSize / 2);
    } else { // right
      left = rect.right - btnSize - K_BUTTON_MARGIN;
    }

    this.containerElm_.style.left = `${left + window.scrollX}px`;
    this.containerElm_.style.top = `${top + window.scrollY}px`;
    this.containerElm_.style.zIndex = K_MAX_Z_INDEX;
    
    // Apply Stealth/Opacity
    const isHovered = this.containerElm_.matches(':hover');
    this.containerElm_.style.opacity = isHovered ? '1' : this.settings.opacity;
    
    this.containerElm_.classList.remove('transparent', 'fullscreen', 'initial', 'pip-active-hidden');
    this.clearTimer();
  },

  buttonOver() {
    if (!this.containerElm_) return;
    this.containerElm_.classList.remove('transparent');
    this.containerElm_.style.opacity = '1';
    this.clearTimer();
  },

  buttonOut() {
    this.createTimer();
  },

  // —— PiP Action ——
  pipClicked(evt, forcedVideo = null) {
    let video = forcedVideo || this.activeVideoForPipClick || 
                (evt && this.findVideoAt(evt.clientX, evt.clientY));
    
    if (!video) {
      console.warn('PiP: No video found');
      return;
    }

    // Remove any PiP restrictions
    video.removeAttribute('disablePictureInPicture');
    try { video.disablePictureInPicture = false; } catch (_) {}

    // Toggle if already in PiP
    if (document.pictureInPictureElement === video) {
      document.exitPictureInPicture().catch(err => console.error('PiP Exit Error:', err));
      if (evt) {
        evt.preventDefault();
        evt.stopPropagation();
      }
      return;
    }

    // Pause other videos
    document.querySelectorAll('video').forEach(v => {
      if (v !== video && !v.paused && !v.ended) {
        try { v.pause(); } catch(_) {}
      }
    });

    video.requestPictureInPicture()
      .then((pipWindow) => {
        this.pipWindow_ = pipWindow || null;
        const pipVideo = document.pictureInPictureElement;
        if (!pipVideo) return;

        // Hide button when PiP is active (if user preference is set)
        if (this.settings.hideButtonWhenActive && this.containerElm_) {
          this.containerElm_.classList.add('pip-active-hidden');
        }

        // Remove old listener
        if (this.lastPipElement && this.onPipExitBound) {
          try { 
            this.lastPipElement.removeEventListener('leavepictureinpicture', this.onPipExitBound); 
          } catch(_) {}
        }

        // Add new listener
        this.onPipExitBound = () => this.onPipExit(pipVideo);
        pipVideo.addEventListener('leavepictureinpicture', this.onPipExitBound);
        this.lastPipElement = pipVideo;

        this.setupMediaSession(pipVideo);
        this.bindPiPWindowControls(pipVideo, this.pipWindow_);
        this.restorePiPWindowSize();
      })
      .catch(err => {
        console.error('PiP Request Error:', err);
        this.showToast_('PiP not available for this video');
      });

    if (evt) {
      evt.preventDefault();
      evt.stopPropagation();
    }
  },

  handleGlobalKey_(e) {
    if (!this.settings.shortcut) return;

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    
    parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    const currentCombo = parts.join('+');

    if (currentCombo === this.settings.shortcut) {
      e.preventDefault();
      e.stopPropagation();
      const target = this.findBestVideoForAction();
      if (target) {
        this.activeVideoForPipClick = target;
        this.pipClicked(null, target);
        this.showToast_(`Boss Key: ${document.pictureInPictureElement ? 'Activated' : 'Toggled'}`);
      } else {
        this.showToast_('No compatible video stream found.');
      }
    }
  },

  bindPiPWindowControls(video, pipWindow) {
    const updatePlaybackState = () => {
      try {
        if (navigator.mediaSession) {
          navigator.mediaSession.playbackState = video.paused ? 'paused' : 'playing';
        }
      } catch (_) {}
    };
    
    video.addEventListener('play', updatePlaybackState);
    video.addEventListener('pause', updatePlaybackState);
    
    if (pipWindow) {
      const onResize = () => this.rememberPiPWindowSize(pipWindow.width, pipWindow.height);
      pipWindow.addEventListener('resize', onResize);
    }
    updatePlaybackState();
  },

  onPipExit(video) {
    try { 
      if (this.pipButton_) {
        this.pipButton_.classList.remove('on'); 
      }
    } catch(_) {}
    
    this.removeMediaSession();
    this.activeVideoForPipClick = null;
    this.onPipExitBound = null;
    this.pipWindow_ = null;
    
    if (this.containerElm_) {
      this.containerElm_.classList.remove('pip-active-hidden');
      this.createTimer();
    }
  },

  setupMediaSession(video) {
    if (!navigator.mediaSession) return;
    
    const { title, artist, artwork } = this.extractMetadata(video);
    
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title, 
        artist, 
        artwork: artwork ? [{ src: artwork, sizes: '512x512', type: 'image/png' }] : []
      });
    } catch(_) {}

    const seekDist = this.settings.seekInterval || 10;
    const seek = (delta) => {
      video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || video.currentTime + delta);
    };

    navigator.mediaSession.setActionHandler('play', () => video.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => { try { video.pause(); } catch(_) {} });
    navigator.mediaSession.setActionHandler('seekbackward', () => seek(-seekDist));
    navigator.mediaSession.setActionHandler('seekforward', () => seek(+seekDist));
  },

  removeMediaSession() {
    if (!navigator.mediaSession) return;
    try { navigator.mediaSession.metadata = null; } catch(_) {}
  },

  extractMetadata(video) {
    let title = video.title || document.title || 'Video';
    let artist = window.location.hostname;
    let artwork = video.poster || '';
    return { title, artist, artwork };
  },

  rememberPiPWindowSize(w, h) {
    if (!w || !h) return;
    try { 
      localStorage.setItem(K_PIP_SIZE_KEY, JSON.stringify({ w, h })); 
    } catch(_) {}
  },
  
  restorePiPWindowSize() {
    try { 
      const data = localStorage.getItem(K_PIP_SIZE_KEY);
      if (data) {
        // Size restoration would require additional API support
        return JSON.parse(data);
      }
    } catch(_) {}
    return null;
  },

  // —— Settings & Auto-PiP ——
  loadSettings_() {
    try {
      const autoPip = localStorage.getItem(K_SETTING_AUTO_PIP);
      if (autoPip !== null) this.settings.autoPip = autoPip === 'true';
      
      const autoDelay = localStorage.getItem(K_SETTING_AUTO_DELAY);
      if (autoDelay !== null) this.settings.autoDelay = parseInt(autoDelay, 10);
      
      const minDuration = localStorage.getItem(K_SETTING_MIN_DUR);
      if (minDuration !== null) this.settings.minDuration = parseInt(minDuration, 10);
      
      const seekInterval = localStorage.getItem(K_SETTING_SEEK);
      if (seekInterval !== null) this.settings.seekInterval = parseInt(seekInterval, 10);
      
      const opacity = localStorage.getItem(K_SETTING_OPACITY);
      if (opacity !== null) this.settings.opacity = parseFloat(opacity);
      
      const savedBlacklist = localStorage.getItem(K_SETTING_BLACKLIST);
      if (savedBlacklist !== null) this.settings.blacklist = savedBlacklist;

      const savedPos = localStorage.getItem(K_SETTING_POS);
      if (savedPos) this.settings.position = savedPos;

      const savedShortcut = localStorage.getItem(K_SETTING_SHORTCUT);
      if (savedShortcut) this.settings.shortcut = savedShortcut;

      const minWidth = localStorage.getItem(K_SETTING_MIN_WIDTH);
      if (minWidth !== null) this.settings.minWidth = parseInt(minWidth, 10);

      const minHeight = localStorage.getItem(K_SETTING_MIN_HEIGHT);
      if (minHeight !== null) this.settings.minHeight = parseInt(minHeight, 10);

      const hideButtonWhenActive = localStorage.getItem(K_SETTING_HIDE_BUTTON_WHEN_ACTIVE);
      if (hideButtonWhenActive !== null) this.settings.hideButtonWhenActive = hideButtonWhenActive === 'true';

    } catch(e) {
      console.error('Error loading PiP settings:', e);
    }
  },

  saveSettings_() {
    try {
      localStorage.setItem(K_SETTING_AUTO_PIP, String(this.settings.autoPip));
      localStorage.setItem(K_SETTING_AUTO_DELAY, String(this.settings.autoDelay));
      localStorage.setItem(K_SETTING_BLACKLIST, this.settings.blacklist);
      localStorage.setItem(K_SETTING_POS, this.settings.position);
      localStorage.setItem(K_SETTING_MIN_DUR, String(this.settings.minDuration));
      localStorage.setItem(K_SETTING_SEEK, String(this.settings.seekInterval));
      localStorage.setItem(K_SETTING_OPACITY, String(this.settings.opacity));
      localStorage.setItem(K_SETTING_SHORTCUT, this.settings.shortcut);
      localStorage.setItem(K_SETTING_MIN_WIDTH, String(this.settings.minWidth));
      localStorage.setItem(K_SETTING_MIN_HEIGHT, String(this.settings.minHeight));
      localStorage.setItem(K_SETTING_HIDE_BUTTON_WHEN_ACTIVE, String(this.settings.hideButtonWhenActive));
    } catch(e) {
      console.error('Error saving PiP settings:', e);
    }
  },

  setupAutoPip_() {
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange_());
  },

  handleVisibilityChange_() {
    if (!this.settings.autoPip) return;

    const currentHost = window.location.hostname;
    const blockedDomains = this.settings.blacklist.split('\n').map(s => s.trim()).filter(s => s);
    const isBlocked = blockedDomains.some(domain => currentHost.includes(domain));

    if (isBlocked) return;

    if (document.hidden) {
      const video = this.findPlayingVideo_();
      if (!video) return;
      
      if (video.duration > 0 && video.duration < this.settings.minDuration) return;

      if (!video.paused && !video.ended) {
        setTimeout(() => {
          if (document.hidden && !video.paused && !document.pictureInPictureElement) {
            this.activeVideoForPipClick = video;
            this.pipClicked(null, video);
          }
        }, this.settings.autoDelay);
      }
    } else if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
  },

  findPlayingVideo_() {
    const videos = Array.from(document.querySelectorAll('video'));
    return videos
      .filter(v => !v.paused && !v.ended && v.readyState > 0)
      .sort((a, b) => {
        const aSize = a.videoWidth * a.videoHeight;
        const bSize = b.videoWidth * b.videoHeight;
        return bSize - aSize;
      })[0] || null;
  },

  isVideoVisible_(video) {
    if (!video) return false;
    const rect = video.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && 
           rect.top < window.innerHeight && rect.bottom > 0 &&
           rect.left < window.innerWidth && rect.right > 0;
  },

  isVideoEligible_(video) {
    if (!video) return false;
    
    const rect = video.getBoundingClientRect();
    
    // Check minimum dimensions
    if (rect.width < this.settings.minWidth || rect.height < this.settings.minHeight) {
      return false;
    }
    
    // Check if video is visible
    if (!this.isVideoVisible_(video)) {
      return false;
    }
    
    // Check if video has minimum duration (if loaded)
    if (video.duration > 0 && video.duration < this.settings.minDuration) {
      return false;
    }
    
    return true;
  },

  // —— Settings Modal ——
  openSettingsModal_() {
    if (!this.root_) return;
    
    this.root_.querySelector('.pip-settings-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'pip-settings-modal';
    
    const positions = [
      'top-left', 'top-center', 'top-right',
      'mid-left', null, 'mid-right',
      'bot-left', 'bot-center', 'bot-right'
    ];

    let gridHtml = '<div class="pip-pos-grid">';
    positions.forEach(pos => {
      if (pos) {
        const activeClass = this.settings.position === pos ? 'active' : '';
        gridHtml += `<div class="pip-pos-cell ${activeClass}" data-pos="${pos}" title="${pos.replace('-', ' ')}"></div>`;
      } else {
        gridHtml += `<div class="pip-pos-spacer"></div>`;
      }
    });
    gridHtml += '</div>';

    modal.innerHTML = `
      <div class="pip-modal-overlay"></div>
      <div class="pip-modal-content">
        <div class="pip-modal-header">
          <h3>PiP Configuration</h3>
          <button class="pip-modal-close">×</button>
        </div>
        <div class="pip-modal-body">
          
          <div class="pip-columns">
            <div class="pip-col-main">
              <div class="pip-section-title">Automation & Behavior</div>
              <label class="pip-row">
                <input type="checkbox" id="pip-auto-enable">
                <span>Enable Auto-PiP on Tab Switch</span>
              </label>
              
              <div class="pip-dual-input">
                <label>
                  <span>Delay (ms)</span>
                  <input type="number" id="pip-auto-delay" step="100" min="0">
                </label>
                <label>
                  <span>Min Duration (s)</span>
                  <input type="number" id="pip-min-dur" min="0">
                </label>
              </div>
              
              <div class="pip-dual-input">
                <label>
                  <span>Min Width (px)</span>
                  <input type="number" id="pip-min-width" step="10" min="50" max="2000">
                </label>
                <label>
                  <span>Min Height (px)</span>
                  <input type="number" id="pip-min-height" step="10" min="50" max="2000">
                </label>
              </div>

              <div class="pip-section-title">Appearance & Control</div>
              <label class="pip-row">
                <input type="checkbox" id="pip-hide-when-active">
                <span>Hide Button When PiP is Active</span>
              </label>
              
              <label class="pip-row-slider">
                <span>Button Opacity (Idle): <span id="opacity-value">${this.settings.opacity}</span></span>
                <input type="range" id="pip-opacity" min="0.0" max="1" step="0.1">
              </label>
              <label class="pip-row-slider">
                <span>Seek Interval (sec):</span>
                <input type="number" id="pip-seek" min="1" max="60">
              </label>
              
              <label class="pip-label">Boss Key Shortcut:</label>
              <input type="text" id="pip-shortcut" placeholder="Click to record..." readonly class="shortcut-input">
            </div>

            <div class="pip-col-side">
               <div class="pip-section-title">Button Position</div>
               ${gridHtml}
            </div>
          </div>

          <div class="pip-group">
            <div class="pip-section-title">Blacklist (Domain per line)</div>
            <textarea id="pip-blacklist" rows="4" placeholder="tiktok.com&#10;youtube.com/shorts"></textarea>
          </div>

        </div>
        <div class="pip-modal-footer">
          <button class="pip-btn-save">Save Settings</button>
          <button class="pip-btn-cancel">Cancel</button>
        </div>
      </div>
    `;

    this.root_.appendChild(modal);

    const els = {
      autoEnable: modal.querySelector('#pip-auto-enable'),
      autoDelay: modal.querySelector('#pip-auto-delay'),
      minDur: modal.querySelector('#pip-min-dur'),
      minWidth: modal.querySelector('#pip-min-width'),
      minHeight: modal.querySelector('#pip-min-height'),
      hideWhenActive: modal.querySelector('#pip-hide-when-active'),
      opacity: modal.querySelector('#pip-opacity'),
      opacityValue: modal.querySelector('#opacity-value'),
      seek: modal.querySelector('#pip-seek'),
      shortcut: modal.querySelector('#pip-shortcut'),
      blacklist: modal.querySelector('#pip-blacklist'),
      save: modal.querySelector('.pip-btn-save'),
      cancel: modal.querySelector('.pip-btn-cancel'),
      close: modal.querySelector('.pip-modal-close'),
      overlay: modal.querySelector('.pip-modal-overlay'),
      gridCells: modal.querySelectorAll('.pip-pos-cell')
    };

    // Populate Data
    els.autoEnable.checked = this.settings.autoPip;
    els.autoDelay.value = this.settings.autoDelay;
    els.minDur.value = this.settings.minDuration;
    els.minWidth.value = this.settings.minWidth;
    els.minHeight.value = this.settings.minHeight;
    els.hideWhenActive.checked = this.settings.hideButtonWhenActive;
    els.opacity.value = this.settings.opacity;
    els.seek.value = this.settings.seekInterval;
    els.shortcut.value = this.settings.shortcut;
    els.blacklist.value = this.settings.blacklist;

    // Opacity slider feedback
    els.opacity.addEventListener('input', () => {
      els.opacityValue.textContent = els.opacity.value;
    });

    // Grid Logic
    let selectedPos = this.settings.position;
    els.gridCells.forEach(cell => {
      cell.onclick = () => {
        els.gridCells.forEach(c => c.classList.remove('active'));
        cell.classList.add('active');
        selectedPos = cell.getAttribute('data-pos');
      };
    });

    // Shortcut Logic
    let recording = false;
    els.shortcut.addEventListener('focus', () => {
      els.shortcut.classList.add('recording');
      els.shortcut.value = 'Press keys...';
      recording = true;
    });
    
    els.shortcut.addEventListener('blur', () => {
      els.shortcut.classList.remove('recording');
      if (els.shortcut.value === 'Press keys...') {
        els.shortcut.value = this.settings.shortcut;
      }
      recording = false;
    });

    els.shortcut.addEventListener('keydown', (e) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');
      
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      els.shortcut.value = parts.join('+');
      els.shortcut.blur();
    });

    const closeFn = () => modal.remove();
    els.close.onclick = els.overlay.onclick = els.cancel.onclick = closeFn;

    els.save.onclick = () => {
      this.settings.autoPip = els.autoEnable.checked;
      this.settings.autoDelay = parseInt(els.autoDelay.value, 10) || 1000;
      this.settings.minDuration = parseInt(els.minDur.value, 10) || 10;
      this.settings.minWidth = parseInt(els.minWidth.value, 10) || 200;
      this.settings.minHeight = parseInt(els.minHeight.value, 10) || 150;
      this.settings.hideButtonWhenActive = els.hideWhenActive.checked;
      this.settings.position = selectedPos;
      this.settings.opacity = parseFloat(els.opacity.value);
      this.settings.seekInterval = parseInt(els.seek.value, 10) || 10;
      this.settings.shortcut = els.shortcut.value !== 'Press keys...' ? els.shortcut.value : '';
      this.settings.blacklist = els.blacklist.value;

      this.saveSettings_();
      closeFn();
      this.showToast_('Settings Saved Successfully');
    };
  },

  showToast_(message) {
    if (!this.root_) return;
    
    const toast = document.createElement('div');
    toast.className = 'pip-toast';
    toast.textContent = message;
    this.root_.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  },

  onFullscreenChange() {
    if (!this.containerElm_) return;
    this.containerElm_.classList.toggle('fullscreen', !!document.fullscreenElement);
  },

  registerVideo(video) {
    if (!video || this.seenVideoElements_.has(video)) return;
    
    this.seenVideoElements_.add(video);
    
    try { 
      video.removeAttribute('disablePictureInPicture');
      video.disablePictureInPicture = false; 
    } catch(_) {}
    
    video.addEventListener('mousemove', (e) => this.videoOver(e), { passive: true });
    video.addEventListener('mouseout', (e) => this.videoOut(e), { passive: true });
    video.addEventListener('play', () => {
      if (this.hoveredVideo === video) {
        this.showButtonOver(video);
      }
    }, { passive: true });
  },

  scanAndRegisterVideos() {
    if (!this.pipButton_) {
      this.createPipButton();
    }
    
    document.querySelectorAll('video').forEach(v => this.registerVideo(v));
  },

  // —— UI Creation ——
  createPipButton() {
    if (this.pipButton_) return;

    this.host_ = document.createElement('div');
    this.host_.id = 'vivaldi-pip-host-enhanced';
    
    // Use Shadow DOM if available
    if (this.host_.attachShadow) {
      this.root_ = this.host_.attachShadow({ mode: 'open' });
    } else {
      this.root_ = this.host_;
    }

    const style = document.createElement('style');
    style.textContent = `
      :host { 
        all: initial;
        position: absolute !important; 
        top: 0 !important; 
        left: 0 !important; 
        width: 0 !important; 
        height: 0 !important; 
        z-index: ${K_MAX_Z_INDEX} !important; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        pointer-events: none !important;
      }
      
      .vivaldi-picture-in-picture-container {
        all: initial;
        position: absolute !important; 
        cursor: pointer !important; 
        height: ${K_BUTTON_SIZE + 7}px !important; 
        width: ${K_BUTTON_SIZE + 26}px !important;
        transition: opacity 0.2s ease !important;
        pointer-events: auto !important;
        z-index: ${K_MAX_Z_INDEX} !important;
      }
      
      .vivaldi-picture-in-picture-button {
        all: initial;
        display: block !important;
        position: absolute !important;
        width: ${K_BUTTON_SIZE}px !important; 
        height: ${K_BUTTON_SIZE}px !important;
        background: rgba(15, 15, 15, 0.9) !important;
        border: 1px solid rgba(255,255,255,0.15) !important;
        border-radius: 6px !important;
        background-image: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNHB4IiBoZWlnaHQ9IjI0cHgiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2ZmZmZmZiI+PHBhdGggZD0iTTE5IDExaC04djZoOHYtNnptNCA4VjQuOThDMjMgMy44OCAyMi4xIDMgMjEgM0gzYy0xLjEgMC0yIC44OC0yIDEuOThWMTljMCAxLjEuOSAyIDIgMmgxOGMxLjEgMCAyLS45IDItMnptLTIgLjAySDJWNC45N2gxOHYxNC4wNXoiLz48L3N2Zz4=) !important;
        background-size: 20px !important; 
        background-repeat: no-repeat !important; 
        background-position: center !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        transition: all 0.2s !important;
        backdrop-filter: blur(4px) !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      }
      
      .vivaldi-picture-in-picture-button:hover {
        background-color: #ef3939 !important;
        transform: scale(1.05) !important;
        border-color: #ef3939 !important;
      }
      
      .transparent { 
        opacity: 0 !important; 
        pointer-events: none !important; 
      }
      
      .fullscreen { 
        display: none !important; 
      }
      
      .pip-active-hidden { 
        opacity: 0 !important; 
        pointer-events: none !important; 
        display: none !important; 
      }

      .pip-settings-modal {
        all: initial;
        position: fixed !important; 
        inset: 0 !important; 
        z-index: ${K_MAX_Z_INDEX + 100} !important;
        display: flex !important; 
        justify-content: center !important; 
        align-items: center !important;
        font-size: 14px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      }
      
      .pip-modal-overlay { 
        position: absolute !important; 
        inset: 0 !important; 
        background: rgba(0,0,0,0.7) !important; 
        backdrop-filter: blur(3px) !important; 
      }
      
      .pip-modal-content {
        position: relative !important; 
        width: 600px !important; 
        max-width: 90vw !important;
        background: #1a1a1a !important; 
        color: #e0e0e0 !important;
        border-radius: 8px !important; 
        box-shadow: 0 20px 50px rgba(0,0,0,0.6) !important;
        border: 1px solid #333 !important; 
        overflow: hidden !important;
        animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      
      @keyframes slideUp { 
        from { transform: translateY(15px); opacity: 0; } 
        to { transform: translateY(0); opacity: 1; } 
      }
      
      .pip-modal-header {
        display: flex !important; 
        justify-content: space-between !important; 
        align-items: center !important;
        padding: 16px 24px !important; 
        background: #222 !important; 
        border-bottom: 1px solid #333 !important;
      }
      
      .pip-modal-header h3 { 
        margin: 0 !important; 
        font-size: 16px !important; 
        font-weight: 600 !important; 
        color: #fff !important; 
        letter-spacing: 0.5px !important; 
      }
      
      .pip-modal-close { 
        background: none !important; 
        border: none !important; 
        color: #888 !important; 
        font-size: 24px !important; 
        cursor: pointer !important; 
        transition: color 0.2s !important; 
        line-height: 1 !important;
        padding: 0 !important;
      }
      
      .pip-modal-close:hover { color: #fff !important; }

      .pip-modal-body { 
        padding: 24px !important; 
        max-height: 75vh !important; 
        overflow-y: auto !important; 
      }
      
      .pip-columns { 
        display: flex !important; 
        gap: 30px !important; 
        margin-bottom: 20px !important; 
      }
      
      .pip-col-main { flex: 2 !important; }
      .pip-col-side { 
        flex: 1 !important; 
        display: flex !important; 
        flex-direction: column !important; 
        align-items: center !important; 
      }

      .pip-section-title {
        font-size: 12px !important; 
        text-transform: uppercase !important; 
        letter-spacing: 1px !important;
        color: #888 !important; 
        margin-bottom: 12px !important; 
        font-weight: 700 !important; 
        border-bottom: 1px solid #333 !important; 
        padding-bottom: 4px !important; 
        width: 100% !important;
      }
      
      .pip-row { 
        display: flex !important; 
        align-items: center !important; 
        gap: 10px !important; 
        margin-bottom: 16px !important; 
        cursor: pointer !important; 
      }
      
      .pip-dual-input { 
        display: flex !important; 
        gap: 15px !important; 
        margin-bottom: 16px !important; 
      }
      
      .pip-dual-input label { 
        display: flex !important; 
        flex-direction: column !important; 
        gap: 5px !important; 
        font-size: 13px !important; 
        color: #ccc !important; 
        flex: 1 !important;
      }
      
      .pip-row-slider { 
        display: flex !important; 
        justify-content: space-between !important; 
        align-items: center !important; 
        margin-bottom: 12px !important; 
        font-size: 13px !important; 
      }
      
      .pip-label {
        display: block !important;
        font-size: 13px !important;
        color: #ccc !important;
        margin-bottom: 6px !important;
      }
      
      input[type="checkbox"] { 
        width: 16px !important; 
        height: 16px !important; 
        accent-color: #ef3939 !important; 
        cursor: pointer !important; 
      }
      
      input[type="number"], input[type="text"] {
        background: #2a2a2a !important; 
        border: 1px solid #444 !important; 
        color: #fff !important;
        padding: 8px 10px !important; 
        border-radius: 4px !important; 
        width: 100% !important; 
        font-size: 13px !important;
        transition: border-color 0.2s !important;
        box-sizing: border-box !important;
      }
      
      input[type="number"]:focus, input[type="text"]:focus, textarea:focus { 
        border-color: #ef3939 !important; 
        outline: none !important; 
      }
      
      input[type="range"] { 
        accent-color: #ef3939 !important; 
        width: 140px !important; 
      }
      
      textarea {
        width: 100% !important; 
        background: #2a2a2a !important; 
        border: 1px solid #444 !important; 
        color: #fff !important;
        padding: 10px !important; 
        border-radius: 4px !important; 
        resize: vertical !important; 
        font-family: monospace !important; 
        font-size: 13px !important;
        box-sizing: border-box !important;
      }
      
      .shortcut-input { 
        text-align: center !important; 
        font-weight: 600 !important; 
        cursor: pointer !important; 
        color: #ef3939 !important; 
        background: #251010 !important; 
        border-color: #521515 !important; 
      }
      
      .shortcut-input.recording { 
        background: #ef3939 !important; 
        color: #fff !important; 
        border-color: #ef3939 !important; 
      }

      .pip-pos-grid {
        display: grid !important; 
        grid-template-columns: repeat(3, 30px) !important; 
        grid-template-rows: repeat(3, 30px) !important; 
        gap: 6px !important;
        background: #2a2a2a !important; 
        padding: 10px !important; 
        border-radius: 8px !important; 
        border: 1px solid #444 !important;
      }
      
      .pip-pos-cell {
        background: #444 !important; 
        border-radius: 3px !important; 
        cursor: pointer !important; 
        transition: all 0.2s !important;
      }
      
      .pip-pos-cell:hover { background: #666 !important; }
      
      .pip-pos-cell.active { 
        background: #ef3939 !important; 
        box-shadow: 0 0 8px rgba(239, 57, 57, 0.4) !important; 
        transform: scale(1.1) !important; 
      }
      
      .pip-pos-spacer { pointer-events: none !important; }
      
      .pip-group {
        margin-top: 16px !important;
      }

      .pip-modal-footer {
        padding: 16px 24px !important; 
        background: #222 !important; 
        border-top: 1px solid #333 !important;
        display: flex !important; 
        justify-content: flex-end !important; 
        gap: 12px !important;
      }
      
      button.pip-btn-save {
        background: #ef3939 !important; 
        color: #fff !important; 
        border: none !important; 
        padding: 9px 20px !important;
        border-radius: 4px !important; 
        font-weight: 600 !important; 
        cursor: pointer !important; 
        font-size: 13px !important;
        transition: background 0.2s !important;
      }
      
      button.pip-btn-save:hover { background: #d63030 !important; }
      
      button.pip-btn-cancel {
        background: transparent !important; 
        color: #aaa !important; 
        border: 1px solid #444 !important;
        padding: 9px 20px !important; 
        border-radius: 4px !important; 
        cursor: pointer !important; 
        font-size: 13px !important;
        transition: all 0.2s !important;
      }
      
      button.pip-btn-cancel:hover { 
        border-color: #666 !important; 
        color: #fff !important; 
      }

      .pip-toast {
        all: initial;
        position: fixed !important; 
        bottom: 40px !important; 
        left: 50% !important; 
        transform: translateX(-50%) translateY(20px) !important;
        background: #222 !important; 
        color: #fff !important; 
        padding: 12px 24px !important; 
        border-radius: 4px !important;
        border-left: 4px solid #ef3939 !important; 
        opacity: 0 !important; 
        transition: all 0.3s !important; 
        pointer-events: none !important;
        box-shadow: 0 5px 20px rgba(0,0,0,0.4) !important; 
        z-index: ${K_MAX_Z_INDEX + 200} !important; 
        font-weight: 500 !important;
        font-size: 14px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      }
      
      .pip-toast.show { 
        opacity: 1 !important; 
        transform: translateX(-50%) translateY(0) !important; 
      }
    `;

    this.root_.appendChild(style);

    this.containerElm_ = document.createElement('div');
    this.containerElm_.className = 'vivaldi-picture-in-picture-container initial transparent';
    
    this.pipButton_ = document.createElement('div');
    this.pipButton_.className = 'vivaldi-picture-in-picture-button';
    this.pipButton_.title = 'Toggle PiP (Right-click for Settings)';
    
    this.containerElm_.appendChild(this.pipButton_);
    this.root_.appendChild(this.containerElm_);
    document.documentElement.appendChild(this.host_);

    // Event Listeners
    this.containerElm_.addEventListener('mouseenter', () => this.buttonOver(), { passive: true });
    this.containerElm_.addEventListener('mouseleave', () => this.buttonOut(), { passive: true });
    this.pipButton_.addEventListener('click', (e) => this.pipClicked(e));
    this.pipButton_.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openSettingsModal_();
    });

    console.log('%c✓ PiP Button Created ', 'background: #ef3939; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 3px;');
  },

  injectPip() {
    if (document.getElementById('vivaldi-pip-host-enhanced')) {
      console.log('PiP already injected');
      return;
    }
    
    this.loadSettings_();
    
    // Global keyboard handler
    document.addEventListener('keydown', (e) => this.handleGlobalKey_(e), true);

    // Global mousemove with throttling (for sites that block normal video events)
    let lastMouseMove = 0;
    document.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMouseMove < 100) return; // Throttle to max 10 checks per second
      lastMouseMove = now;
      this.videoOver(e);
    }, { passive: true });

    this.createPipButton();
    this.scanAndRegisterVideos();
    this.setupAutoPip_();

    // Observe DOM for new videos
    const observer = new MutationObserver(() => {
      this.scanAndRegisterVideos();
    });
    
    observer.observe(document.documentElement, { 
      childList: true, 
      subtree: true 
    });

    // Fullscreen handler
    document.addEventListener('fullscreenchange', () => this.onFullscreenChange());

    console.log('%c✓ PiP Enhanced v2.6 Loaded ', 'background: #ef3939; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 3px;');
  }
};

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PIP.injectPip());
} else {
  PIP.injectPip();
}
