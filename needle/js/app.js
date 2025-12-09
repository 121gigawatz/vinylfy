/**
 * Main Application Logic for Vinylfy
 */

import versionLoader from './version.js';
import api from './api.js';
import AudioPlayer from './audio-player.js';
import {
  formatFileSize,
  isValidAudioFile,
  showToast,
  storage,
  validateSettings,
  formatPresetName,
  parseErrorMessage,
  isPWAInstalled
} from './utils.js';
import {
  extractMetadata,
  writeMetadata,
  getEmptyMetadata,
  supportsMetadataWriting
} from './metadata.js';

class VinylApp {
  constructor() {
    this.selectedFile = null;
    this.processedFileId = null;
    this.currentPreset = 'AJW Recommended';
    this.audioPlayer = null;
    this.presets = {};
    this.customSettings = this.getDefaultCustomSettings();
    this.isLoadingPreset = false; // Flag to prevent auto-switching to custom during preset load
    this.appVersion = versionLoader.getVersion(); // Load from VERSION file
    this.fileTTL = 1; // Default, will be updated from API
    this.maxUploadMB = 25; // Default, will be updated from API

    // Metadata handling
    this.originalMetadata = null;
    this.editedMetadata = null;
    this.isMetadataEditMode = false;
    this.uploadedArtwork = null;

    // Cache update modal flag (session-based)
    this.cacheModalDismissed = sessionStorage.getItem('cacheModalDismissed') === 'true';

    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    console.log('🎵 Vinylfy initializing...');

    // Wait for version to load (happens in background on import)
    this.appVersion = await versionLoader.waitForLoad();
    console.log(`📦 App version: ${this.appVersion}`);

    // Check for version mismatch and show modal if needed
    await this.checkCacheVersion();

    // Check for version change and clear old data
    await this.checkVersionAndCleanup();

    // Clear old caches on startup
    await this.clearOldCaches();

    // Check API health
    await this.checkAPIHealth();

    // Load presets and formats
    await this.loadPresets();

    // Setup UI
    this.setupFileUpload();
    this.setupPresetCards(); // Wire up preset card clicks
    this.setupCustomControls();
    this.setupLEDIndicators(); // Setup LED indicators for toggle switches
    this.setupProcessButton();
    this.setupThemeToggle();
    this.setupGitHubStars();
    this.setupMetadataModal();
    this.setupMetadataModal();

    // Wire up Metadata Button in Console
    const metadataBtn = document.getElementById('metadataBtn');
    if (metadataBtn) {
      metadataBtn.addEventListener('click', () => {
        this.openMetadataModal();
      });
    }

    // Initialize audio player
    this.audioPlayer = new AudioPlayer('audioPlayerContainer');
    this.audioPlayer.hide();

    // Setup PWA
    this.setupPWA();

    // Set Model Number
    const modelNumberEl = document.getElementById('modelNumber');
    if (modelNumberEl) {
      modelNumberEl.textContent = `Model No. ${this.appVersion}`;
    }

    // Set Manufacturing Date
    this.setManufacturingDate();

    // Load saved preferences
    this.loadPreferences();



    console.log('✅ Vinylfy ready!');
  }

  /**
   * Check if app version has changed and cleanup if needed
   */
  async checkVersionAndCleanup() {
    try {
      const storedVersion = localStorage.getItem('vinylfy_version');
      const currentVersion = this.appVersion;

      if (storedVersion && storedVersion !== currentVersion) {
        console.log(`🔄 Version change detected: ${storedVersion} → ${currentVersion}`);
        console.log('🧹 Clearing all caches and storage...');

        // Clear all caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          console.log('✅ All caches cleared');
        }

        // Unregister all service workers
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(reg => reg.unregister()));
          console.log('✅ All service workers unregistered');
        }

        // Clear localStorage (except the version we're about to set)
        const itemsToKeep = ['vinylfy_preferences']; // Keep user preferences
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(key => {
          if (key.startsWith('vinylfy_') && !itemsToKeep.includes(key)) {
            localStorage.removeItem(key);
          }
        });

        // Update stored version
        localStorage.setItem('vinylfy_version', currentVersion);
        console.log('✅ Version updated, reloading page...');

