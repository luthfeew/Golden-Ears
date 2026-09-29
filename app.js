/**
 * Golden Ears Blind Test
 * Lossless vs Lossy Audio Quality Evaluation
 * Built with Tailwind CSS v3 & Lucide Icons
 * Supports: GitHub Pages (HTTPS), Local Server (HTTP), and Direct File (file:///)
 */

(function () {
  'use strict';

  // ==========================================
  // 1. DATA & APP STATE
  // ==========================================
  const state = {
    catalog: [],              // Song catalog
    selectedFormat: 'flac',   // 'flac' | 'wav'
    testSongs: [],            // 10 chosen songs for current test
    preloadedData: new Map(), // song.id -> { coverUrl, buffers: {}, audioElements: {} }
    currentRoundIndex: 0,
    roundsData: [],           // 10 rounds details (mapping, choices, answers)
    score: 0,
    stats: {
      lossless: 0,
      mp3_320: 0,
      mp3_128: 0
    },
    audioEngine: null,
    isDarkTheme: true
  };

  // ==========================================
  // 2. AUDIO ENGINE (Dual Web Audio API + HTML5 Audio)
  // ==========================================
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.gainNode = null;
      this.analyser = null;
      this.sourceNode = null;
      this.currentSample = 'A';
      this.isPlaying = false;
      this.startTime = 0;
      this.pausedAt = 0;
      this.duration = 12.0;
      this.isLooping = true;
      this.volume = 1.0;
      this.isMuted = false;
      this.previousVolume = 1.0;

      this.activeBuffers = {};        // { 'A': AudioBuffer, 'B': ..., 'C': ... }
      this.activeAudioElements = {};   // { 'A': HTMLAudioElement, 'B': ..., 'C': ... }
      this.useWebAudio = true;

      this.initContext();
    }

    initContext() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.ctx = new AudioContextClass();
          this.gainNode = this.ctx.createGain();
          this.gainNode.gain.value = 1.0;
          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 64;
          this.analyser.smoothingTimeConstant = 0.8;
          this.gainNode.connect(this.analyser);
          this.analyser.connect(this.ctx.destination);
          this.useWebAudio = true;
        } catch (e) {
          console.warn('Web Audio init failed, using HTML5 Audio fallback:', e);
          this.useWebAudio = false;
        }
      } else {
        this.useWebAudio = false;
      }
    }

    async ensureContextRunning() {
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (e) {
          console.warn('AudioContext resume error:', e);
        }
      }
    }

    loadRound(buffers, audioElements) {
      this.stop();
      this.activeBuffers = buffers || {};
      this.activeAudioElements = audioElements || {};
      this.currentSample = 'A';
      this.pausedAt = 0;
      this.startTime = 0;

      // Determine duration safely
      if (this.activeBuffers['A'] && this.activeBuffers['A'].duration && !isNaN(this.activeBuffers['A'].duration)) {
        this.duration = this.activeBuffers['A'].duration;
      } else if (this.activeAudioElements['A'] && !isNaN(this.activeAudioElements['A'].duration) && this.activeAudioElements['A'].duration > 0) {
        this.duration = this.activeAudioElements['A'].duration;
      } else {
        this.duration = 12.0;
      }
    }

    async startSource(offset = 0) {
      // 1. Stop any currently playing audio
      this.stopCurrentPlaying();

      await this.ensureContextRunning();

      const buffer = this.activeBuffers[this.currentSample];
      const audioElem = this.activeAudioElements[this.currentSample];
      const safeDuration = (!isNaN(this.duration) && this.duration > 0) ? this.duration : 12.0;
      const safeOffset = Math.max(0, Math.min(offset, safeDuration - 0.05));

      // Strategy A: Web Audio API (if buffer is decoded)
      if (this.useWebAudio && buffer && this.ctx && this.ctx.state === 'running') {
        try {
          this.sourceNode = this.ctx.createBufferSource();
          this.sourceNode.buffer = buffer;
          this.sourceNode.loop = this.isLooping;
          this.sourceNode.connect(this.gainNode);

          this.startTime = this.ctx.currentTime - safeOffset;
          this.sourceNode.start(0, safeOffset);

          this.sourceNode.onended = () => {
            if (!this.isLooping && this.isPlaying) {
              const elapsed = this.ctx.currentTime - this.startTime;
              if (elapsed >= this.duration) {
                this.isPlaying = false;
                this.pausedAt = 0;
                updatePlayPauseUI();
              }
            }
          };
          this.isPlaying = true;
          updatePlayPauseUI();
          return;
        } catch (err) {
          console.warn('Web Audio playback error, falling back to HTML5 audio element:', err);
        }
      }

      // Strategy B: HTML5 Audio Element (Works natively everywhere, including file:///)
      if (audioElem) {
        audioElem.loop = this.isLooping;
        audioElem.volume = this.isMuted ? 0 : this.volume;
        try {
          audioElem.currentTime = safeOffset;
        } catch { }

        audioElem.play().then(() => {
          this.isPlaying = true;
          this.startTime = Date.now() / 1000 - safeOffset;
          updatePlayPauseUI();
        }).catch(err => {
          console.warn('Audio play() error:', err);
          this.isPlaying = false;
          updatePlayPauseUI();
        });

        audioElem.onended = () => {
          if (!this.isLooping) {
            this.isPlaying = false;
            this.pausedAt = 0;
            updatePlayPauseUI();
          }
        };
      }
    }

    stopCurrentPlaying() {
      // Stop Web Audio node
      if (this.sourceNode) {
        this.sourceNode.onended = null;
        try { this.sourceNode.stop(); } catch { }
        try { this.sourceNode.disconnect(); } catch { }
        this.sourceNode = null;
      }
      // Pause all HTML5 audio elements
      Object.values(this.activeAudioElements).forEach(a => {
        if (a) {
          try { a.pause(); } catch { }
        }
      });
    }

    getCurrentTime() {
      if (!this.isPlaying) {
        return this.pausedAt;
      }

      const buffer = this.activeBuffers[this.currentSample];
      if (this.useWebAudio && buffer && this.ctx && this.ctx.state === 'running') {
        const elapsed = this.ctx.currentTime - this.startTime;
        if (this.isLooping) {
          return elapsed % this.duration;
        }
        return Math.min(elapsed, this.duration);
      }

      const audioElem = this.activeAudioElements[this.currentSample];
      if (audioElem && !isNaN(audioElem.currentTime)) {
        return audioElem.currentTime;
      }

      return this.pausedAt;
    }

    async play() {
      await this.ensureContextRunning();
      await this.startSource(this.pausedAt);
    }

    pause() {
      if (this.isPlaying) {
        this.pausedAt = this.getCurrentTime();
        this.stopCurrentPlaying();
        this.isPlaying = false;
        updatePlayPauseUI();
      }
    }

    async togglePlay() {
      await this.ensureContextRunning();
      if (this.isPlaying) {
        this.pause();
      } else {
        await this.startSource(this.pausedAt);
      }
    }

    stop() {
      this.stopCurrentPlaying();
      this.isPlaying = false;
      this.pausedAt = 0;
      updatePlayPauseUI();
      updateTimelineUI(0);
    }

    async seek(seconds) {
      const targetTime = Math.max(0, Math.min(seconds, this.duration));
      this.pausedAt = targetTime;
      if (this.isPlaying) {
        await this.startSource(targetTime);
      } else {
        updateTimelineUI(targetTime);
      }
    }

    async switchSample(sampleKey) {
      await this.ensureContextRunning();
      const currentPlayhead = this.getCurrentTime();
      this.currentSample = sampleKey;

      // Update current round choice directly ONLY if not locked yet
      const currentRound = state.roundsData[state.currentRoundIndex];
      if (currentRound && !currentRound.isLocked) {
        currentRound.userChoice = sampleKey;
        const lockBtnText = document.getElementById('btn-lock-text');
        if (lockBtnText) {
          lockBtnText.textContent = `Kunci Jawaban (Sampel ${sampleKey})`;
        }
      }

      // Always play when user explicitly taps Sample A, B, or C!
      await this.startSource(currentPlayhead);
      updateSampleButtonsUI();
    }

    setLoop(enabled) {
      this.isLooping = enabled;
      if (this.sourceNode) {
        this.sourceNode.loop = enabled;
      }
      Object.values(this.activeAudioElements).forEach(a => {
        if (a) a.loop = enabled;
      });
    }

    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, value));
      if (this.volume > 0) {
        this.isMuted = false;
      }
      const actualGain = this.isMuted ? 0 : this.volume;
      if (this.gainNode && this.ctx) {
        this.gainNode.gain.setValueAtTime(actualGain, this.ctx.currentTime);
      }
      Object.values(this.activeAudioElements).forEach(a => {
        if (a) a.volume = actualGain;
      });
      updateVolumeUI();
    }

    toggleMute() {
      if (this.isMuted) {
        this.isMuted = false;
        this.setVolume(this.previousVolume || 0.85);
      } else {
        this.previousVolume = this.volume;
        this.isMuted = true;
        this.setVolume(0);
      }
    }
  }



  // ==========================================
  // 4. UI HELPER & STATE CONTROL
  // ==========================================
  function showScreen(screenId) {
    document.querySelectorAll('section[id^="screen-"]').forEach(el => {
      el.classList.add('hidden');
    });
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const btnHome = document.getElementById('btn-header-home');
    if (btnHome) {
      btnHome.style.display = (screenId === 'screen-intro') ? 'none' : 'inline-flex';
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');

    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.classList.remove('translate-y-24', 'opacity-0', 'pointer-events-none');
      toast.classList.add('translate-y-0', 'opacity-100');
      setTimeout(() => {
        toast.classList.add('translate-y-24', 'opacity-0', 'pointer-events-none');
        toast.classList.remove('translate-y-0', 'opacity-100');
      }, 3200);
    }
  }

  function formatTime(sec) {
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Helper to create & preload HTML5 Audio element
  function createPreloadedAudio(src) {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = src;
    audio.load();
    return audio;
  }

  // Helper to preload Image into memory (Blob URL for HTTP/HTTPS, Image element for file:///)
  async function createPreloadedImage(url, isFileProtocol) {
    if (!url) return 'assets/placeholder.svg';
    if (!isFileProtocol) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          return URL.createObjectURL(blob);
        }
      } catch (e) {
        console.warn('Cover fetch blob error, falling back to Image element preload:', e);
      }
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(url);
      img.src = url;
    });
  }

  // ==========================================
  // 5. PRELOADING ENGINE (Multi-Protocol Resilient)
  // ==========================================
  let preloadCancellationToken = 0;

  async function startPreloadProcess() {
    showScreen('screen-preload');
    const currentToken = ++preloadCancellationToken;

    const isFileProtocol = window.location.protocol === 'file:';

    // Pick 10 unique songs from catalog
    const shuffledCatalog = shuffle(state.catalog);
    state.testSongs = shuffledCatalog.slice(0, 10);
    // Revoke any previous blob URLs before clearing
    state.preloadedData.forEach(item => {
      if (item && item.coverUrl && item.coverUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.coverUrl);
      }
    });
    state.preloadedData.clear();
    state.roundsData = [];
    state.score = 0;
    state.stats = { lossless: 0, mp3_320: 0, mp3_128: 0 };
    state.currentRoundIndex = 0;

    // Render 10 songs queue in preload list
    const listContainer = document.getElementById('preload-song-list');
    listContainer.innerHTML = '';
    state.testSongs.forEach((song, idx) => {
      const item = document.createElement('div');
      item.className = 'px-3.5 py-2.5 flex items-center justify-between text-xs transition-colors';
      item.id = `preload-item-${song.id}`;
      item.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 pr-2">
          <span class="w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0">${idx + 1}</span>
          <div class="truncate">
            <span class="font-bold text-zinc-900 dark:text-white">${song.title}</span>
            <span class="text-zinc-500 dark:text-zinc-400"> - ${song.artist}</span>
          </div>
        </div>
        <div class="shrink-0 flex items-center" id="icon-container-${song.id}">
          <i data-lucide="clock" class="w-4 h-4 text-zinc-400"></i>
        </div>
      `;
      listContainer.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons();

    const isFlac = state.selectedFormat === 'flac';
    let totalBytes = 0;
    state.testSongs.forEach(song => {
      totalBytes += (song.coverSize || 500000);
      totalBytes += isFlac ? (song.flacSize || 2200000) : (song.wavSize || 3200000);
      totalBytes += (song.mp3_320Size || 400000);
      totalBytes += (song.mp3_128Size || 160000);
    });

    let loadedBytes = 0;
    let completedFiles = 0;
    const totalFiles = state.testSongs.length * 4;

    const progressFill = document.getElementById('preload-progress-fill');
    const progressPct = document.getElementById('preload-percentage');
    const bytesInfo = document.getElementById('preload-bytes-info');
    const itemsCount = document.getElementById('preload-items-count');
    const currentFileLabel = document.getElementById('preload-current-file');
    const statusLabel = document.getElementById('preload-status-label');

    statusLabel.textContent = isFileProtocol
      ? 'Memuat audio & sampul dari file lokal...'
      : `Mengunduh audio & sampul pengujian (${isFlac ? 'FLAC' : 'WAV'})...`;

    for (let i = 0; i < state.testSongs.length; i++) {
      if (currentToken !== preloadCancellationToken) return;

      const song = state.testSongs[i];
      const songRow = document.getElementById(`preload-item-${song.id}`);
      const songContainer = document.getElementById(`icon-container-${song.id}`);

      if (songRow) {
        songRow.classList.add('bg-brand-50/70', 'dark:bg-brand-950/40');
      }
      if (songContainer) {
        songContainer.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 text-brand-600 dark:text-brand-400 animate-spin"></i>';
        if (window.lucide) window.lucide.createIcons();
      }

      currentFileLabel.textContent = `[${i + 1}/10] ${song.title} - ${song.artist}`;

      const losslessPath = isFlac ? song.flac : song.wav;
      const mp3320Path = song.mp3_320;
      const mp3128Path = song.mp3_128;
      const coverUrl = song.cover || 'assets/placeholder.svg';

      let resolvedCoverUrl = coverUrl;
      const buffers = {};
      const audioElements = {};

      // If on HTTP/HTTPS, decode AudioBuffers via Web Audio API directly into RAM
      if (!isFileProtocol && state.audioEngine.useWebAudio && state.audioEngine.ctx) {
        try {
          const fetchAndDecode = async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const arr = await res.arrayBuffer();
            return await state.audioEngine.ctx.decodeAudioData(arr.slice(0));
          };

          const [coverRes, bufLossless, buf320, buf128] = await Promise.allSettled([
            createPreloadedImage(coverUrl, isFileProtocol),
            fetchAndDecode(losslessPath),
            fetchAndDecode(mp3320Path),
            fetchAndDecode(mp3128Path)
          ]);

          if (coverRes.status === 'fulfilled' && coverRes.value) resolvedCoverUrl = coverRes.value;
          if (bufLossless.status === 'fulfilled') buffers['lossless'] = bufLossless.value;
          else audioElements['lossless'] = createPreloadedAudio(losslessPath);

          if (buf320.status === 'fulfilled') buffers['mp3_320'] = buf320.value;
          else audioElements['mp3_320'] = createPreloadedAudio(mp3320Path);

          if (buf128.status === 'fulfilled') buffers['mp3_128'] = buf128.value;
          else audioElements['mp3_128'] = createPreloadedAudio(mp3128Path);
        } catch (e) {
          console.warn('Web Audio decode warning, using AudioElements fallback:', e);
          if (!buffers['lossless']) audioElements['lossless'] = createPreloadedAudio(losslessPath);
          if (!buffers['mp3_320']) audioElements['mp3_320'] = createPreloadedAudio(mp3320Path);
          if (!buffers['mp3_128']) audioElements['mp3_128'] = createPreloadedAudio(mp3128Path);
        }
      } else {
        // Direct file:/// or fallback: preload HTML5 audio & image
        audioElements['lossless'] = createPreloadedAudio(losslessPath);
        audioElements['mp3_320'] = createPreloadedAudio(mp3320Path);
        audioElements['mp3_128'] = createPreloadedAudio(mp3128Path);
        try {
          resolvedCoverUrl = await createPreloadedImage(coverUrl, isFileProtocol);
        } catch (e) {
          console.warn('Cover preload error:', e);
        }
      }

      if (currentToken !== preloadCancellationToken) return;

      completedFiles += 4;
      const approxBytesPerSong = (song.coverSize || 500000) +
        (isFlac ? (song.flacSize || 2200000) : (song.wavSize || 3200000)) +
        (song.mp3_320Size || 400000) +
        (song.mp3_128Size || 160000);
      loadedBytes += approxBytesPerSong;

      const pct = Math.min(100, Math.round(((i + 1) / state.testSongs.length) * 100));
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (progressPct) progressPct.textContent = `${pct}%`;
      if (bytesInfo) bytesInfo.textContent = `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`;
      if (itemsCount) itemsCount.textContent = `${completedFiles} / ${totalFiles} file`;

      state.preloadedData.set(song.id, {
        coverUrl: resolvedCoverUrl,
        buffers,
        audioElements
      });

      // Prepare randomized A, B, C mapping
      const formats = shuffle(['lossless', 'mp3_320', 'mp3_128']);
      const mapping = {
        'A': formats[0],
        'B': formats[1],
        'C': formats[2]
      };
      const reverseMapping = {
        [formats[0]]: 'A',
        [formats[1]]: 'B',
        [formats[2]]: 'C'
      };

      state.roundsData.push({
        song,
        mapping,
        reverseMapping,
        userChoice: null,
        isCorrect: null,
        isLocked: false
      });

      if (songRow) {
        songRow.classList.remove('bg-brand-50/70', 'dark:bg-brand-950/40');
      }
      if (songContainer) {
        songContainer.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    }

    if (currentToken !== preloadCancellationToken) return;

    if (progressFill) progressFill.style.width = '100%';
    if (progressPct) progressPct.textContent = '100%';
    statusLabel.textContent = 'Semua lagu & sampul siap! Membuka panggung tes...';
    currentFileLabel.textContent = '30 file audio & 10 sampul siap di memori RAM.';

    setTimeout(() => {
      if (currentToken === preloadCancellationToken) {
        startBlindTest();
      }
    }, 400);
  }

  // ==========================================
  // 6. BLIND TEST CONTROLLER
  // ==========================================
  async function startBlindTest() {
    state.currentRoundIndex = 0;
    await setupRound(0);
    showScreen('screen-test');
  }

  async function setupRound(index) {
    state.currentRoundIndex = index;
    const round = state.roundsData[index];
    const song = round.song;
    const preloaded = state.preloadedData.get(song.id);

    // Update Round Headers & Trackers
    const roundIndicator = document.getElementById('round-indicator');
    if (roundIndicator) roundIndicator.textContent = `Lagu ${index + 1} dari 10`;

    // Render Round Dots
    const dotsContainer = document.getElementById('round-dots');
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const dot = document.createElement('div');
        if (i < index) {
          dot.className = 'w-2 h-2 rounded bg-emerald-500 transition-all';
        } else if (i === index) {
          dot.className = 'w-5 h-2 rounded bg-brand-600 transition-all';
        } else {
          dot.className = 'w-2 h-2 rounded bg-zinc-300 dark:bg-zinc-700 transition-all';
        }
        dotsContainer.appendChild(dot);
      }
    }

    // Set Song Meta & Cover & Ambient Glow Backdrop
    const coverImg = document.getElementById('test-cover-img');
    const coverBackdrop = document.getElementById('cover-backdrop');
    const coverUrl = preloaded ? preloaded.coverUrl : 'assets/placeholder.svg';

    if (coverImg) coverImg.src = coverUrl;
    if (coverBackdrop) {
      coverBackdrop.style.backgroundImage = `url("${coverUrl}")`;
    }

    document.getElementById('test-song-title').textContent = song.title;
    document.getElementById('test-song-artist').textContent = song.artist;

    // Map audio buffers & audio elements for sample A, B, C
    const roundBuffers = {};
    const roundAudioElements = {};

    ['A', 'B', 'C'].forEach(sampleKey => {
      const formatType = round.mapping[sampleKey];
      if (preloaded) {
        roundBuffers[sampleKey] = preloaded.buffers ? preloaded.buffers[formatType] : null;
        roundAudioElements[sampleKey] = preloaded.audioElements ? preloaded.audioElements[formatType] : null;
      }
    });

    state.audioEngine.loadRound(roundBuffers, roundAudioElements);

    // Set default selection to A
    round.userChoice = 'A';

    const lockContainer = document.getElementById('lock-answer-container');
    const lockBtnText = document.getElementById('btn-lock-text');
    if (lockBtnText) {
      lockBtnText.textContent = 'Kunci Jawaban (Sampel A)';
    }

    if (lockContainer) {
      lockContainer.classList.remove('hidden');
    }

    // Hide reveal box
    const revealBox = document.getElementById('answer-reveal-box');
    if (revealBox) revealBox.classList.add('hidden');

    // Reset Sample Buttons
    updateSampleButtonsUI();
    updateTimelineUI(0);
    updatePlayPauseUI();

    // Start playing Sample A (handles autoplay gracefully)
    try {
      await state.audioEngine.switchSample('A');
    } catch (err) {
      console.warn('Autoplay prevented or deferred:', err);
    }
  }

  function updateSampleButtonsUI() {
    const curSample = state.audioEngine.currentSample;

    ['A', 'B', 'C'].forEach(s => {
      const btn = document.getElementById(`btn-sample-${s}`);
      if (btn) {
        if (s === curSample) {
          btn.className = 'sample-btn py-4 px-2 rounded-xl font-bold flex items-center justify-center border-2 border-brand-500 bg-brand-600 text-white shadow-md shadow-brand-500/25 transition-all';
        } else {
          btn.className = 'sample-btn py-4 px-2 rounded-xl font-bold flex items-center justify-center border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all';
        }
      }
    });
  }

  function updatePlayPauseUI() {
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    if (playIcon && pauseIcon) {
      if (state.audioEngine.isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
      } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      }
    }
    updateSampleButtonsUI();
  }

  function updateTimelineUI(currentTime) {
    const curTime = currentTime !== undefined ? currentTime : state.audioEngine.getCurrentTime();
    const duration = state.audioEngine.duration || 10.0;

    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    const seekBar = document.getElementById('seek-bar');
    const playerTimeDisplay = document.getElementById('player-time-display');

    if (timeCurrent) timeCurrent.textContent = formatTime(curTime);
    if (timeTotal) timeTotal.textContent = formatTime(duration);
    if (seekBar && !seekBar.matches(':active')) {
      seekBar.max = duration;
      seekBar.value = curTime;
    }
    if (playerTimeDisplay) {
      playerTimeDisplay.textContent = `${formatTime(curTime)} / ${formatTime(duration)}`;
    }
  }

  function updateVolumeUI() {
    const icon = document.getElementById('volume-icon');
    const slider = document.getElementById('volume-slider');
    const vol = state.audioEngine.volume;
    const isMuted = state.audioEngine.isMuted;

    if (slider) slider.value = isMuted ? 0 : vol;
    if (icon) {
      let iconName = 'volume-2';
      if (isMuted || vol === 0) iconName = 'volume-x';
      else if (vol < 0.5) iconName = 'volume-1';
      else iconName = 'volume-2';

      icon.setAttribute('data-lucide', iconName);
      if (window.lucide) window.lucide.createIcons();
    }
  }

  function lockCurrentAnswer() {
    const round = state.roundsData[state.currentRoundIndex];
    if (!round) return;
    if (!round.userChoice) round.userChoice = state.audioEngine.currentSample || 'A';

    const chosenSample = round.userChoice;
    const chosenFormat = round.mapping[chosenSample];
    const correctSample = round.reverseMapping['lossless'];
    const isCorrect = chosenSample === correctSample;

    round.isCorrect = isCorrect;
    round.isLocked = true;
    if (isCorrect) {
      state.score++;
      state.stats.lossless++;
    } else {
      if (chosenFormat === 'mp3_320') state.stats.mp3_320++;
      if (chosenFormat === 'mp3_128') state.stats.mp3_128++;
    }

    // Hide lock button
    const lockContainer = document.getElementById('lock-answer-container');
    if (lockContainer) lockContainer.classList.add('hidden');

    // Show Reveal Box
    const revealBox = document.getElementById('answer-reveal-box');
    const revealIconWrap = document.getElementById('reveal-icon-wrap');
    const checkIcon = document.getElementById('reveal-icon-check');
    const crossIcon = document.getElementById('reveal-icon-cross');
    const revealTitle = document.getElementById('reveal-title');
    const revealDesc = document.getElementById('reveal-desc');
    const isFlac = state.selectedFormat === 'flac';
    const losslessLabel = isFlac ? 'Lossless (FLAC)' : 'Lossless (WAV)';

    if (isCorrect) {
      revealBox.className = 'border-2 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl p-5 space-y-4';
      if (revealIconWrap) revealIconWrap.className = 'w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0';
      if (checkIcon) checkIcon.classList.remove('hidden');
      if (crossIcon) crossIcon.classList.add('hidden');
      revealTitle.textContent = 'Tepat Sekali!';
      revealDesc.textContent = `Sampel ${chosenSample} memang berformat ${losslessLabel}. Telingamu jeli!`;
    } else {
      const chosenLabel = chosenFormat === 'mp3_320' ? 'MP3 320 kbps' : 'MP3 128 kbps';
      revealBox.className = 'border-2 border-rose-500 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl p-5 space-y-4';
      if (revealIconWrap) revealIconWrap.className = 'w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0';
      if (checkIcon) checkIcon.classList.add('hidden');
      if (crossIcon) crossIcon.classList.remove('hidden');
      revealTitle.textContent = 'Kurang Tepat!';
      revealDesc.textContent = `Kamu memilih Sampel ${chosenSample} (${chosenLabel}). Yang Lossless aslinya Sampel ${correctSample}.`;
    }

    // Populate format identities for A, B, C
    ['A', 'B', 'C'].forEach(s => {
      const format = round.mapping[s];
      const formatBadge = document.getElementById(`reveal-format-${s}`);
      const identityCard = document.getElementById(`identity-${s}`);

      if (format === 'lossless') {
        if (formatBadge) {
          formatBadge.textContent = isFlac ? 'FLAC ✓' : 'WAV ✓';
          formatBadge.className = 'font-black text-xs sm:text-sm mt-0.5 text-emerald-700 dark:text-emerald-300';
        }
        if (identityCard) {
          identityCard.className = 'border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg p-2.5 text-center';
        }
      } else if (format === 'mp3_320') {
        if (formatBadge) {
          formatBadge.textContent = 'MP3 320k';
          formatBadge.className = 'font-bold text-xs sm:text-sm mt-0.5 text-amber-700 dark:text-amber-300';
        }
        if (identityCard) {
          identityCard.className = 'border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2.5 text-center';
        }
      } else {
        if (formatBadge) {
          formatBadge.textContent = 'MP3 128k';
          formatBadge.className = 'font-bold text-xs sm:text-sm mt-0.5 text-zinc-600 dark:text-zinc-400';
        }
        if (identityCard) {
          identityCard.className = 'border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-lg p-2.5 text-center';
        }
      }
    });

    const nextBtn = document.getElementById('btn-next-song');
    if (nextBtn) {
      if (state.currentRoundIndex === 9) {
        nextBtn.innerHTML = `<span>Lihat Hasil Tes</span> <i data-lucide="award" class="w-4 h-4"></i>`;
      } else {
        nextBtn.innerHTML = `<span>Lagu Berikutnya (${state.currentRoundIndex + 2}/10)</span> <i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      }
    }

    if (revealBox) revealBox.classList.remove('hidden');

    if (window.lucide) window.lucide.createIcons();
  }

  async function advanceToNextRound() {
    if (state.currentRoundIndex < 9) {
      await setupRound(state.currentRoundIndex + 1);
    } else {
      showFinalResults();
    }
  }

  // ==========================================
  // 7. FINAL RESULTS & SCORECARD
  // ==========================================
  function showFinalResults() {
    state.audioEngine.stop();
    showScreen('screen-results');

    const score = state.score;
    const pct = Math.round((score / 10) * 100);

    document.getElementById('result-score-text').textContent = `${score} / 10`;
    document.getElementById('result-accuracy-text').textContent = `Tingkat Akurasi: ${pct}%`;

    let rankTitle = '';
    let rankIcon = '🏆';
    let rankDesc = '';

    if (score === 10) {
      rankIcon = '👑';
      rankTitle = 'Telinga Emas Murni (Golden Ears)';
      rankDesc = 'Sempurna! 10 dari 10 tebakan tepat. Kamu punya kepekaan telinga luar biasa dalam menangkap detail mikro dan kualitas master murni.';
    } else if (score >= 8) {
      rankIcon = '🏆';
      rankTitle = 'Pendengar Kritis (Critical Listener)';
      rankDesc = 'Hebat! Pendengaranmu sangat tajam. Kamu konsisten mengenali perbedaan antara MP3 320k dan format Lossless asli.';
    } else if (score >= 6) {
      rankIcon = '🎧';
      rankTitle = 'Pendengar Jeli (Hi-Fi Enthusiast)';
      rankDesc = 'Bagus! Kamu bisa membedakan kualitas audio dengan baik. Kompresi MP3 320k memang sangat rapat dan menipu telinga.';
    } else if (score >= 4) {
      rankIcon = '📻';
      rankTitle = 'Pendengar Standar (Casual Listener)';
      rankDesc = 'Cukup baik! Algoritma MP3 320k memang dirancang agar terdengar sangat mirip lossless untuk telinga kebanyakan orang.';
    } else {
      rankIcon = '🎯';
      rankTitle = 'Telinga Santai (Streaming Listener)';
      rankDesc = 'Perbedaan kompresi tidak terasa di telinga atau perangkatmu saat ini. Format MP3 standar sudah sangat cukup untukmu menikmati musik!';
    }

    document.getElementById('result-rank-icon').textContent = rankIcon;
    document.getElementById('result-rank-title').textContent = rankTitle;
    document.getElementById('result-rank-desc').textContent = rankDesc;

    document.getElementById('stat-correct').textContent = state.stats.lossless;
    document.getElementById('stat-mp3-320').textContent = state.stats.mp3_320;
    document.getElementById('stat-mp3-128').textContent = state.stats.mp3_128;

    const reviewList = document.getElementById('results-song-list');
    if (reviewList) {
      reviewList.innerHTML = '';
      const isFlac = state.selectedFormat === 'flac';
      const losslessLabel = isFlac ? 'FLAC' : 'WAV';

      state.roundsData.forEach((round, i) => {
        const song = round.song;
        const preloaded = state.preloadedData.get(song.id);
        const isCorrect = round.isCorrect;
        const chosenFormat = round.mapping[round.userChoice];

        const item = document.createElement('div');
        item.className = 'px-3.5 py-3 flex items-center justify-between gap-3 text-xs';
        item.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <img src="${preloaded ? preloaded.coverUrl : 'assets/placeholder.svg'}" alt="Cover" class="w-11 h-11 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0">
            <div class="truncate">
              <div class="font-bold text-zinc-900 dark:text-white truncate">${i + 1}. ${song.title}</div>
              <div class="text-zinc-500 dark:text-zinc-400 truncate text-[11px]">${song.artist}</div>
              <div class="flex items-center gap-1.5 mt-1 text-[11px]">
                <span class="px-1.5 py-0.5 rounded font-extrabold ${isCorrect ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}">
                  ${isCorrect ? '✓ Benar' : '✗ Kurang Tepat'}
                </span>
                <span class="text-zinc-600 dark:text-zinc-400">Pilih: <strong>${round.userChoice}</strong> (${chosenFormat === 'lossless' ? losslessLabel : (chosenFormat === 'mp3_320' ? '320k' : '128k')})</span>
                <span class="text-zinc-400">•</span>
                <span class="text-zinc-600 dark:text-zinc-400">Asli Lossless: <strong>${round.reverseMapping['lossless']}</strong></span>
              </div>
            </div>
          </div>
        `;
        reviewList.appendChild(item);
      });

      if (window.lucide) window.lucide.createIcons();
    }
  }

  // ==========================================
  // 8. EVENT HANDLERS & INITIALIZATION
  // ==========================================
  function initEvents() {
    // Top Nav Buttons
    const btnHome = document.getElementById('btn-header-home');
    if (btnHome) {
      btnHome.addEventListener('click', () => {
        preloadCancellationToken++;
        state.audioEngine.stop();
        showScreen('screen-intro');
      });
    }

    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        state.isDarkTheme = !state.isDarkTheme;
        if (state.isDarkTheme) {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        }
      });
    }



    // Format selection cards
    const cardFlac = document.getElementById('card-format-flac');
    const cardWav = document.getElementById('card-format-wav');
    const quotaEstimateText = document.getElementById('quota-estimate-text');

    function updateFormatCards(selected) {
      state.selectedFormat = selected;
      const activeClass = ['border-brand-500', 'hover:border-brand-500', 'bg-brand-50/50', 'dark:bg-brand-950/40'];
      const inactiveClass = ['border-zinc-200', 'dark:border-zinc-800', 'bg-white', 'dark:bg-zinc-800/50', 'hover:border-zinc-300', 'dark:hover:border-zinc-700'];

      const applyCardState = (card, isActive) => {
        if (!card) return;
        if (isActive) {
          card.classList.remove(...inactiveClass);
          card.classList.add(...activeClass);
        } else {
          card.classList.remove(...activeClass);
          card.classList.add(...inactiveClass);
        }
        const r = card.querySelector('input[type="radio"]');
        if (r) r.checked = isActive;
      };

      applyCardState(cardFlac, selected === 'flac');
      applyCardState(cardWav, selected === 'wav');

      if (quotaEstimateText) {
        quotaEstimateText.textContent = selected === 'flac'
          ? 'Estimasi Data: ~30 MB s/d 35 MB (Format FLAC).'
          : 'Estimasi Data: ~45 MB s/d 55 MB (Format WAV).';
      }
    }

    if (cardFlac) cardFlac.addEventListener('click', () => updateFormatCards('flac'));
    if (cardWav) cardWav.addEventListener('click', () => updateFormatCards('wav'));

    // Start Test Button
    const btnStart = document.getElementById('btn-start-test');
    if (btnStart) {
      btnStart.addEventListener('click', async () => {
        if (state.audioEngine) {
          await state.audioEngine.ensureContextRunning();
        }
        startPreloadProcess();
      });
    }

    // Sample switcher buttons (A, B, C)
    ['A', 'B', 'C'].forEach(sampleKey => {
      const btn = document.getElementById(`btn-sample-${sampleKey}`);
      if (btn) {
        btn.addEventListener('click', async () => {
          await state.audioEngine.switchSample(sampleKey);
        });
      }
    });

    // Lock Answer Button
    const lockBtn = document.getElementById('btn-lock-answer');
    if (lockBtn) {
      lockBtn.addEventListener('click', lockCurrentAnswer);
    }

    const nextBtn = document.getElementById('btn-next-song');
    if (nextBtn) {
      nextBtn.addEventListener('click', advanceToNextRound);
    }

    // Transport buttons
    const playPauseBtn = document.getElementById('btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', async () => {
        await state.audioEngine.togglePlay();
      });
    }

    const replayBtn = document.getElementById('btn-replay');
    if (replayBtn) {
      replayBtn.addEventListener('click', async () => {
        await state.audioEngine.ensureContextRunning();
        state.audioEngine.seek(0);
      });
    }

    const loopBtn = document.getElementById('btn-loop-toggle');
    if (loopBtn) {
      loopBtn.addEventListener('click', () => {
        const newLoopState = !state.audioEngine.isLooping;
        state.audioEngine.setLoop(newLoopState);
        if (newLoopState) {
          loopBtn.className = 'p-2 rounded-lg bg-brand-100 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 transition';
        } else {
          loopBtn.className = 'p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 dark:text-zinc-500 border border-transparent transition';
        }
      });
    }

    const seekBar = document.getElementById('seek-bar');
    if (seekBar) {
      let seekRaf = null;
      seekBar.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        updateTimelineUI(val);
        if (seekRaf) cancelAnimationFrame(seekRaf);
        seekRaf = requestAnimationFrame(() => {
          state.audioEngine.seek(val);
        });
      });
      seekBar.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        state.audioEngine.seek(val);
      });
    }

    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        state.audioEngine.setVolume(parseFloat(e.target.value));
      });
    }

    const muteBtn = document.getElementById('btn-mute-toggle');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        state.audioEngine.toggleMute();
      });
    }

    // Share Result Button
    const btnShare = document.getElementById('btn-share-result');
    if (btnShare) {
      btnShare.addEventListener('click', async () => {
        const score = state.score;
        const pct = Math.round((score / 10) * 100);
        const rankTitle = document.getElementById('result-rank-title')?.textContent?.trim() || 'Pendengar Kritis';
        const isFlac = state.selectedFormat === 'flac';
        const formatLabel = isFlac ? 'FLAC Hi-Res (24bit)' : 'WAV Hi-Res (24bit)';

        const text = `🎧 Golden Ears — Blind Audio Test
Skor: ${score} / 10 (${pct}%)
Peringkat: ${rankTitle}
Format Acuan: ${formatLabel}
✓ Tebakan Tepat: ${state.stats.lossless}
⚠️ Terkecoh 320k: ${state.stats.mp3_320}
✗ Terkecoh 128k: ${state.stats.mp3_128}

Uji kepekaan telingamu membedakan audio Lossless vs MP3 di Golden Ears!`;

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            showToast('Hasil berhasil disalin ke clipboard!');
          } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Hasil berhasil disalin ke clipboard!');
          }
        } catch (err) {
          console.warn('Clipboard write failed:', err);
          showToast('Gagal menyalin otomatis. Silakan tangkap layar hasilmu!');
        }
      });
    }

    // Restart Test Button
    const restartBtn = document.getElementById('btn-restart-test');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        startPreloadProcess();
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Digit1' || e.code === 'KeyA') {
        await state.audioEngine.switchSample('A');
      } else if (e.code === 'Digit2' || e.code === 'KeyB') {
        await state.audioEngine.switchSample('B');
      } else if (e.code === 'Digit3' || e.code === 'KeyC') {
        await state.audioEngine.switchSample('C');
      } else if (e.code === 'Space') {
        e.preventDefault();
        await state.audioEngine.togglePlay();
      } else if (e.code === 'KeyL') {
        if (loopBtn) loopBtn.click();
      } else if (e.code === 'KeyM') {
        if (muteBtn) muteBtn.click();
      } else if (e.code === 'Enter') {
        const revealBox = document.getElementById('answer-reveal-box');
        const lockContainer = document.getElementById('lock-answer-container');
        if (revealBox && !revealBox.classList.contains('hidden')) {
          advanceToNextRound();
        } else if (lockContainer && !lockContainer.classList.contains('hidden')) {
          lockCurrentAnswer();
        }
      }
    });

    // Timeline RAF Updater
    function updateLoop() {
      if (state.audioEngine && state.audioEngine.isPlaying) {
        updateTimelineUI();
      }
      requestAnimationFrame(updateLoop);
    }
    requestAnimationFrame(updateLoop);
  }

  // ==========================================
  // 9. APP INITIALIZATION
  // ==========================================
  async function initApp() {
    // Theme setup from storage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      state.isDarkTheme = false;
      document.documentElement.classList.remove('dark');
    } else {
      state.isDarkTheme = true;
      document.documentElement.classList.add('dark');
    }

    state.audioEngine = new AudioEngine();

    if (window.SONG_CATALOG && Array.isArray(window.SONG_CATALOG)) {
      state.catalog = window.SONG_CATALOG;
    } else {
      try {
        const res = await fetch('songs.json');
        state.catalog = await res.json();
      } catch (err) {
        console.error('Failed to load songs catalog:', err);
      }
    }

    console.log(`Golden Ears loaded with ${state.catalog.length} songs.`);
    const catalogCountBadge = document.getElementById('catalog-count-badge');
    if (catalogCountBadge && state.catalog.length > 0) {
      catalogCountBadge.textContent = `${state.catalog.length} lagu`;
    }
    initEvents();

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