        // Force a hard reload to get fresh assets
        window.location.reload(true);
        return;
      }

      // Store version if not present
      if (!storedVersion) {
        localStorage.setItem('vinylfy_version', currentVersion);
        console.log(`✅ Version stored: ${currentVersion}`);
      }
    } catch (error) {
      console.warn('Version check failed (non-critical):', error);
    }
  }

  /**
   * Check for cache version mismatch and show modal
   */
  async checkCacheVersion() {
    try {
      // Don't show modal if already dismissed this session
      if (this.cacheModalDismissed) {
        console.log('ℹ️ Cache modal already dismissed this session');
        return;
      }

      // Get API version
      const health = await api.checkHealth();
      const serverVersion = health.version || 'unknown';
      const clientVersion = this.appVersion;

      // Check if versions match
      if (serverVersion !== clientVersion && serverVersion !== 'unknown') {
        console.warn(`⚠️ Version mismatch detected!`);
        console.warn(`Client: ${clientVersion}, Server: ${serverVersion}`);
        // Modal removed as per request
      }
    } catch (error) {
      console.warn('Could not check cache version:', error);
    }
  }



  /**
   * Set manufacturing date from release notes
   */
  async setManufacturingDate() {
    const mfgDateEl = document.getElementById('mfgDate');
    if (!mfgDateEl) return;

    try {
      const response = await fetch('/release-notes.json');
      if (!response.ok) return;

      const releaseNotes = await response.json();
      const currentVersionData = releaseNotes[this.appVersion];

      if (currentVersionData && currentVersionData.date) {
        mfgDateEl.textContent = `MFG ${currentVersionData.date}`;
      } else {
        // Fallback if date not found for current version
        mfgDateEl.textContent = 'MFG UNKNOWN';
      }
    } catch (error) {
      console.warn('Failed to load manufacturing date:', error);
      mfgDateEl.textContent = '';
    }
  }

  /**
   * Load and display release notes for all versions between cached and latest
   */
  async loadReleaseNotes(cachedVersion, latestVersion) {
    const releaseNotesSection = document.getElementById('releaseNotesSection');
    const releaseNotesContent = document.getElementById('releaseNotesContent');

    try {
      // Fetch release notes
      const response = await fetch('/release-notes.json');
      if (!response.ok) {
        throw new Error('Failed to fetch release notes');
      }

      const releaseNotes = await response.json();
      const allVersions = Object.keys(releaseNotes);

      // Find all versions between cached and latest (inclusive of latest)
      const versionsToShow = [];
      let foundLatest = false;

      for (const version of allVersions) {
        if (version === latestVersion) {
          foundLatest = true;
          versionsToShow.push(version);
        } else if (foundLatest) {
          versionsToShow.push(version);
          // Stop when we reach the cached version
          if (version === cachedVersion) {
            break;
          }
        }
      }

      // If we only found the latest version (same as cached), just show latest
      if (versionsToShow.length === 0 && releaseNotes[latestVersion]) {
        versionsToShow.push(latestVersion);
      }

      if (versionsToShow.length > 0) {
        let html = '';

        // Show each version's notes
        versionsToShow.forEach((version, index) => {
          const versionNotes = releaseNotes[version];
          if (!versionNotes) return;

          // Add version header
          if (versionsToShow.length > 1) {
            html += `<div style="margin-bottom: var(--space-md); ${index > 0 ? 'margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid var(--color-border);' : ''}">`;
            html += `<h4 style="color: var(--color-primary); margin-bottom: var(--space-sm); font-size: var(--font-size-md);">${version}</h4>`;
          }

          // Add highlights
          if (versionNotes.highlights && versionNotes.highlights.length > 0) {
            html += '<div style="margin-bottom: var(--space-sm);">';
            html += '<strong style="color: var(--color-primary); font-size: var(--font-size-sm);">✨ Highlights:</strong>';
            html += '<ul style="margin: var(--space-xs) 0 0 0; padding-left: var(--space-lg); font-size: var(--font-size-sm);">';
            versionNotes.highlights.forEach(item => {
              html += `<li style="margin-bottom: var(--space-xs); color: var(--color-text-primary);">${item}</li>`;
            });
            html += '</ul></div>';
          }

          // Add bug fixes
          if (versionNotes.bugfixes && versionNotes.bugfixes.length > 0) {
            html += '<div style="margin-bottom: var(--space-sm);">';
            html += '<strong style="color: var(--color-primary); font-size: var(--font-size-sm);">🐛 Bug Fixes:</strong>';
            html += '<ul style="margin: var(--space-xs) 0 0 0; padding-left: var(--space-lg); font-size: var(--font-size-sm);">';
            versionNotes.bugfixes.forEach(item => {
              html += `<li style="margin-bottom: var(--space-xs); color: var(--color-text-secondary);">${item}</li>`;
            });
            html += '</ul></div>';
          }

          // Add improvements
          if (versionNotes.improvements && versionNotes.improvements.length > 0) {
            html += '<div style="margin-bottom: var(--space-sm);">';
            html += '<strong style="color: var(--color-primary); font-size: var(--font-size-sm);">⚡ Improvements:</strong>';
            html += '<ul style="margin: var(--space-xs) 0 0 0; padding-left: var(--space-lg); font-size: var(--font-size-sm);">';
            versionNotes.improvements.forEach(item => {
              html += `<li style="margin-bottom: var(--space-xs); color: var(--color-text-secondary);">${item}</li>`;
            });
            html += '</ul></div>';
          }

          if (versionsToShow.length > 1) {
            html += '</div>';
          }
        });

        // Update content and show section
        releaseNotesContent.innerHTML = html;
        releaseNotesSection.style.display = 'block';
      } else {
        // No release notes found
        releaseNotesSection.style.display = 'none';
      }
    } catch (error) {
      console.warn('Could not load release notes:', error);
      // Hide section if there's an error
      releaseNotesSection.style.display = 'none';
    }
  }

  /**
   * Clear all caches and service workers
   */
  async clearAllCaches() {
    try {
      console.log('🧹 Clearing all caches...');

      // Clear all browser caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('✅ All caches cleared');
      }

      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
        console.log('✅ All service workers unregistered');
      }

      // Clear localStorage version to trigger fresh version check
      localStorage.removeItem('vinylfy_version');

      console.log('✅ Cache clearing complete!');
    } catch (error) {
      console.error('Error clearing caches:', error);
    }
  }

  /**
   * Check if API is available
   */
  async checkAPIHealth() {
    const healthStatus = document.getElementById('healthStatus');

    try {
      const health = await api.checkHealth();
      if (health.healthy) {
        // Update turntable animation
        const turntableUnit = document.querySelector('.turntable-unit');
        const turntablePlatter = document.querySelector('.turntable-platter');
        const turntableLight = document.querySelector('.turntable-light');

        if (turntableUnit && turntablePlatter && turntableLight) {
          turntableUnit.classList.add('playing');
          turntablePlatter.classList.add('spinning');
          turntableLight.classList.remove('status-red');
          turntableLight.classList.add('status-green');

          // Update title for accessibility
          if (healthStatus) {
            healthStatus.setAttribute('title', 'Turntable Spinning');
            healthStatus.setAttribute('aria-label', 'Turntable Spinning');
          }
        }

        // Update app info from API
        if (health.config) {
          this.fileTTL = health.config.file_ttl_hours || 1;
          this.maxUploadMB = health.config.max_upload_mb || 25;
        }

        // Update footer with version and TTL
        this.updateFooterInfo();

        // Update file upload hint with max size
        this.updateFileUploadHint();
      } else {
        throw new Error('API unhealthy');
      }
    } catch (error) {
      // Update turntable animation for stopped state
      const turntableUnit = document.querySelector('.turntable-unit');
      const turntablePlatter = document.querySelector('.turntable-platter');
      const turntableLight = document.querySelector('.turntable-light');

      if (turntableUnit && turntablePlatter && turntableLight) {
        turntableUnit.classList.remove('playing');
        turntablePlatter.classList.remove('spinning');
        turntableLight.classList.remove('status-green');
        turntableLight.classList.add('status-red');

        // Update title for accessibility
        if (healthStatus) {
          healthStatus.setAttribute('title', 'Turntable Stopped');
          healthStatus.setAttribute('aria-label', 'Turntable Stopped');
        }
      }
      showToast('Cannot connect to server. Please check if the table is running.', 'error', 5000);

      // Still update footer and upload hint with defaults
      this.updateFooterInfo();
      this.updateFileUploadHint();
    }
  }

  /**
   * Clear old browser caches to ensure fresh assets
   */
  async clearOldCaches() {
    try {
      const currentVersion = 'beta4.1.1';

      // Clear browser caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name =>
          !name.includes(currentVersion) && (name.includes('vinylfy') || name.includes('runtime'))
        );

        if (oldCaches.length > 0) {
          console.log(`🧹 Found ${oldCaches.length} old cache(s) to clear`);
          for (const cacheName of oldCaches) {
            console.log('🧹 Clearing old cache:', cacheName);
            await caches.delete(cacheName);
          }
        }
      }

      // Unregister old service workers and force update
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();

        for (const registration of registrations) {
          // Check if service worker has the current version
          const hasCurrentVersion = await this.checkServiceWorkerVersion(registration, currentVersion);

          if (!hasCurrentVersion) {
            console.log('🔄 Unregistering outdated service worker...');
            await registration.unregister();
            console.log('✅ Old service worker unregistered');
          } else if (registration.waiting) {
            // If there's a new SW waiting, activate it immediately
            console.log('🔄 Activating waiting service worker...');
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });

            // Reload page once new SW is activated
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              console.log('🔄 Service worker updated, reloading page...');
              window.location.reload();
            }, { once: true });
          }
        }
      }
    } catch (error) {
      console.warn('Cache clearing failed (non-critical):', error);
    }
  }

  /**
   * Check if service worker has current version by checking cache names
   */
  async checkServiceWorkerVersion(registration, currentVersion) {
    try {
      // Get all cache names
      const cacheNames = await caches.keys();

      // Check if any cache with the current version exists
      const hasCurrentCache = cacheNames.some(name =>
        name.includes(currentVersion) && (name.includes('vinylfy') || name.includes('runtime'))
      );

      return hasCurrentCache;
    } catch (error) {
      console.warn('Version check failed:', error);
      return false; // Default to unregister if we can't check
    }
  }

  /**
   * Update footer with app version and file TTL info
   */
  updateFooterInfo() {
    // Update version
    const versionElement = document.getElementById('appVersion');
    if (versionElement) {
      versionElement.textContent = `Version: ${this.appVersion}`;
    }

    // Update TTL message
    const ttlElement = document.getElementById('fileTTL');
    if (ttlElement) {
      const ttlText = this.fileTTL === 1
        ? '1 hour'
        : `${this.fileTTL} hours`;
      ttlElement.textContent = `Files auto-delete after ${ttlText}`;
    }
  }

  /**
   * Update file upload hint with max file size from API
   */
  updateFileUploadHint() {
    const hintElement = document.getElementById('fileUploadHint');
    if (hintElement) {
      hintElement.textContent = `Supports: WAV, MP3, FLAC, OGG, M4A, AAC (Max ${this.maxUploadMB}MB)`;
    }
  }

  /**
   * Load presets from API
   */
  async loadPresets() {
    try {
      const data = await api.getPresets();
      this.presets = data.presets;
      this.populatePresetSelector();

      // Auto-select and load the default preset (AJW Recommended)
      this.selectDefaultPreset();
    } catch (error) {
      console.error('Failed to load presets:', error);
      showToast('Failed to load presets', 'error');
    }
  }

  /**
   * Select and load the default preset on startup
   */
  selectDefaultPreset() {
    // Find the AJW Recommended preset card
    const presetCards = document.querySelectorAll('.preset-card');
    const defaultCard = Array.from(presetCards).find(card =>
      card.dataset.preset === 'AJW Recommended'
    );

    if (defaultCard) {
      // Add visual selection
      defaultCard.classList.add('selected');
      console.log('📻 Auto-selected default preset: AJW Recommended');

      // Load the preset values
      this.loadPresetValues('AJW Recommended');
    } else {
      console.warn('⚠️ Default preset card not found');
    }
  }

  /**
   * Setup preset card click handlers
   */
  setupPresetCards() {
    const presetCards = document.querySelectorAll('.preset-card');

    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        const presetName = card.dataset.preset;

        if (!presetName) {
          console.warn('⚠️ Preset card missing data-preset attribute');
          return;
        }

        // Remove selection from all cards
        presetCards.forEach(c => c.classList.remove('selected'));

        // Select this card
        card.classList.add('selected');

        // Handle custom vs named preset
        if (presetName.toLowerCase() === 'custom') {
          // Switch to custom mode but keep current values
          this.currentPreset = 'custom';
          console.log('📻 Switched to Custom mode');
        } else {
          // Load the preset values
          this.currentPreset = presetName;
          this.loadPresetValues(presetName);
        }
      });
    });

    console.log(`✅ Setup ${presetCards.length} preset cards`);
  }

  /**
   * Setup file upload
   */
  /**
   * Setup file upload
   */
  setupFileUpload() {
    const fileInput = document.getElementById('audioFile');
    const consoleDisplay = document.getElementById('consoleDisplay');

    // Click to upload
    consoleDisplay.addEventListener('click', (e) => {
      // Don't trigger if clicking on the file input itself (bubbling)
      if (e.target !== fileInput) {
        // Safari requires the click to be directly on the input or triggered closely
        // Sometimes display:none inhibits this.
        fileInput.click();
      }
    });

    // Keyboard support
    consoleDisplay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleFileSelect(file);
      }
      // Reset value to allow selecting the same file again
      fileInput.value = '';
    });

    // Drag and drop
    consoleDisplay.addEventListener('dragover', (e) => {
      e.preventDefault();
      consoleDisplay.classList.add('drag-over');
      consoleDisplay.style.borderColor = 'var(--color-primary)';
    });

    consoleDisplay.addEventListener('dragleave', () => {
      consoleDisplay.classList.remove('drag-over');
      consoleDisplay.style.borderColor = '';
    });

    consoleDisplay.addEventListener('drop', (e) => {
      e.preventDefault();
      consoleDisplay.classList.remove('drag-over');
      consoleDisplay.style.borderColor = '';

      const file = e.dataTransfer.files[0];
      if (file) {
        this.handleFileSelect(file);
      }
    });
  }

  /**
   * Handle file selection
   */
  async handleFileSelect(file) {
    if (!isValidAudioFile(file)) {
      showToast('Invalid file type. Please select an audio file.', 'error');
      return;
    }

    this.selectedFile = file;
    this.processedFileId = null; // Clear previous result ID

    // Reset Process Button
    const processBtn = document.getElementById('processBtn');
    if (processBtn) {
      processBtn.innerHTML = '<span class="btn-text">START</span>';
      processBtn.disabled = false;
      processBtn.classList.add('active');
    }

    // Update Console Display
    const display = document.getElementById('consoleDisplay');
    if (!display) {
      console.warn('⚠️ consoleDisplay element not found');
      showToast(`File selected: ${file.name}`, 'success');
      return;
    }

    const defaultState = display.querySelector('.default-state');
    const loadedState = display.querySelector('.loaded-state');
    const processingState = display.querySelector('.processing-state');

    const displayFilename = document.getElementById('displayFilename');
    const displayFormat = document.getElementById('displayFormat');
    const displaySize = document.getElementById('displaySize');

    // Simplified UI - no states, just update display
    if (!displayFilename || !defaultState) {
      console.log(`📁 File selected: ${file.name} (${formatFileSize(file.size)})`);
      display.innerHTML = `
        <p style="font-size: 2rem;">✅</p>
        <p style="margin: var(--space-md) 0; color: var(--color-text-primary);"><strong>${file.name}</strong></p>
        <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">${formatFileSize(file.size)} • ${file.type.split('/')[1]?.toUpperCase() || 'AUDIO'}</p>
      `;
      showToast(`File selected: ${file.name}`, 'success');
      return;
    }

    // Full UI - Update Filename with Marquee support
    displayFilename.innerHTML = ''; // Clear previous content
    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name;
    displayFilename.appendChild(nameSpan);
    displayFilename.classList.remove('scrolling'); // Reset scrolling state

    // Check for overflow after a brief delay to allow rendering
    setTimeout(() => {
      const container = displayFilename.parentElement;
      if (displayFilename.scrollWidth > container.clientWidth) {
        // Needs scrolling - duplicate content for seamless loop
        const duplicateSpan = document.createElement('span');
        duplicateSpan.textContent = file.name;
        displayFilename.appendChild(duplicateSpan);
        displayFilename.classList.add('scrolling');
      }
    }, 50);

    if (displaySize) displaySize.textContent = formatFileSize(file.size);
    if (displayFormat) displayFormat.textContent = file.type.split('/')[1].toUpperCase();

    if (defaultState) defaultState.classList.add('hidden');
    if (processingState) processingState.classList.add('hidden');
    if (loadedState) loadedState.classList.remove('hidden');

    // Reset metadata when new file is selected
    this.originalMetadata = null;
    this.editedMetadata = null;
    this.uploadedArtwork = null;

    // Quick DRM check
    await this.checkFileDRM(file);

    document.getElementById('processBtn').disabled = false;

    showToast('Record loaded!', 'success');
  }

  /**
   * Check if file has DRM protection (quick check on upload)
   */
  async checkFileDRM(file) {
    try {
      const result = await api.checkDRM(file);

      if (result.has_drm) {
        this.showDRMWarning(result.drm_type, result.filename);
      } else {
        this.hideDRMWarning();
      }
    } catch (error) {
      console.error('DRM check failed:', error);
      // Don't block on check failure - let deep check handle it
    }
  }

  /**
   * Show DRM warning banner
   */
  showDRMWarning(drmType, filename) {
    const warningHtml = `
      <div id="drmWarning" class="alert alert-warning" style="margin-top: var(--space-md);">
        <strong>⚠️ DRM Protection Detected</strong><br>
        This file appears to be protected by <strong>${drmType}</strong>.<br>
        <span style="font-size: var(--font-size-sm);">
          Processing will likely fail. Please use audio files you own (not from streaming subscriptions).
        </span>
      </div>
    `;

    // Insert warning after file info
    const fileInfo = document.getElementById('fileInfo');
    const existing = document.getElementById('drmWarning');
    if (existing) existing.remove();

    fileInfo.insertAdjacentHTML('afterend', warningHtml);
  }

  /**
   * Hide DRM warning banner
   */
  hideDRMWarning() {
    const warning = document.getElementById('drmWarning');
    if (warning) warning.remove();
  }

  /**
   * Show DRM error in processing indicator
   */
  showDRMError(message) {
    const indicator = document.getElementById('processingIndicator');
    indicator.innerHTML = `
      <div class="card card-elevated text-center">
        <div style="color: var(--color-danger); margin-bottom: var(--space-md);">
          <span style="font-size: 48px;">🔒</span>
        </div>
        <h3 style="color: var(--color-danger); margin-bottom: var(--space-md);">
          DRM-Protected File Detected
        </h3>
        <p style="margin-bottom: var(--space-md); color: var(--color-text-primary);">
          This audio file is protected by Digital Rights Management (DRM) and cannot be processed.
        </p>
        <div class="alert alert-info" style="text-align: left;">
          <strong>What is DRM?</strong><br>
          DRM protects subscription-based music (Apple Music, Spotify, etc.) from being copied or modified.
          <br><br>
          <strong>Solution:</strong><br>
          Please use audio files you own, such as:
          <ul style="margin: var(--space-sm) 0 0 var(--space-md);">
            <li>Files purchased from iTunes (not Apple Music subscription)</li>
            <li>CDs ripped to your computer</li>
            <li>Files from Bandcamp, Amazon Music purchases, etc.</li>
          </ul>
        </div>
        <button class="btn btn-primary" onclick="location.reload()">
          Try Another File
        </button>
      </div>
    `;
  }

  /**
   * Setup preset selector
   */
  setupPresetSelector() {
    const presetSelector = document.getElementById('presetSelector');

    if (!presetSelector) {
      console.log('ℹ️ Using preset cards (no dropdown selector)');
      return;
    }

    presetSelector.addEventListener('change', (e) => {
      this.currentPreset = e.target.value;
      this.loadPresetValues(e.target.value);
      this.updateCustomControlsVisibility();
      this.savePreferences();
    });
  }

  /**
   * Populate preset selector (simplified for card-based UI)
   */
  populatePresetSelector() {
    // Presets are loaded from API and stored in this.presets
    // UI uses static preset cards in HTML, no dynamic population needed
    const presetCount = Object.keys(this.presets).length;
    console.log(`📻 ${presetCount} presets loaded from API`);
  }

  /**
   * Select a preset from the shelf
   */
  selectPreset(presetName) {
    this.currentPreset = presetName;

    // Update dropdown
    const presetSelector = document.getElementById('presetSelector');
    if (presetSelector) presetSelector.value = presetName;

    // Update shelf active state
    const albums = document.querySelectorAll('.preset-album');
    albums.forEach(album => {
      if (album.dataset.preset === presetName) {
        album.classList.add('active');
      } else {
        album.classList.remove('active');
      }
    });

    this.loadPresetValues(presetName);
    this.updateCustomControlsVisibility();
    this.savePreferences();
  }

  /**
   * Load preset values into UI controls
   */
  loadPresetValues(presetName) {
    if (!this.presets[presetName]) {
      console.warn(`Preset ${presetName} not found`);
      return;
    }

    const preset = this.presets[presetName];
    console.log(`📻 Loading preset: ${presetName}`, preset);

    // Set flag to prevent auto-switching to custom
    this.isLoadingPreset = true;

    // Update custom settings from preset
    this.customSettings = { ...preset };

    // Update UI controls to reflect preset values
    this.updateCustomControlValues();

    // Reset flag
    this.isLoadingPreset = false;

    console.log(`✅ Preset loaded. EQ values: Bass=${preset.bass || 0}, Mid=${preset.mid || 0}, Treble=${preset.treble || 0}`);
  }

  /**
   * Update metadata button state
   */
  updateMetadataButtonState() {
    const metadataBtn = document.getElementById('metadataBtn');
    if (!metadataBtn) return;

    // Metadata is now always available since we generate all formats
    metadataBtn.disabled = false;
    metadataBtn.title = 'View and edit audio metadata';
  }


  /**
   * Setup custom controls
   */
  setupCustomControls() {
    console.log('⚙️ Setting up custom controls...');

    // RIAA Button
    const riaaBtn = document.getElementById('riaaBtn');
    if (riaaBtn) {
      riaaBtn.addEventListener('click', () => {
        this.customSettings.frequency_response = !this.customSettings.frequency_response;
        // Update UI
        if (this.customSettings.frequency_response) {
          riaaBtn.classList.add('active');
        } else {
          riaaBtn.classList.remove('active');
        }
        riaaBtn.setAttribute('aria-pressed', this.customSettings.frequency_response);
        this.switchToCustomPreset();
      });
    }

    // Surface noise intensity
    const noiseIntensity = document.getElementById('noiseIntensity');
    const noiseIntensityValue = document.getElementById('noiseIntensityValue');

    if (noiseIntensity && noiseIntensityValue) {
      noiseIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.noise_intensity = value;
        const valueText = value.toFixed(3);
        noiseIntensityValue.textContent = valueText;
        // Update ARIA attributes
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Pop intensity slider
    const popIntensity = document.getElementById('popIntensity');
    const popIntensityValue = document.getElementById('popIntensityValue');

    if (popIntensity && popIntensityValue) {
      popIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.pop_intensity = value;
        const valueText = value.toFixed(2);
        popIntensityValue.textContent = valueText;
        // Update ARIA attributes
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Wow/Flutter intensity
    const wowFlutterIntensity = document.getElementById('wowFlutterIntensity');
    const wowFlutterValue = document.getElementById('wowFlutterValue');

    if (wowFlutterIntensity && wowFlutterValue) {
      wowFlutterIntensity.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.wow_flutter_intensity = value;
        const valueText = value.toFixed(4);
        wowFlutterValue.textContent = valueText;
        // Update ARIA attributes
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Harmonic distortion amount
    const distortionAmount = document.getElementById('distortionAmount');
    const distortionValue = document.getElementById('distortionValue');

    if (distortionAmount && distortionValue) {
      distortionAmount.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.distortion_amount = value;
        const valueText = value.toFixed(2);
        distortionValue.textContent = valueText;
        // Update ARIA attributes
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Stereo width
    const stereoWidth = document.getElementById('stereoWidth');
    const stereoWidthValue = document.getElementById('stereoWidthValue');

    if (stereoWidth && stereoWidthValue) {
      stereoWidth.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.stereo_width = value;
        const valueText = value.toFixed(2);
        stereoWidthValue.textContent = valueText;
        // Update ARIA attributes
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Bass EQ
    const bassSlider = document.getElementById('bass');
    const bassValue = document.getElementById('bassValue');

    if (bassSlider && bassValue) {
      bassSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.bass = value;
        const valueText = `${value.toFixed(1)} dB`;
        bassValue.textContent = valueText;
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Mid EQ
    const midSlider = document.getElementById('mid');
    const midValue = document.getElementById('midValue');

    if (midSlider && midValue) {
      midSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.mid = value;
        const valueText = `${value.toFixed(1)} dB`;
        midValue.textContent = valueText;
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Treble EQ
    const trebleSlider = document.getElementById('treble');
    const trebleValue = document.getElementById('trebleValue');

    if (trebleSlider && trebleValue) {
      trebleSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.customSettings.treble = value;
        const valueText = `${value.toFixed(1)} dB`;
        trebleValue.textContent = valueText;
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    console.log('✅ Custom controls setup complete');

    // High-Pass Filter
    const hpfCutoff = document.getElementById('hpfCutoff');
    const hpfCutoffValue = document.getElementById('hpfCutoffValue');

    if (hpfCutoff && hpfCutoffValue) {
      hpfCutoff.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        this.customSettings.hpf_cutoff = value;
        const valueText = this.formatFrequency(value);
        hpfCutoffValue.textContent = valueText;
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }

    // Low-Pass Filter
    const lpfCutoff = document.getElementById('lpfCutoff');
    const lpfCutoffValue = document.getElementById('lpfCutoffValue');

    if (lpfCutoff && lpfCutoffValue) {
      lpfCutoff.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        this.customSettings.lpf_cutoff = value;
        const valueText = this.formatFrequency(value);
        lpfCutoffValue.textContent = valueText;
        e.target.setAttribute('aria-valuenow', value);
        e.target.setAttribute('aria-valuetext', valueText);
        this.switchToCustomPreset();
      });
    }
  }

  /**
   * Setup LED indicators for toggle switches
   */
  setupLEDIndicators() {
    // Get all LED elements
    const leds = document.querySelectorAll('.switch-led');
    console.log('💡 Setting up LED indicators, found:', leds.length);

    leds.forEach(led => {
      const switchId = led.dataset.switch;
      const switchElement = document.getElementById(switchId);

      console.log(`💡 LED for ${switchId}:`, { led, switchElement, checked: switchElement?.checked });

      if (switchElement) {
        // Set initial state
        this.updateLEDState(led, switchElement.checked);

        // Listen for changes
        switchElement.addEventListener('change', (e) => {
          console.log(`💡 ${switchId} changed to:`, e.target.checked);
          this.updateLEDState(led, e.target.checked);
        });
      } else {
        console.error(`❌ Switch element not found for LED: ${switchId}`);
      }
    });
  }

  /**
   * Update LED state based on toggle state
   */
  updateLEDState(led, isOn) {
    console.log('💡 Updating LED state:', { led, isOn, currentClasses: led.className });
    if (isOn) {
      led.classList.add('active');
    } else {
      led.classList.remove('active');
    }
    console.log('💡 LED classes after update:', led.className);
  }

  /**
   * Switch to custom preset when user changes any setting
   */
  switchToCustomPreset() {
    // Don't switch to custom if we're loading a preset
    if (this.isLoadingPreset) {
      return;
    }

    const presetSelector = document.getElementById('presetSelector');
    if (presetSelector && this.currentPreset !== 'custom') {
      this.currentPreset = 'custom';
      presetSelector.value = 'custom';
      this.savePreferences();
    }
  }

  /**
   * Update custom controls visibility
   * Note: Custom controls are now always visible
   */
  updateCustomControlsVisibility() {
    // Custom controls are now always shown
    // This method is kept for backwards compatibility but does nothing
  }

  /**
   * Setup process button
   */
  setupProcessButton() {
    const processBtn = document.getElementById('processBtn');

    if (!processBtn) {
      console.warn('⚠️ Process button not found, skipping setup');
      return;
    }

    processBtn.onclick = () => {
      this.processAudio();
    };
  }

  /**
   * Setup theme toggle
   */
  setupThemeToggle() {
    const themeButtons = document.querySelectorAll('.theme-toggle-btn');

    // Load saved theme or default to 'auto'
    const savedTheme = localStorage.getItem('theme') || 'auto';
    this.applyTheme(savedTheme);

    // Setup click handlers
    themeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        this.applyTheme(theme);
        localStorage.setItem('theme', theme);
      });
    });
  }

  /**
   * Apply theme
   */
  applyTheme(theme) {
    const html = document.documentElement;
    const themeButtons = document.querySelectorAll('.theme-toggle-btn');

    if (theme === 'auto') {
      // Use browser/OS preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      html.setAttribute('data-theme', theme);
    }

    // Update active state
    themeButtons.forEach(btn => {
      if (btn.dataset.theme === theme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Setup GitHub stars
   */
  setupGitHubStars() {
    // Extract repo info from the link's href attribute
    const githubLink = document.getElementById('githubLink');
    if (!githubLink) return;

    const href = githubLink.getAttribute('href');
    const match = href.match(/github\.com\/([^\/]+)\/([^\/]+)/);

    if (!match) {
      console.warn('Could not parse GitHub repo from URL');
      return;
    }

    const [, owner, repo] = match;
    this.fetchGitHubStars(owner, repo);
  }

  /**
   * Fetch GitHub stars count
   */
  async fetchGitHubStars(owner, repo) {
    const starNumber = document.getElementById('starNumber');

    // If element doesn't exist, skip (simplified UI)
    if (!starNumber) {
      return;
    }

    try {
      // Check cache first (cache for 1 hour)
      const cacheKey = `github_stars_${owner}_${repo}`;
      const cached = localStorage.getItem(cacheKey);
      const cacheTime = localStorage.getItem(`${cacheKey}_time`);

      if (cached && cacheTime) {
        const age = Date.now() - parseInt(cacheTime);
        if (age < 3600000) { // 1 hour
          starNumber.textContent = this.formatStarCount(parseInt(cached));
          return;
        }
      }

      // Fetch from GitHub API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const data = await response.json();
      const stars = data.stargazers_count;

      // Update UI
      starNumber.textContent = this.formatStarCount(stars);

      // Cache the result
      localStorage.setItem(cacheKey, stars.toString());
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());

    } catch (error) {
      console.warn('Failed to fetch GitHub stars:', error);
      starNumber.textContent = '—';
    }
  }

  /**
   * Format star count for display
   */
  formatStarCount(count) {
    if (count >= 1000) {
      return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return count.toString();
  }

  /**
   * Format frequency for display (Hz or kHz)
   */
  formatFrequency(hz) {
    if (hz >= 1000) {
      return `${(hz / 1000).toFixed(1).replace(/\.0$/, '')} kHz`;
    }
    return `${hz} Hz`;
  }

  /**
   * Setup metadata modal
   */
  setupMetadataModal() {
    const metadataBtn = document.getElementById('metadataBtn');
    const metadataModal = document.getElementById('metadataModal');
    const closeMetadataModal = document.getElementById('closeMetadataModal');
    const editMetadataBtn = document.getElementById('editMetadataBtn');
    const saveMetadataBtn = document.getElementById('saveMetadataBtn');
    const discardMetadataBtn = document.getElementById('discardMetadataBtn');
    const artworkFile = document.getElementById('artworkFile');
    const removeArtwork = document.getElementById('removeArtwork');

    // Open modal
    if (metadataBtn) {
      metadataBtn.addEventListener('click', async () => {
        await this.openMetadataModal();
        if (metadataModal) this.trapFocus(metadataModal);
      });
    }

    // Close modal
    if (closeMetadataModal) {
      closeMetadataModal.addEventListener('click', () => {
        if (metadataModal) metadataModal.classList.add('hidden');
        this.resetMetadataEditMode();
      });
    }

    // Close on overlay click
    if (metadataModal) {
      const modalOverlay = metadataModal.querySelector('.modal-overlay');
      if (modalOverlay) {
        modalOverlay.addEventListener('click', () => {
          metadataModal.classList.add('hidden');
          this.resetMetadataEditMode();
        });
      }
    }

    // Edit metadata button
    if (editMetadataBtn) {
      editMetadataBtn.addEventListener('click', () => {
        this.enableMetadataEditMode();
      });
    }

    // Save metadata button
    if (saveMetadataBtn) {
      saveMetadataBtn.addEventListener('click', () => {
        this.saveMetadataChanges();
      });
    }

    // Discard metadata button
    if (discardMetadataBtn) {
      discardMetadataBtn.addEventListener('click', () => {
        // Reset to original metadata without saving
        this.editedMetadata = { ...this.originalMetadata };
        this.uploadedArtwork = null;
        this.populateMetadataModal();
        this.resetMetadataEditMode();
        showToast('Changes discarded', 'info');
      });
    }

    // Artwork upload
    if (artworkFile) {
      artworkFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.handleArtworkUpload(file);
        }
      });
    }

    // Remove artwork
    if (removeArtwork) {
      removeArtwork.addEventListener('click', () => {
        this.uploadedArtwork = null;
        const artworkPreview = document.getElementById('artworkPreview');
        if (artworkPreview) artworkPreview.classList.add('hidden');
        if (artworkFile) artworkFile.value = '';

        // Show upload button
        const fileUpload = document.querySelector('.file-upload');
        if (fileUpload) fileUpload.classList.remove('hidden');
      });
    }
  }

  /**
   * Open metadata modal and load metadata from uploaded file
   */
  async openMetadataModal() {
    const metadataModal = document.getElementById('metadataModal');
    const metadataNotice = document.getElementById('metadataNotice');

    // Check if output format is MP3
    if (!supportsMetadataWriting(this.outputFormat)) {
      metadataNotice.classList.remove('hidden');
    } else {
      metadataNotice.classList.add('hidden');
    }

    // Extract metadata from uploaded file if we haven't already
    if (!this.originalMetadata && this.selectedFile) {
      try {
        showToast('Extracting metadata...', 'info');
        this.originalMetadata = await extractMetadata(this.selectedFile);
        this.editedMetadata = { ...this.originalMetadata };
        console.log('Metadata extracted:', this.originalMetadata);
      } catch (error) {
        console.error('Failed to extract metadata:', error);
        this.originalMetadata = getEmptyMetadata();
        this.editedMetadata = { ...this.originalMetadata };
      }
    }

    // Populate modal with metadata
    this.populateMetadataModal();

    // Show modal
    metadataModal.classList.remove('hidden');
  }

  /**
   * Populate metadata modal with current metadata
   */
  populateMetadataModal() {
    const metadata = this.editedMetadata || this.originalMetadata || getEmptyMetadata();

    // Populate text fields
    document.getElementById('metaTitle').value = metadata.title || '';
    document.getElementById('metaArtist').value = metadata.artist || '';
    document.getElementById('metaAlbum').value = metadata.album || '';
    document.getElementById('metaYear').value = metadata.year || '';
    document.getElementById('metaGenre').value = metadata.genre || '';
    document.getElementById('metaTrack').value = metadata.track || '';
    document.getElementById('metaComment').value = metadata.comment || '';

    // Show album artwork if available
    const albumArtworkSection = document.getElementById('albumArtworkSection');
    const albumArtwork = document.getElementById('albumArtwork');

    if (metadata.picture && metadata.picture.data) {
      const { data, format } = metadata.picture;
      const blob = new Blob([new Uint8Array(data)], { type: format });
      const url = URL.createObjectURL(blob);
      albumArtwork.src = url;
      albumArtworkSection.classList.remove('hidden');
    } else {
      albumArtworkSection.classList.add('hidden');
    }
  }

  /**
   * Enable metadata edit mode
   */
  enableMetadataEditMode() {
    this.isMetadataEditMode = true;

    // Enable all input fields
    document.getElementById('metaTitle').removeAttribute('readonly');
    document.getElementById('metaArtist').removeAttribute('readonly');
    document.getElementById('metaAlbum').removeAttribute('readonly');
    document.getElementById('metaYear').removeAttribute('readonly');
    document.getElementById('metaGenre').removeAttribute('readonly');
    document.getElementById('metaTrack').removeAttribute('readonly');
    document.getElementById('metaComment').removeAttribute('readonly');

    // Show save and discard buttons, hide edit button
    document.getElementById('editMetadataBtn').classList.add('hidden');
    document.getElementById('saveMetadataBtn').classList.remove('hidden');
    document.getElementById('discardMetadataBtn').classList.remove('hidden');

    // Show artwork upload section if MP3 format
    if (supportsMetadataWriting(this.outputFormat)) {
      const uploadSection = document.getElementById('artworkUploadSection');
      uploadSection.classList.remove('hidden');

      // Check if we have existing artwork
      const metadata = this.editedMetadata || this.originalMetadata;
      const fileUpload = uploadSection.querySelector('.file-upload');
      const artworkPreview = document.getElementById('artworkPreview');
      const artworkPreviewImg = document.getElementById('artworkPreviewImg');

      if (metadata && metadata.picture && metadata.picture.data) {
        // We have artwork, show it in preview and hide upload button
        const { data, format } = metadata.picture;
        const blob = new Blob([new Uint8Array(data)], { type: format });
        const url = URL.createObjectURL(blob);
        artworkPreviewImg.src = url;
        artworkPreview.classList.remove('hidden');
        if (fileUpload) fileUpload.classList.add('hidden');
      } else {
        // No artwork, show upload button
        if (fileUpload) fileUpload.classList.remove('hidden');
        artworkPreview.classList.add('hidden');
      }

      // Hide the display-only artwork section to avoid duplicates
      document.getElementById('albumArtworkSection').classList.add('hidden');
    }

    showToast('Edit mode enabled', 'info');
  }

  /**
   * Reset metadata edit mode
   */
  resetMetadataEditMode() {
    this.isMetadataEditMode = false;

    // Make fields readonly
    document.getElementById('metaTitle').setAttribute('readonly', true);
    document.getElementById('metaArtist').setAttribute('readonly', true);
    document.getElementById('metaAlbum').setAttribute('readonly', true);
    document.getElementById('metaYear').setAttribute('readonly', true);
    document.getElementById('metaGenre').setAttribute('readonly', true);
    document.getElementById('metaTrack').setAttribute('readonly', true);
    document.getElementById('metaComment').setAttribute('readonly', true);

    // Show edit button, hide save and discard buttons
    document.getElementById('editMetadataBtn').classList.remove('hidden');
    document.getElementById('saveMetadataBtn').classList.add('hidden');
    document.getElementById('discardMetadataBtn').classList.add('hidden');

    // Hide artwork upload section
    document.getElementById('artworkUploadSection').classList.add('hidden');
  }

  /**
   * Save metadata changes
   */
  saveMetadataChanges() {
    // Get values from form
    const commentValue = document.getElementById('metaComment').value;

    // Append Vinylfy signature to comment (hidden from user)
    const commentWithSignature = commentValue
      ? `${commentValue} (Converted by Vinylfy)`
      : '(Converted by Vinylfy)';

    this.editedMetadata = {
      title: document.getElementById('metaTitle').value,
      artist: document.getElementById('metaArtist').value,
      album: document.getElementById('metaAlbum').value,
      year: document.getElementById('metaYear').value,
      genre: document.getElementById('metaGenre').value,
      track: document.getElementById('metaTrack').value,
      comment: commentWithSignature,  // Save with signature
      picture: this.uploadedArtwork || (this.originalMetadata && this.originalMetadata.picture) || null
    };

    console.log('Metadata saved:', this.editedMetadata);
    showToast('Metadata changes saved!', 'success');

    this.resetMetadataEditMode();
    document.getElementById('metadataModal').classList.add('hidden');
  }

  /**
   * Handle artwork upload
   */
  async handleArtworkUpload(file) {
    if (!file.type.match(/^image\/(jpeg|png)$/)) {
      showToast('Please upload a JPEG or PNG image', 'error');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.uploadedArtwork = {
        data: new Uint8Array(arrayBuffer),
        format: file.type
      };

      // Show preview
      const artworkPreview = document.getElementById('artworkPreview');
      const artworkPreviewImg = document.getElementById('artworkPreviewImg');
      const blob = new Blob([arrayBuffer], { type: file.type });
      const url = URL.createObjectURL(blob);
      artworkPreviewImg.src = url;
      artworkPreview.classList.remove('hidden');

      // Hide upload button
      const fileUpload = document.querySelector('.file-upload');
      if (fileUpload) fileUpload.classList.add('hidden');

      showToast('Artwork uploaded successfully', 'success');
    } catch (error) {
      console.error('Failed to upload artwork:', error);
      showToast('Failed to upload artwork', 'error');
    }
  }

  /**
   * Process audio file
   */
  async processAudio() {
    if (!this.selectedFile) {
      showToast('Please select an audio file first', 'error');
      return;
    }

    const processBtn = document.getElementById('processBtn');
    const processingIndicator = document.getElementById('processingIndicator');
    const resultsSection = document.getElementById('resultsSection');

    // Check if we act as "View Results" link
    if (this.processedFileId && processBtn && processBtn.textContent.includes('View Results')) {
      const resultsTab = document.querySelector('[data-tab="results"]');
      if (resultsTab) resultsTab.click();
      return;
    }

    let processingSuccess = false;

    try {
      // Show processing state
      if (processBtn) {
        processBtn.disabled = true;
        processBtn.innerHTML = '<span class="spinner spinner-sm"></span> Processing...';
      }

      if (processingIndicator) {
        processingIndicator.classList.remove('hidden');
      }

      if (resultsSection) {
        resultsSection.classList.add('hidden');
      }

      if (this.audioPlayer) {
        this.audioPlayer.hide();
      }

      // Reset progress bar
      this.updateProgress(0);

      // Prepare options
      const options = {
        preset: this.currentPreset
      };

      // Add custom settings if custom preset
      if (this.currentPreset === 'custom') {
        const validation = validateSettings(this.customSettings);
        if (!validation.valid) {
          throw new Error(validation.errors.join(', '));
        }
        options.settings = this.customSettings;
      }

      // Start simulated progress
      const progressInterval = this.simulateProgress();

      // Process audio
      const result = await api.processAudio(this.selectedFile, options);

      // Clear progress interval and set to 100%
      clearInterval(progressInterval);
      this.updateProgress(100);

      // Brief delay to show completion state
      await new Promise(resolve => setTimeout(resolve, 800));

      this.processedFileId = result.file_id;
      processingSuccess = true;

      // Show results
      this.showResults(result);

      showToast('Processing complete! 🎵', 'success');

    } catch (error) {
      console.error('Processing failed:', error);

      // Check if it's a DRM error
      const errorMsg = error.message || '';
      if (errorMsg.includes('DRM') || errorMsg.includes('protected') || errorMsg.includes('drm_type')) {
        showToast('❌ DRM-Protected File: This file cannot be processed. Please use audio files you own.', 'error', 8000);
        this.showDRMError(errorMsg);
      } else {
        showToast(`Processing failed: ${parseErrorMessage(error)}`, 'error', 5000);
      }
    } finally {
      // Reset button state
      if (processBtn) {
        processBtn.disabled = false;
        processBtn.classList.add('active'); // Make green by default

        if (processingSuccess) {
          processBtn.innerHTML = '<span class="btn-text" style="font-weight: 800;">View Results ➔</span>';
        } else {
          processBtn.innerHTML = '<span class="btn-text">START</span>';
        }
      }

      if (processingIndicator) {
        processingIndicator.classList.add('hidden');
      }

      // Reset progress bar
      this.updateProgress(0);
    }
  }

  /**
   * Update progress bar and status text
   */
  updateProgress(percent) {
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const processingStatus = document.getElementById('processingStatus');

    if (!progressBar || !progressPercent || !processingStatus) return;

    // Update progress bar width
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${Math.round(percent)}%`;

    // Update status text based on progress
    if (percent >= 0 && percent <= 33) {
      processingStatus.textContent = 'Grabbing the record...'
    } else if (percent > 33 && percent <= 66) {
      processingStatus.textContent = 'Loading the turntable...';
    } else if (percent > 66 && percent < 100) {
      processingStatus.textContent = 'Putting down the needle...';
    } else if (percent >= 100) {
      processingStatus.textContent = 'Vinylfy Complete!';
    }
  }

  /**
   * Simulate progress during processing
   */
  simulateProgress() {
    let progress = 0;
    const interval = setInterval(() => {
      // Increment progress with diminishing speed (slower as it approaches 95%)
      if (progress < 95) {
        const increment = Math.random() * (95 - progress) * 0.1;
        progress = Math.min(95, progress + increment);
        this.updateProgress(progress);
      }
    }, 200);

    return interval;
  }

  /**
   * Show processing results
   */
  /**
   * Show processing results in new Results Tab
   */
  showResults(result) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsEmptyState = document.getElementById('resultsEmptyState');
    const container = document.getElementById('tab-results'); // The main tab container

    // Ensure tab is active
    document.querySelector('[data-tab="results"]').click();

    // Compute URLs
    const downloadUrl = api.getDownloadURL(result.file_id);
    const previewUrl = `${api.getPreviewURL(result.file_id)}?t=${Date.now()}`;
    result.downloadUrl = downloadUrl;
    result.previewUrl = previewUrl;

    // Clear previous audio if any
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    // Get metadata and artwork
    const filename = result.filename || this.selectedFile.name;
    const filesize = formatFileSize(this.selectedFile.size);
    const presetName = typeof formatPresetName === 'function' ? formatPresetName(result.preset) : result.preset;

    // Artwork handling
    let artworkSrc = 'assets/covers/default.png';
    try {
      if (this.uploadedArtwork && this.uploadedArtwork.data) {
        const blob = new Blob([this.uploadedArtwork.data], { type: this.uploadedArtwork.format });
        artworkSrc = URL.createObjectURL(blob);
      } else if (this.originalMetadata && this.originalMetadata.picture && this.originalMetadata.picture.data) {
        const picture = this.originalMetadata.picture;
        const byteArray = new Uint8Array(picture.data);
        const blob = new Blob([byteArray], { type: picture.format || 'image/jpeg' });
        artworkSrc = URL.createObjectURL(blob);
      }
    } catch (e) {
      console.warn('Failed to load artwork for results:', e);
    }

    // Generate Waveform Bars (Randomized for visual effect)
    let waveformHtml = '';
    for (let i = 0; i < 40; i++) {
      const height = Math.floor(Math.random() * 60) + 30; // 30% to 90%
      waveformHtml += `<div style="flex: 1; height: ${height}%; background: linear-gradient(to top, var(--color-primary), var(--color-accent)); border-radius: 2px;"></div>`;
    }

    // Construct the UI HTML based on preview-main.html design
    const uiHtml = `
            <!-- Success Message -->
            <div class="glass-card"
                style="text-align: center; padding: var(--space-xl); background: var(--glass-bg-amber); margin-bottom: var(--space-xl);">
                <span style="font-size: 3rem;">✅</span>
                <h2 style="margin: var(--space-md) 0; color: var(--color-primary);">Processing Complete!</h2>
                <p style="color: var(--color-text-secondary);">Your audio has been successfully vinylfied</p>
            </div>

            <!-- Media Player Card -->
            <div class="glass-card">
                <div class="glass-card-header">
                    <h3 class="glass-card-title">Audio Player</h3>
                    <p class="glass-card-subtitle">Preview your vinylfied track</p>
                </div>

                <!-- Album Art & Track Info -->
                <div style="display: grid; grid-template-columns: 180px 1fr; gap: var(--space-xl); margin-bottom: var(--space-xl); align-items: center;">
                    <!-- Album Art -->
                    <div style="position: relative;">
                        <div style="width: 180px; height: 180px; border-radius: var(--radius-lg); background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); display: flex; align-items: center; justify-content: center; border: 2px solid var(--glass-border-vibrant); box-shadow: var(--shadow-glass-lg); overflow: hidden;">
                            <img src="${artworkSrc}" style="width: 100%; height: 100%; object-fit: cover;" alt="Album Art">
                        </div>
                        <!-- Spinning vinyl animation indicator -->
                        <div id="vinylSpinner" style="position: absolute; bottom: -10px; right: -10px; width: 40px; height: 40px; background: var(--gradient-primary); border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; border: 2px solid var(--color-bg-primary); box-shadow: 0 0 20px rgba(218, 129, 55, 0.6);">
                            <span style="font-size: 1.2rem;">🎵</span>
                        </div>
                    </div>

                    <!-- Track Info -->
                    <div style="display: flex; flex-direction: column; justify-content: center;">
                        <h3 style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); margin-bottom: var(--space-sm); color: var(--color-text-primary); word-break: break-all;">
                            ${filename}
                        </h3>
                        <p style="font-size: var(--font-size-lg); color: var(--color-text-secondary); margin-bottom: var(--space-md);">
                            Preset: ${presetName}</p>
                        <div style="display: flex; gap: var(--space-lg); font-size: var(--font-size-sm); color: var(--color-text-muted);">
                            <span id="playerTimeTotal">⏱ --:--</span>
                            <span>🎚 ${result.format.toUpperCase()}</span>
                            <span>📊 ${filesize}</span>
                        </div>
                    </div>
                </div>

                <!-- Waveform Visualization -->
                <div style="margin-bottom: var(--space-xl);">
                    <div style="height: 60px; background: var(--glass-bg-heavy); border-radius: var(--radius-md); border: 1px solid var(--glass-border); padding: var(--space-sm); display: flex; align-items: center; gap: 2px; overflow: hidden;">
                        ${waveformHtml}
                    </div>
                </div>

                <!-- Playback Progress -->
                <div style="margin-bottom: var(--space-lg);">
                    <div style="display: flex; justify-content: space-between; font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: var(--space-sm);">
                        <span id="playerTimeCurrent">0:00</span>
                        <span id="playerTimeDuration">0:00</span>
                    </div>
                    <div id="playerProgressBarContainer" style="height: 6px; background: var(--glass-bg-heavy); border-radius: var(--radius-full); border: 1px solid var(--glass-border); overflow: hidden; cursor: pointer;">
                        <div id="playerProgressBar" style="width: 0%; height: 100%; background: var(--gradient-primary); border-radius: var(--radius-full); transition: width 0.1s linear;">
                        </div>
                    </div>
                </div>

                <!-- Playback Controls -->
                <div style="display: flex; justify-content: center; align-items: center; gap: var(--space-lg);">
                    <button class="btn-glass" id="playerRewindBtn" style="width: 50px; height: 50px; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-xl);">
                        ⏮
                    </button>
                    <button class="btn-glass-primary" id="playerPlayBtn" style="width: 70px; height: 70px; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-2xl); box-shadow: var(--shadow-glass-lg), 0 0 30px rgba(218, 129, 55, 0.5);">
                        ▶
                    </button>
                    <button class="btn-glass" id="playerForwardBtn" style="width: 50px; height: 50px; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-xl);">
                        ⏭
                    </button>
                </div>

                <!-- Volume Control -->
                <div style="margin-top: var(--space-xl); display: flex; align-items: center; gap: var(--space-md); max-width: 300px; margin-left: auto; margin-right: auto;">
                    <span style="font-size: var(--font-size-lg);">🔉</span>
                    <input type="range" class="glass-slider" id="playerVolumeSlider" min="0" max="100" value="80" style="flex: 1;">
                    <span id="playerVolumeText" style="font-size: var(--font-size-sm); color: var(--color-text-muted); font-family: monospace; min-width: 40px;">80%</span>
                </div>
            </div>

            <!-- Download Options Card -->
            <div class="glass-card">
                <div class="glass-card-header">
                    <h3 class="glass-card-title">Download Your Vinylfied Track</h3>
                    <p class="glass-card-subtitle">Choose your preferred format</p>
                </div>

                <div id="downloadButtonsContainerDynamic">
                    <!-- Buttons will be injected here if we want dynamic generation, but for now we put buttons directly -->
                    <div style="display: flex; gap: var(--space-md); margin-bottom: var(--space-md); flex-wrap: wrap; justify-content: center;">
                        <a href="${result.downloadUrl}" download="${result.filename}" class="btn-glass-primary" style="text-decoration: none; padding: var(--space-lg) var(--space-2xl); border-radius: var(--radius-full); display: inline-flex; align-items: center; gap: var(--space-sm);">
                            <span style="font-size: 1.5rem;">⬇️</span>
                            <span style="font-weight: bold;">Download Processed Audio</span>
                        </a>
                    </div>
                     <div style="text-align: center; margin-top: var(--space-md);">
                        <button class="btn-glass" onclick="document.querySelector('[data-tab=process]').click()">Process Another File</button>
                    </div>
                </div>
            </div>
    `;

    // Replace container content
    if (resultsEmptyState) resultsEmptyState.style.display = 'none';

    // We purposefully overwrite the innerHTML of the results tab container to render this specific layout
    container.innerHTML = uiHtml;

    // --- Audio Logic ---
    const audio = new Audio(result.previewUrl);
    this.currentAudio = audio;
    audio.volume = 0.8;

    const playBtn = document.getElementById('playerPlayBtn');
    const rewindBtn = document.getElementById('playerRewindBtn');
    const forwardBtn = document.getElementById('playerForwardBtn');
    const progressBar = document.getElementById('playerProgressBar');
    const progressBarContainer = document.getElementById('playerProgressBarContainer');
    const timeCurrent = document.getElementById('playerTimeCurrent');
    const timeDuration = document.getElementById('playerTimeDuration');
    const timeTotal = document.getElementById('playerTimeTotal');
    const volumeSlider = document.getElementById('playerVolumeSlider');
    const volumeText = document.getElementById('playerVolumeText');
    const vinylSpinner = document.getElementById('vinylSpinner');

    // Play/Pause
    playBtn.onclick = () => {
      if (audio.paused) {
        audio.play();
        playBtn.innerHTML = '⏸';
        vinylSpinner.style.animation = 'spin 2s linear infinite';
      } else {
        audio.pause();
        playBtn.innerHTML = '▶';
        vinylSpinner.style.animation = 'none';
      }
    };

    // Seek Buttons
    rewindBtn.onclick = () => audio.currentTime = Math.max(0, audio.currentTime - 10);
    forwardBtn.onclick = () => audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);

    // Time Update
    audio.addEventListener('timeupdate', () => {
      if (!isNaN(audio.duration)) {
        const percent = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${percent}%`;

        const curMins = Math.floor(audio.currentTime / 60);
        const curSecs = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        timeCurrent.textContent = `${curMins}:${curSecs}`;
      }
    });

    // Metadata Loaded
    audio.addEventListener('loadedmetadata', () => {
      const durMins = Math.floor(audio.duration / 60);
      const durSecs = Math.floor(audio.duration % 60).toString().padStart(2, '0');
      timeDuration.textContent = `${durMins}:${durSecs}`;
      timeTotal.textContent = `⏱ ${durMins}:${durSecs}`;
    });

    // Seek Click
    progressBarContainer.onclick = (e) => {
      const rect = progressBarContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const percent = x / width;
      audio.currentTime = percent * audio.duration;
    };

    // Volume
    volumeSlider.oninput = (e) => {
      const val = e.target.value;
      audio.volume = val / 100;
      volumeText.textContent = `${val}%`;
    };

    // Ended
    audio.addEventListener('ended', () => {
      playBtn.innerHTML = '▶';
      vinylSpinner.style.animation = 'none';
      progressBar.style.width = '0%';
    });

    // Define spin animation if not exists
    if (!document.getElementById('spinStyle')) {
      const style = document.createElement('style');
      style.id = 'spinStyle';
      style.textContent = `
            @keyframes spin { 100% { transform: rotate(360deg); } }
        `;
      document.head.appendChild(style);
    }
  }

  /**
   * Preview processed audio
   */
  previewAudio(fileId) {
    const previewUrl = `${api.getPreviewURL(fileId)}?t=${Date.now()}`;
    const playPauseBtn = document.getElementById('playPauseBtn');

    // Create or get audio element
    if (!this.integratedAudio) {
      this.integratedAudio = new Audio();
      this.setupIntegratedAudioListeners();
    }

    this.integratedAudio.src = previewUrl;
    this.integratedAudio.load();
    this.integratedAudio.play();

    if (playPauseBtn) {
      playPauseBtn.textContent = '❚❚';
    }

    showToast('Loading preview...', 'info');
  }

  /**
   * Setup listeners for integrated audio player
   */
  setupIntegratedAudioListeners() {
    const timeline = document.getElementById('audioTimeline');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const playPauseBtn = document.getElementById('playPauseBtn');

    if (!this.integratedAudio) return;

    // Update timeline and time displays
    this.integratedAudio.addEventListener('timeupdate', () => {
      if (!timeline || timeline.dataset.seeking === 'true') return;

      const current = this.integratedAudio.currentTime;
      const duration = this.integratedAudio.duration || 0;

      if (duration > 0) {
        timeline.value = (current / duration) * 100;
        if (currentTimeEl) currentTimeEl.textContent = this.formatTime(current);
      }

      // Update visualizer
      this.updateVisualizer();
    });

    // Set total time when metadata loads
    this.integratedAudio.addEventListener('loadedmetadata', () => {
      if (totalTimeEl) {
        totalTimeEl.textContent = this.formatTime(this.integratedAudio.duration);
      }
      if (timeline) {
        timeline.max = 100;
      }
    });

    // Handle timeline seeking
    if (timeline) {
      timeline.addEventListener('mousedown', () => {
        timeline.dataset.seeking = 'true';
      });

      timeline.addEventListener('mouseup', () => {
        timeline.dataset.seeking = 'false';
      });

      timeline.addEventListener('input', (e) => {
        const duration = this.integratedAudio.duration || 0;
        const seekTime = (e.target.value / 100) * duration;
        this.integratedAudio.currentTime = seekTime;
        if (currentTimeEl) currentTimeEl.textContent = this.formatTime(seekTime);
      });
    }

    // Handle play/pause state changes
    this.integratedAudio.addEventListener('play', () => {
      if (playPauseBtn) playPauseBtn.textContent = '❚❚';
    });

    this.integratedAudio.addEventListener('pause', () => {
      if (playPauseBtn) playPauseBtn.textContent = '▶';
    });

    this.integratedAudio.addEventListener('ended', () => {
      if (playPauseBtn) playPauseBtn.textContent = '▶';
      if (timeline) timeline.value = 0;
    });
  }

  /**
   * Update visualizer bars based on audio playback
   */
  updateVisualizer() {
    const bars = document.querySelectorAll('.visualizer-bar');
    if (!bars.length || !this.integratedAudio || this.integratedAudio.paused) return;

    // Animate bars with varied heights to simulate frequency spectrum
    bars.forEach((bar, index) => {
      // Create a wave pattern across the bars
      const baseHeight = 5 + (Math.sin(index / bars.length * Math.PI) * 15);
      const variation = Math.random() * 10;
      bar.style.height = `${baseHeight + variation}px`;
    });
  }

  /**
   * Format time in MM:SS
   */
  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Download processed audio
   */
  async downloadAudio(fileId) {
    const downloadBtn = document.getElementById('downloadBtn');

    try {
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = '<span class="spinner spinner-sm"></span> Downloading...';

      let { blob, filename } = await api.downloadFile(fileId);

      // Note: Metadata writing is now handled per-format in downloadFormat()
      // For backward compatibility, this method downloads MP3 by default

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Download started! 🎉', 'success');

    } catch (error) {
      console.error('Download failed:', error);
      showToast(`Download failed: ${parseErrorMessage(error)}`, 'error');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = '⬇ Download';
    }
  }

  /**
   * Download specific format
   */
  async downloadFormat(fileId, format) {
    try {
      showToast(`Downloading ${format.toUpperCase()}...`, 'info');

      // Call API with format-specific endpoint
      const response = await fetch(`/api/download/${fileId}/${format}`);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get the blob
      const blob = await response.blob();

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `vinylfy_audio.${format}`;
      if (contentDisposition) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`${format.toUpperCase()} download started! 🎉`, 'success');

    } catch (error) {
      console.error('Format download failed:', error);
      showToast(`Download failed: ${parseErrorMessage(error)}`, 'error');
    }
  }

  /**
   * Download all formats as ZIP
   */
  async downloadAllFormats(fileId) {
    try {
      showToast('Preparing ZIP archive...', 'info');

      // Call API download-all endpoint
      const response = await fetch(`/api/download-all/${fileId}`);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get the blob
      const blob = await response.blob();

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('content-disposition');
      let filename = 'vinylfy_all_formats.zip';
      if (contentDisposition) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('ZIP download started! 📦', 'success');

    } catch (error) {
      console.error('ZIP download failed:', error);
      showToast(`Download failed: ${parseErrorMessage(error)}`, 'error');
    }
  }

  /**
   * Discard processed audio and reset the UI
   */
  async discardAudio(fileId) {
    // Show warning confirmation
    const confirmed = confirm(
      '⚠️ Warning: Are you sure you want to discard this file?\n\n' +
      'This will delete the processed audio from the server and reset your settings. ' +
      'This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    const discardBtn = document.getElementById('discardBtn');

    try {
      discardBtn.disabled = true;
      discardBtn.innerHTML = '<span class="spinner spinner-sm"></span> Discarding...';

      // Delete file from server
      await api.deleteFile(fileId);

      // Stop and hide audio player if playing
      if (this.audioPlayer) {
        this.audioPlayer.hide();  // hide() already pauses the audio
      }

      // Hide results section
      const resultsSection = document.getElementById('resultsSection');
      resultsSection.classList.add('hidden');

      // Clear processed file ID
      this.processedFileId = null;

      // Clear selected file and file input
      this.selectedFile = null;
      const audioFileInput = document.getElementById('audioFile');
      if (audioFileInput) {
        audioFileInput.value = '';
      }

      // Hide file info display
      const fileInfo = document.getElementById('fileInfo');
      if (fileInfo) {
        fileInfo.classList.add('hidden');
      }

      // Reset metadata
      this.originalMetadata = null;
      this.editedMetadata = null;
      this.uploadedArtwork = null;

      // Scroll back to top
      window.scrollTo({ top: 0, behavior: 'smooth' });

      showToast('File discarded successfully. You can now try different settings or upload a new file.', 'success');

    } catch (error) {
      console.error('Discard failed:', error);
      showToast(`Failed to discard file: ${parseErrorMessage(error)}`, 'error');
    } finally {
      discardBtn.disabled = false;
      discardBtn.innerHTML = '🗑️ Discard';
    }
  }

  /**
   * Get default custom settings
   */
  getDefaultCustomSettings() {
    return {
      frequency_response: true,
      surface_noise: true,
      noise_intensity: 0.02,
      pop_intensity: 0.6,
      wow_flutter: true,
      wow_flutter_intensity: 0.001,
      harmonic_distortion: true,
      distortion_amount: 0.15,
      stereo_reduction: true,
      stereo_width: 0.7,
      bass: 0.0,
      mid: 0.0,
      treble: 0.0,
      hpf_enabled: true,
      hpf_cutoff: 30,
      lpf_enabled: true,
      lpf_cutoff: 15000
    };
  }

  /**
   * Setup PWA functionality
   */
  setupPWA() {
    // Check if service worker bypass is requested (for debugging mobile issues)
    const urlParams = new URLSearchParams(window.location.search);
    const bypassSW = urlParams.get('no-sw') === 'true';

    if (bypassSW) {
      console.log('🚫 Service Worker bypassed via URL parameter');
      // Unregister existing service workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => {
            console.log('Unregistering service worker:', registration.scope);
            registration.unregister();
          });
        });
      }
      return; // Don't proceed with PWA setup
    }

    // Register service worker with better error handling
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('✅ Service Worker registered successfully:', registration.scope);

          // Check for updates every hour
          setInterval(() => {
            registration.update();
          }, 3600000);
        })
        .catch(error => {
          console.error('❌ Service Worker registration failed:', error);
          console.log('App will continue to work without offline support');
          // Don't block the app if SW registration fails
        });
    } else {
      console.log('ℹ️ Service Workers not supported in this browser');
    }

    // PWA Install Handling
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      // Show Android install banner
      this.setupAndroidInstallBanner();
    });

    // iOS-specific install prompt
    this.setupIOSInstallPrompt();
  }

  /**
   * Setup iOS install prompt banner
   */
  setupIOSInstallPrompt() {
    // Check if device is iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isInStandaloneMode = ('standalone' in window.navigator) && window.navigator.standalone;

    // Don't show if not iOS, already installed, or user dismissed it
    if (!isIOS || isInStandaloneMode || localStorage.getItem('vinylfy_ios_install_dismissed')) {
      return;
    }

    // Create iOS install banner
    const banner = document.createElement('div');
    banner.id = 'iosInstallBanner';
    banner.innerHTML = `
      <div style="
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, var(--color-primary) 0%, #b8894d 100%);
        color: white;
        padding: var(--space-md);
        box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        animation: slideUp 0.3s ease-out;
      ">
        <div style="max-width: 600px; margin: 0 auto; display: flex; align-items: center; gap: var(--space-md);">
          <img src="/assets/icons/apple-touch-icon.png" alt="Vinylfy" style="width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-xs);">
              Install Vinylfy
            </div>
            <div style="font-size: var(--font-size-sm); opacity: 0.95;">
              Tap <svg viewBox="0 0 24 24" style="width: 1em; height: 1em; display: inline; vertical-align: middle; fill: currentColor; margin: 0 2px;"><path d="M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41C3.37 14.2 4.63 14.2 5.41 13.41L11 7.83V19C11 20.1 11.9 21 13 21S15 20.1 15 19V7.83L20.59 13.41C21.37 14.2 22.63 14.2 23.41 13.41C24.2 12.63 24.2 11.37 23.41 10.59L15.41 2.59C15 2.19 14.5 2 12 2Z"/></svg> then "Add to Home Screen"
            </div>
          </div>
          <button id="iosInstallClose" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">×</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Close button handler
    document.getElementById('iosInstallClose').addEventListener('click', () => {
      banner.remove();
      localStorage.setItem('vinylfy_ios_install_dismissed', 'true');
    });

    // Auto-hide after 30 seconds
    setTimeout(() => {
      if (banner.parentNode) {
        banner.style.animation = 'slideDown 0.3s ease-out';
        setTimeout(() => banner.remove(), 300);
      }
    }, 30000);
  }

  /**
   * Setup Android install banner
   */
  setupAndroidInstallBanner() {
    // Don't show if user dismissed it or already installed
    if (isPWAInstalled() || localStorage.getItem('vinylfy_android_install_dismissed')) {
      return;
    }

    // Create Android install banner
    const banner = document.createElement('div');
    banner.id = 'androidInstallBanner';
    banner.innerHTML = `
      <div style="
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, var(--color-primary) 0%, #b8894d 100%);
        color: white;
        padding: var(--space-md);
        box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        animation: slideUp 0.3s ease-out;
      ">
        <div style="max-width: 600px; margin: 0 auto; display: flex; align-items: center; gap: var(--space-md);">
          <img src="assets/icons/icon-192x192.png" alt="Vinylfy" style="width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-xs);">
              Install Vinylfy
            </div>
            <div style="font-size: var(--font-size-sm); opacity: 0.95;">
              Add to your home screen
            </div>
          </div>
          <button id="androidInstallAccept" style="
            background: rgba(255,255,255,0.9);
            border: none;
            color: var(--color-primary);
            padding: var(--space-sm) var(--space-md);
            border-radius: var(--radius-md);
            cursor: pointer;
            font-weight: var(--font-weight-semibold);
            font-size: var(--font-size-sm);
            white-space: nowrap;
            flex-shrink: 0;
          ">Install</button>
          <button id="androidInstallClose" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            margin-left: var(--space-xs);
            z-index: 10000;
          ">×</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Install button handler - use onclick for reliability
    const acceptBtn = banner.querySelector('#androidInstallAccept');
    if (acceptBtn) {
      acceptBtn.onclick = async (e) => {
        e.preventDefault();
        console.log('Install button clicked');

        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          console.log(`Android install prompt outcome: ${outcome}`);

          // Remove banner after user makes a choice
          banner.remove();
          localStorage.setItem('vinylfy_android_install_dismissed', 'true');
          this.deferredPrompt = null;
        } else {
          console.warn('⚠️ No deferred prompt available for install');
        }
      };
    }

    // Close button handler - improved for touch/click
    const closeBtn = banner.querySelector('#androidInstallClose');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Close button clicked');
        banner.remove();
        localStorage.setItem('vinylfy_android_install_dismissed', 'true');
      };
    }

    // Auto-hide after 30 seconds
    setTimeout(() => {
      if (document.body.contains(banner)) {
        banner.remove();
      }
    }, 30000);
  }



  /**
   * Save user preferences
   */
  savePreferences() {
    storage.set('vinylfy_preferences', {
      preset: this.currentPreset,
      customSettings: this.customSettings
    });
  }

  /**
   * Load user preferences
   */
  loadPreferences() {
    const prefs = storage.get('vinylfy_preferences');

    if (prefs) {
      if (prefs.preset) {
        this.currentPreset = prefs.preset;
        const presetSelector = document.getElementById('presetSelector');
        if (presetSelector) {
          presetSelector.value = prefs.preset;
        }

        // If it's a custom preset, load saved custom settings
        // Otherwise, load the preset values from the server
        if (prefs.preset === 'custom' && prefs.customSettings) {
          this.customSettings = { ...this.customSettings, ...prefs.customSettings };
          this.updateCustomControlValues();
        } else if (this.presets[prefs.preset]) {
          // Load preset values for non-custom presets
          this.loadPresetValues(prefs.preset);
        }

        this.updateCustomControlsVisibility();
      }
    }
  }

  /**
   * Update custom control values from saved settings
   */
  updateCustomControlValues() {
    // RIAA Button state
    const riaaBtn = document.getElementById('riaaBtn');
    if (riaaBtn) {
      if (this.customSettings.frequency_response) {
        riaaBtn.classList.add('active');
      } else {
        riaaBtn.classList.remove('active');
      }
      riaaBtn.setAttribute('aria-pressed', this.customSettings.frequency_response);
    }

    const noiseIntensity = document.getElementById('noiseIntensity');
    const noiseIntensityValue = document.getElementById('noiseIntensityValue');
    const popIntensity = document.getElementById('popIntensity');
    const popIntensityValue = document.getElementById('popIntensityValue');
    const wowFlutterIntensity = document.getElementById('wowFlutterIntensity');
    const wowFlutterValue = document.getElementById('wowFlutterValue');
    const distortionAmount = document.getElementById('distortionAmount');
    const distortionValue = document.getElementById('distortionValue');
    const stereoWidth = document.getElementById('stereoWidth');
    const stereoWidthValue = document.getElementById('stereoWidthValue');

    // Noise intensity
    if (noiseIntensity && noiseIntensityValue) {
      noiseIntensity.value = this.customSettings.noise_intensity;
      noiseIntensityValue.textContent = this.customSettings.noise_intensity.toFixed(3);
      noiseIntensity.setAttribute('aria-valuenow', this.customSettings.noise_intensity);
      noiseIntensity.setAttribute('aria-valuetext', this.customSettings.noise_intensity.toFixed(3));
    }

    // Pop intensity
    if (popIntensity && popIntensityValue) {
      popIntensity.value = this.customSettings.pop_intensity;
      popIntensityValue.textContent = this.customSettings.pop_intensity.toFixed(2);
      popIntensity.setAttribute('aria-valuenow', this.customSettings.pop_intensity);
      popIntensity.setAttribute('aria-valuetext', this.customSettings.pop_intensity.toFixed(2));
    }

    // Wow flutter intensity
    if (wowFlutterIntensity && wowFlutterValue) {
      wowFlutterIntensity.value = this.customSettings.wow_flutter_intensity;
      wowFlutterValue.textContent = this.customSettings.wow_flutter_intensity.toFixed(4);
      wowFlutterIntensity.setAttribute('aria-valuenow', this.customSettings.wow_flutter_intensity);
      wowFlutterIntensity.setAttribute('aria-valuetext', this.customSettings.wow_flutter_intensity.toFixed(4));
    }

    // Distortion amount
    if (distortionAmount && distortionValue) {
      distortionAmount.value = this.customSettings.distortion_amount;
      distortionValue.textContent = this.customSettings.distortion_amount.toFixed(2);
      distortionAmount.setAttribute('aria-valuenow', this.customSettings.distortion_amount);
      distortionAmount.setAttribute('aria-valuetext', this.customSettings.distortion_amount.toFixed(2));
    }

    // Stereo width
    if (stereoWidth && stereoWidthValue) {
      stereoWidth.value = this.customSettings.stereo_width;
      stereoWidthValue.textContent = this.customSettings.stereo_width.toFixed(2);
      stereoWidth.setAttribute('aria-valuenow', this.customSettings.stereo_width);
      stereoWidth.setAttribute('aria-valuetext', this.customSettings.stereo_width.toFixed(2));
    }

    // Bass EQ
    const bassSlider = document.getElementById('bass');
    const bassValue = document.getElementById('bassValue');
    if (bassSlider && bassValue) {
      bassSlider.value = this.customSettings.bass || 0;
      const bassValueText = `${(this.customSettings.bass || 0).toFixed(1)} dB`;
      bassValue.textContent = bassValueText;
      bassSlider.setAttribute('aria-valuenow', this.customSettings.bass || 0);
      bassSlider.setAttribute('aria-valuetext', bassValueText);
    }

    // Mid EQ
    const midSlider = document.getElementById('mid');
    const midValue = document.getElementById('midValue');
    if (midSlider && midValue) {
      midSlider.value = this.customSettings.mid || 0;
      const midValueText = `${(this.customSettings.mid || 0).toFixed(1)} dB`;
      midValue.textContent = midValueText;
      midSlider.setAttribute('aria-valuenow', this.customSettings.mid || 0);
      midSlider.setAttribute('aria-valuetext', midValueText);
    }

    // Treble EQ
    const trebleSlider = document.getElementById('treble');
    const trebleValue = document.getElementById('trebleValue');
    if (trebleSlider && trebleValue) {
      trebleSlider.value = this.customSettings.treble || 0;
      const trebleValueText = `${(this.customSettings.treble || 0).toFixed(1)} dB`;
      trebleValue.textContent = trebleValueText;
      trebleSlider.setAttribute('aria-valuenow', this.customSettings.treble || 0);
      trebleSlider.setAttribute('aria-valuetext', trebleValueText);
    }

    // High-Pass Filter
    const hpfCutoff = document.getElementById('hpfCutoff');
    const hpfCutoffValue = document.getElementById('hpfCutoffValue');
    if (hpfCutoff && hpfCutoffValue) {
      hpfCutoff.value = this.customSettings.hpf_cutoff || 30;
      const hpfValueText = this.formatFrequency(this.customSettings.hpf_cutoff || 30);
      hpfCutoffValue.textContent = hpfValueText;
      hpfCutoff.setAttribute('aria-valuenow', this.customSettings.hpf_cutoff || 30);
      hpfCutoff.setAttribute('aria-valuetext', hpfValueText);
      hpfCutoff.disabled = false; // Always enabled
    }

    // Low-Pass Filter
    const lpfCutoff = document.getElementById('lpfCutoff');
    const lpfCutoffValue = document.getElementById('lpfCutoffValue');
    if (lpfCutoff && lpfCutoffValue) {
      lpfCutoff.value = this.customSettings.lpf_cutoff || 15000;
      const lpfValueText = this.formatFrequency(this.customSettings.lpf_cutoff || 15000);
      lpfCutoffValue.textContent = lpfValueText;
      lpfCutoff.setAttribute('aria-valuenow', this.customSettings.lpf_cutoff || 15000);
      lpfCutoff.setAttribute('aria-valuetext', lpfValueText);
      lpfCutoff.disabled = false; // Always enabled
    }
  }

  /**
   * Trap focus within modal for keyboard navigation
   */
  trapFocus(modal) {
    if (!modal || !modal.querySelectorAll) {
      console.warn('⚠️ Invalid modal element passed to trapFocus');
      return;
    }

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
        else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }

      if (e.key === 'Escape') {
        modal.classList.add('hidden');
        this.resetMetadataEditMode();
      }
    });

    firstElement?.focus();
  }
}

// Global diagnostic function for troubleshooting
window.vinylDiagnostics = async function () {
  console.log('🔍 Running Vinylfy diagnostics...\n');

  const results = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    protocol: window.location.protocol,
    serviceWorker: {},
    cache: {},
    network: {},
    localStorage: {}
  };

  // Check Service Worker
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    results.serviceWorker.supported = true;
    results.serviceWorker.registrations = registrations.length;
    results.serviceWorker.controller = navigator.serviceWorker.controller ? 'Active' : 'None';

    if (registrations.length > 0) {
      results.serviceWorker.scopes = registrations.map(r => r.scope);
      results.serviceWorker.states = registrations.map(r =>
        r.active ? r.active.state : 'No active worker'
      );
    }
  } else {
    results.serviceWorker.supported = false;
  }

  // Check Cache
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    results.cache.supported = true;
    results.cache.cacheNames = cacheNames;
    results.cache.count = cacheNames.length;
  } else {
    results.cache.supported = false;
  }

  // Check localStorage
  try {
    results.localStorage.supported = true;
    results.localStorage.version = localStorage.getItem('vinylfy_version');
    results.localStorage.itemCount = localStorage.length;
  } catch (e) {
    results.localStorage.supported = false;
    results.localStorage.error = e.message;
  }

  // Check network connectivity
  results.network.online = navigator.onLine;
  results.network.connectionType = navigator.connection ? navigator.connection.effectiveType : 'unknown';

  // Test API connection
  try {
    const startTime = Date.now();
    const response = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store'
    });
    const endTime = Date.now();
    const data = await response.json();

    results.network.apiReachable = true;
    results.network.apiStatus = response.status;
    results.network.apiLatency = `${endTime - startTime}ms`;
    results.network.apiVersion = data.version;
  } catch (error) {
    results.network.apiReachable = false;
    results.network.apiError = error.message;
  }

  // Display results
  console.log('📊 Diagnostic Results:');
  console.log('─────────────────────────────────────');
  console.log(`🌐 Browser: ${results.userAgent}`);
  console.log(`📍 URL: ${results.url}`);
  console.log(`🔒 Protocol: ${results.protocol}`);
  console.log(`\n🔧 Service Worker:`);
  console.log(`   Supported: ${results.serviceWorker.supported}`);
  if (results.serviceWorker.supported) {
    console.log(`   Active: ${results.serviceWorker.controller}`);
    console.log(`   Registrations: ${results.serviceWorker.registrations}`);
    if (results.serviceWorker.scopes) {
      console.log(`   Scopes: ${results.serviceWorker.scopes.join(', ')}`);
    }
  }
  console.log(`\n💾 Cache:`);
  console.log(`   Supported: ${results.cache.supported}`);
  if (results.cache.supported) {
    console.log(`   Active Caches: ${results.cache.count}`);
    console.log(`   Names: ${results.cache.cacheNames.join(', ')}`);
  }
  console.log(`\n🌍 Network:`);
  console.log(`   Online: ${results.network.online}`);
  console.log(`   Connection: ${results.network.connectionType}`);
  console.log(`   API Reachable: ${results.network.apiReachable}`);
  if (results.network.apiReachable) {
    console.log(`   API Status: ${results.network.apiStatus}`);
    console.log(`   API Latency: ${results.network.apiLatency}`);
    console.log(`   Server Version: ${results.network.apiVersion}`);
  } else {
    console.log(`   API Error: ${results.network.apiError}`);
  }
  console.log(`\n💿 localStorage:`);
  console.log(`   Supported: ${results.localStorage.supported}`);
  if (results.localStorage.supported) {
    console.log(`   Stored Version: ${results.localStorage.version || 'Not set'}`);
    console.log(`   Items: ${results.localStorage.itemCount}`);
  }
  console.log('─────────────────────────────────────');
  console.log('\n💡 Tips:');
  console.log('   • To bypass service worker: Add ?no-sw=true to URL');
  console.log('   • To clear cache: window.vinylClearCache()');
  console.log('   • For help: See TROUBLESHOOTING.md');
  console.log('\n📋 Full results object available as: window.lastDiagnostics');

  window.lastDiagnostics = results;
  return results;
};

// Global cache clearing function
window.vinylClearCache = async function () {
  console.log('🧹 Clearing all Vinylfy caches and service workers...');

  try {
    // Clear caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('✅ All caches cleared');
    }

    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
      console.log('✅ All service workers unregistered');
    }

    // Clear localStorage
    localStorage.removeItem('vinylfy_version');
    console.log('✅ localStorage cleared');

    console.log('\n🔄 Please reload the page for changes to take effect');
    console.log('   Run: location.reload(true)');

    return { success: true };
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    return { success: false, error: error.message };
  }
};

console.log('🎵 Vinylfy loaded!');
console.log('💡 Available commands:');
console.log('   • vinylDiagnostics() - Run connection diagnostics');
console.log('   • vinylClearCache() - Clear all caches and service workers');

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new VinylApp();
  });
} else {
  new VinylApp();
}

export default VinylApp;