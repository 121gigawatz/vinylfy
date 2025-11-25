/**
 * Main Application Logic for Vinylfy
 */

// App Configuration
const APP_VERSION = 'v1.0.0 Beta 4.1.7';

import api from './api.js?v=beta4.1.7';
import AudioPlayer from './audio-player.js?v=beta4.1.7';
import {
  formatFileSize,
  isValidAudioFile,
  showToast,
  storage,
  validateSettings,
  formatPresetName,
  parseErrorMessage,
  isPWAInstalled
} from './utils.js?v=beta4.1.7';
import {
  extractMetadata,
  writeMetadata,
  getEmptyMetadata,
  supportsMetadataWriting
} from './metadata.js?v=beta4.1.7';

class VinylApp {
  constructor() {
    this.selectedFile = null;
    this.processedFileId = null;
    this.currentPreset = 'AJW Recommended';
    this.outputFormat = 'mp3';
    this.audioPlayer = null;
    this.presets = {};
    this.customSettings = this.getDefaultCustomSettings();
    this.isLoadingPreset = false; // Flag to prevent auto-switching to custom during preset load
    this.appVersion = APP_VERSION;
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
    this.setupPresetSelector();
    this.setupFormatSelector();
    this.setupCustomControls();
    this.setupLEDIndicators(); // Setup LED indicators for toggle switches
    this.setupProcessButton();
    this.setupThemeToggle();
    this.setupGitHubStars();
    this.setupMetadataModal();
    this.setupHelpButtons(); // Setup contextual help tours

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

    // Setup product tour (runs on first visit or version change)
    this.setupProductTour();

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

        // Show the cache update modal
        this.showCacheUpdateModal(clientVersion, serverVersion);
      }
    } catch (error) {
      console.warn('Could not check cache version:', error);
    }
  }

  /**
   * Show cache update modal
   */
  async showCacheUpdateModal(cachedVersion, latestVersion) {
    const modal = document.getElementById('cacheUpdateModal');
    const cachedVersionEl = document.getElementById('cachedVersion');
    const latestVersionEl = document.getElementById('latestVersion');
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    const dismissBtn = document.getElementById('dismissCacheModal');

    // Set version info
    cachedVersionEl.textContent = cachedVersion;
    latestVersionEl.textContent = latestVersion;

    // Load and display release notes for all versions between cached and latest
    await this.loadReleaseNotes(cachedVersion, latestVersion);
    this.trapFocus(this.showCacheUpdateModal);

    // Show modal
    modal.classList.remove('hidden');

    // Clear cache button
    clearCacheBtn.onclick = async () => {
      clearCacheBtn.disabled = true;
      clearCacheBtn.innerHTML = '<span class="spinner spinner-sm"></span> Clearing...';

      await this.clearAllCaches();

      // Mark as dismissed BEFORE reloading to prevent infinite loop
      sessionStorage.setItem('cacheModalDismissed', 'true');

      // Force reload
      window.location.reload(true);
    };

    // Dismiss button
    dismissBtn.onclick = () => {
      modal.classList.add('hidden');
      // Mark as dismissed for this session
      this.cacheModalDismissed = true;
      sessionStorage.setItem('cacheModalDismissed', 'true');
      console.log('ℹ️ Cache modal dismissed for this session');
    };

    // Close on overlay click
    const overlay = modal.querySelector('.modal-overlay');
    overlay.onclick = () => {
      modal.classList.add('hidden');
      // Mark as dismissed for this session
      this.cacheModalDismissed = true;
      sessionStorage.setItem('cacheModalDismissed', 'true');
      console.log('ℹ️ Cache modal dismissed for this session');
    };
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
    } catch (error) {
      console.error('Failed to load presets:', error);
      showToast('Failed to load presets', 'error');
    }
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
  /**
   * Handle file selection
   */
  async handleFileSelect(file) {
    if (!isValidAudioFile(file)) {
      showToast('Invalid file type. Please select an audio file.', 'error');
      return;
    }

    this.selectedFile = file;

    // Update Console Display
    const display = document.getElementById('consoleDisplay');
    const defaultState = display.querySelector('.default-state');
    const loadedState = display.querySelector('.loaded-state');
    const processingState = display.querySelector('.processing-state');

    const displayFilename = document.getElementById('displayFilename');
    const displayFormat = document.getElementById('displayFormat');
    const displaySize = document.getElementById('displaySize');

    // Update Filename with Marquee support
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
    displaySize.textContent = formatFileSize(file.size);
    displayFormat.textContent = file.type.split('/')[1].toUpperCase();

    defaultState.classList.add('hidden');
    processingState.classList.add('hidden');
    loadedState.classList.remove('hidden');

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
      console.warn('⚠️ Preset selector not found, skipping setup');
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
   * Populate preset selector and shelf
   */
  populatePresetSelector() {
    const presetSelector = document.getElementById('presetSelector');
    const presetShelf = document.getElementById('presetShelf');

    if (presetSelector) presetSelector.innerHTML = '';
    if (presetShelf) presetShelf.innerHTML = '';

    // Preset descriptions for better UX
    const presetDescriptions = {
      'AJW Recommended': 'AJW Recommended - Perfect balance',
      'custom': 'Custom - Full control'
    };

    // Define preset order
    const presetOrder = ['AJW Recommended', 'custom'];

    // Get all available presets from API response
    const availablePresets = Object.keys(this.presets);

    // Create a Set for unique presets to avoid duplicates
    const uniquePresets = new Set([...presetOrder, ...availablePresets]);

    // Add presets
    uniquePresets.forEach(preset => {
      if (this.presets[preset] || preset === 'custom') {
        // Add to dropdown (hidden but functional)
        if (presetSelector) {
          const option = document.createElement('option');
          option.value = preset;
          option.textContent = presetDescriptions[preset] || formatPresetName(preset);
          presetSelector.appendChild(option);
        }

        // Add to shelf
        if (presetShelf) {
          const album = document.createElement('div');
          album.className = `preset-album ${this.currentPreset === preset ? 'active' : ''}`;
          album.dataset.preset = preset;
          album.onclick = () => this.selectPreset(preset);

          // Generate filename from preset name (lowercase, spaces to hyphens)
          // Collapse multiple non-alphanumeric chars to single hyphen and trim
          const coverName = preset.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          const coverSrc = `assets/covers/${coverName}.png`;

          // Fallback to placeholder if image fails (handled via error event)

          album.innerHTML = `
            <div class="album-cover-wrapper">
              <div class="album-record"></div>
              <img src="${coverSrc}" alt="${preset}" class="album-cover" onerror="this.src='assets/covers/placeholder.jpg'">
            </div>
            <div class="album-label">${formatPresetName(preset)}</div>
          `;

          presetShelf.appendChild(album);
        }
      }
    });

    if (presetSelector) presetSelector.value = this.currentPreset;
    this.loadPresetValues(this.currentPreset);
    this.updateCustomControlsVisibility();
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

    // Set flag to prevent auto-switching to custom
    this.isLoadingPreset = true;

    // Update custom settings from preset
    this.customSettings = { ...preset };

    // Update UI controls to reflect preset values
    this.updateCustomControlValues();

    // Reset flag
    this.isLoadingPreset = false;
  }

  /**
   * Setup output format selector
   */
  /**
   * Setup output format selector
   */
  setupFormatSelector() {
    const formatInputs = document.querySelectorAll('input[name="outputFormat"]');

    formatInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        this.outputFormat = e.target.value;
        this.updateMetadataButtonState();
        this.savePreferences();
      });
    });
  }

  /**
   * Update metadata button state based on selected format
   */
  updateMetadataButtonState() {
    const metadataBtn = document.getElementById('metadataBtn');
    if (!metadataBtn) return;

    if (supportsMetadataWriting(this.outputFormat)) {
      metadataBtn.disabled = false;
      metadataBtn.title = 'View and edit audio metadata';
    } else {
      metadataBtn.disabled = true;
      metadataBtn.title = `Metadata is only supported for MP3, FLAC, and AAC formats. Current format: ${this.outputFormat.toUpperCase()}`;
    }
  }

  /**
   * Setup custom controls
   */
  setupCustomControls() {
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
    const popIntensity = document.getElementById('popIntensity');
    const popIntensityValue = document.getElementById('popIntensityValue');

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

    // Pop intensity slider
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

    // Wow/Flutter intensity
    const wowFlutterIntensity = document.getElementById('wowFlutterIntensity');
    const wowFlutterValue = document.getElementById('wowFlutterValue');

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

    // Harmonic distortion amount
    const distortionAmount = document.getElementById('distortionAmount');
    const distortionValue = document.getElementById('distortionValue');

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

    bassSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.customSettings.bass = value;
      const valueText = `${value.toFixed(1)} dB`;
      bassValue.textContent = valueText;
      e.target.setAttribute('aria-valuenow', value);
      e.target.setAttribute('aria-valuetext', valueText);
      this.switchToCustomPreset();
    });

    // Mid EQ
    const midSlider = document.getElementById('mid');
    const midValue = document.getElementById('midValue');

    midSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.customSettings.mid = value;
      const valueText = `${value.toFixed(1)} dB`;
      midValue.textContent = valueText;
      e.target.setAttribute('aria-valuenow', value);
      e.target.setAttribute('aria-valuetext', valueText);
      this.switchToCustomPreset();
    });

    // Treble EQ
    const trebleSlider = document.getElementById('treble');
    const trebleValue = document.getElementById('trebleValue');

    trebleSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.customSettings.treble = value;
      const valueText = `${value.toFixed(1)} dB`;
      trebleValue.textContent = valueText;
      e.target.setAttribute('aria-valuenow', value);
      e.target.setAttribute('aria-valuetext', valueText);
      this.switchToCustomPreset();
    });

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
    if (this.currentPreset !== 'custom') {
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

    processBtn.addEventListener('click', () => {
      this.processAudio();
    });
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

    // Show save button, hide edit button
    document.getElementById('editMetadataBtn').classList.add('hidden');
    document.getElementById('saveMetadataBtn').classList.remove('hidden');

    // Show artwork upload section if MP3 format
    if (supportsMetadataWriting(this.outputFormat)) {
      document.getElementById('artworkUploadSection').classList.remove('hidden');
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

    // Show edit button, hide save button
    document.getElementById('editMetadataBtn').classList.remove('hidden');
    document.getElementById('saveMetadataBtn').classList.add('hidden');

    // Hide artwork upload section
    document.getElementById('artworkUploadSection').classList.add('hidden');
  }

  /**
   * Save metadata changes
   */
  saveMetadataChanges() {
    // Get values from form
    this.editedMetadata = {
      title: document.getElementById('metaTitle').value,
      artist: document.getElementById('metaArtist').value,
      album: document.getElementById('metaAlbum').value,
      year: document.getElementById('metaYear').value,
      genre: document.getElementById('metaGenre').value,
      track: document.getElementById('metaTrack').value,
      comment: document.getElementById('metaComment').value,
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

    try {
      // Show processing state
      processBtn.disabled = true;
      processBtn.innerHTML = '<span class="spinner spinner-sm"></span> Processing...';
      processingIndicator.classList.remove('hidden');
      resultsSection.classList.add('hidden');
      if (this.audioPlayer) {
        this.audioPlayer.hide();
      }

      // Reset progress bar
      this.updateProgress(0);

      // Show processing tour on first use
      this.showProcessingTour();

      // Prepare options
      const options = {
        preset: this.currentPreset,
        outputFormat: this.outputFormat
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
      processBtn.disabled = false;
      processBtn.classList.add('active'); // Make green by default
      const btnText = processBtn.querySelector('.btn-text');
      if (btnText) {
        btnText.textContent = 'START';
      }
      processingIndicator.classList.add('hidden');

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
  showResults(result) {
    const resultsSection = document.getElementById('resultsSection');
    const resultFileName = document.getElementById('resultFileName');
    const resultFileSize = document.getElementById('resultFileSize');
    const resultPreset = document.getElementById('resultPreset');
    const resultFormat = document.getElementById('resultFormat');
    const expiresIn = document.getElementById('expiresIn');
    const previewBtn = document.getElementById('previewBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const discardBtn = document.getElementById('discardBtn');

    // Update result info
    resultFileName.textContent = result.suggested_filename;
    resultFileSize.textContent = result.file_size_formatted;
    resultPreset.textContent = formatPresetName(result.preset);
    if (resultFormat) {
      resultFormat.textContent = result.output_format.toUpperCase();
    }

    // Enable marquee scrolling for long filenames
    const marqueeContainer = document.getElementById('resultFileNameMarquee');
    if (marqueeContainer) {
      // Use setTimeout to ensure DOM is rendered before measuring
      setTimeout(() => {
        const containerWidth = marqueeContainer.parentElement.offsetWidth;
        const contentWidth = resultFileName.scrollWidth;
        if (contentWidth > containerWidth) {
          marqueeContainer.classList.add('scrolling');
          // Duplicate content for seamless loop
          resultFileName.innerHTML = `<span>${result.suggested_filename}</span><span>${result.suggested_filename}</span>`;
        } else {
          marqueeContainer.classList.remove('scrolling');
        }
      }, 100);
    }

    const minutes = Math.floor(result.expires_in_seconds / 60);
    if (expiresIn) {
      expiresIn.textContent = `${minutes} min`;
    }

    // Setup metal control buttons
    const playPauseBtn = document.getElementById('playPauseBtn');
    const rewindBtn = document.getElementById('rewindBtn');
    const fastForwardBtn = document.getElementById('fastForwardBtn');

    // Play/Pause button - toggles audio player
    if (playPauseBtn) {
      playPauseBtn.onclick = () => {
        if (this.integratedAudio && this.integratedAudio.src) {
          if (this.integratedAudio.paused) {
            this.integratedAudio.play();
            playPauseBtn.textContent = '❚❚';
          } else {
            this.integratedAudio.pause();
            playPauseBtn.textContent = '▶';
          }
        } else {
          // Load and play preview
          this.previewAudio(result.file_id);
          playPauseBtn.textContent = '❚❚';
        }
      };
    }

    // Rewind button - go back 30 seconds
    if (rewindBtn) {
      rewindBtn.onclick = () => {
        if (this.integratedAudio && this.integratedAudio.src) {
          this.integratedAudio.currentTime = Math.max(0, this.integratedAudio.currentTime - 30);
        }
      };
    }

    // Fast forward button - go forward 30 seconds
    if (fastForwardBtn) {
      fastForwardBtn.onclick = () => {
        if (this.integratedAudio && this.integratedAudio.src) {
          this.integratedAudio.currentTime = Math.min(
            this.integratedAudio.duration,
            this.integratedAudio.currentTime + 30
          );
        }
      };
    }

    // Setup download button
    downloadBtn.onclick = () => this.downloadAudio(result.file_id);

    // Setup discard button
    discardBtn.onclick = () => this.discardAudio(result.file_id);

    // Update metadata button state
    this.updateMetadataButtonState();

    // Update process button to show PROCESSED
    const processBtn = document.getElementById('processBtn');
    if (processBtn) {
      const btnText = processBtn.querySelector('.btn-text');
      if (btnText) {
        btnText.textContent = 'PROCESSED';
      }
      processBtn.classList.add('active'); // Keep green
    }

    // Show results section
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

      // If format supports metadata and we have edited metadata, write it to the file
      if (supportsMetadataWriting(this.outputFormat) && this.editedMetadata) {
        try {
          downloadBtn.innerHTML = '<span class="spinner spinner-sm"></span> Adding metadata...';
          console.log(`Writing metadata to ${this.outputFormat.toUpperCase()} file...`);
          blob = await writeMetadata(blob, this.editedMetadata, this.outputFormat);
          showToast('Metadata added to file! 🏷️', 'success');
        } catch (error) {
          console.error('Failed to write metadata:', error);
          showToast('Warning: Failed to add metadata to file', 'warning');
          // Continue with download even if metadata writing fails
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

    // Install prompt for Android/Desktop
    const installBtn = document.getElementById('installBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      if (installBtn && !isPWAInstalled()) {
        installBtn.classList.remove('hidden');
      }

      // Show Android install banner
      this.setupAndroidInstallBanner();
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          console.log(`Install prompt outcome: ${outcome}`);
          this.deferredPrompt = null;
          installBtn.classList.add('hidden');
        }
      });
    }

    // Hide install button if already installed
    if (isPWAInstalled() && installBtn) {
      installBtn.classList.add('hidden');
    }

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
          <img src="/assets/icons/android-touch-icon.png" alt="Vinylfy" style="width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-xs);">
              Install Vinylfy
            </div>
            <div style="font-size: var(--font-size-sm); opacity: 0.95;">
              Add to your home screen for quick access and offline use
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

    // Install button handler
    document.getElementById('androidInstallAccept').addEventListener('click', async () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`Android install prompt outcome: ${outcome}`);

        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }

        // Remove banner after user makes a choice
        banner.remove();
        localStorage.setItem('vinylfy_android_install_dismissed', 'true');
        this.deferredPrompt = null;
      }
    });

    // Close button handler
    document.getElementById('androidInstallClose').addEventListener('click', () => {
      banner.remove();
      localStorage.setItem('vinylfy_android_install_dismissed', 'true');
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
   * Setup product tour with Driver.js
   * Disabled - tours are now triggered manually via help buttons
   */
  setupProductTour() {
    // Automatic tour disabled - now using contextual help buttons
    console.log('ℹ️ Contextual tours available via help buttons');
  }

  /**
   * Show processing tour on first use
   * Disabled - now using contextual help button
   */
  showProcessingTour() {
    // Processing tour disabled - now using contextual help button
    return;
  }

  /**
   * Contextual tour definitions
   * Populate these with your driver.js tour steps
   */
  getTourDefinitions() {
    return {
      upload: {
        steps: [
          {
            element: '#audioFile',
            popover: {
              title: 'Upload Your File for Vinylifacation',
              description: 'Click to browse and add your audio file to import, or drag and drop your input file into this area',
              side: 'right',
              align: 'center'
            }
          }
        ]
      },
      'vinyl-effects': {
        steps: [
          {
            element: '#presetSelector',
            popover: {
              title: 'Choosing a Vinylfy preset...',
              description: 'Vinylfy comes with presets to make vinylification easy!<br><br>Choose a preset from the 1920s through modern day.<br><br>The default value is AJW Recommended from our own Vinylfy vinyl enthusiast!',
              side: 'right',
              align: 'center'
            }
          },
          {
            element: '#formatSelector',
            popover: {
              title: 'Choose your desired output format.',
              description: 'Vinylfy supports multiple output formats to suit your individual needs. Choose the output format you prefer.<br><br>The default is MP3 for maximum compatability.',
              side: 'start',
              align: 'bottom'
            }
          },
          {
            element: '#customSettingsHeader',
            popover: {
              title: 'Customizing your vinylification...',
              description: 'Vinylfy makes it easy to customize your audio to your own individual tastes. Start with one of our presets, and adjust the sound to your taste.',
              side: 'right',
              align: 'center'
            }
          },
          {
            element: '#frequencyResponseLabel',
            popover: {
              title: 'RIAA Curve On/Off',
              description: 'Toggle this switch to apply or bypass the RIAA equalization curve introduced in the 1950s.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#surfaceNoiseLabel',
            popover: {
              title: 'Adding Surface Noise',
              description: 'Toggle this switch to activate digital surface noise. This feature attempts to add clicks and crackle from vinyl playback, which are caused by dust and scratches on the record surface.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#noiseIntensity',
            popover: {
              title: 'Surface Noise Intensity',
              description: 'Use this slider to adjust the strength of the clicker algorithm. Adjusting the intensity controls how aggressively the filter attempts to add surface noise.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#popIntensity',
            popover: {
              title: 'Pop Intensity',
              description: 'Use this slider to adjust the intensity of the algorithm to add pops often caused by dust on the vinyl record.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#wowFlutterLabel',
            popover: {
              title: 'Wow & Flutter',
              description: 'Toggle this switch to enable or bypass the Wow & Flutter effect. This intentionally introduces subtle, periodic speed variations that mimic inconsistencies found in older analog playback systems (like turntables with unstable motors)',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#wowFlutterIntensity',
            popover: {
              title: 'Wow & Flutter Intensity',
              description: 'Use this slider to adjust the degree of speed variation and pitch instability applied to the audio signal. This controls how aggressively the analog "age" or "drift" is introduced into the sound.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#harmonicDistortionLabel',
            popover: {
              title: 'Harmonic Distortion (Color/Warmth)',
              description: 'Toggle this switch to enable or bypass the deliberate introduction of harmonic distortion (sometimes called "saturation"). This is an effect used to simulate the sound of analog gear, adding a subjective sense of "warmth," "color," or "grit" to the sound.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#distortionAmount',
            popover: {
              title: 'Harmonic Distortion Amount',
              description: 'Use this slider to adjust the intensity of the added harmonic distortion (saturation). This controls the degree of analog "color" or "warmth" applied to the audio signal.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#stereoReductionLabel',
            popover: {
              title: 'Stereo Reduction (Mono Sum)',
              description: 'Toggle this switch to reduce the stereo width of the audio signal.<br><br>This is a useful feature for creating a more mono-like sound, which can be helpful for certain genres or when you want to create a more balanced mix.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#stereoWidth',
            popover: {
              title: 'Stereo Width / Mono Blend Slider',
              description: 'Use this slider to adjust the width of the stereo field, ranging from the original full stereo image to a completely summed mono signal. This allows you to selectively reduce the stereo separation without going straight to pure mono.<br><br>A value of 0 will give a full stereo signal, while a value of 1 will give a pure mono signal.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#bass',
            popover: {
              title: 'Bass',
              description: 'Use this slider to adjust the bass of the audio signal.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#mid',
            popover: {
              title: 'Mid',
              description: 'Use this slider to adjust the midtones of the audio signal.<br><br>Midtones are the frequencies between the bass and treble, which is usually where vocals and most of the instruments are.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#treble',
            popover: {
              title: 'Treble',
              description: 'Use this slider to adjust the treble of the audio signal.<br><br>Treble is the high frequency range of the audio signal, which is usually where most of the high pitched instruments are.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#hpfLabel',
            popover: {
              title: 'High Pass Filter',
              description: 'Toggle this switch to enable or bypass the high pass filter.<br><br>The high pass filter removes low frequency noise and rumble from the audio signal.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#hpfCutoff',
            popover: {
              title: 'High Pass Filter Cutoff',
              description: 'Use this slider to adjust the cutoff frequency of the high pass filter.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#lpfLabel',
            popover: {
              title: 'Low Pass Filter',
              description: 'Toggle this switch to enable or bypass the low pass filter.<br><br>The low pass filter removes high frequency noise and hiss from the audio signal.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#lpfCutoff',
            popover: {
              title: 'Low Pass Filter Cutoff',
              description: 'Use this slider to adjust the cutoff frequency of the low pass filter.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#processBtn',
            popover: {
              title: 'Begin Vinylification',
              description: 'Click here to begin vinylifying your uploaded audio file with Vinylfy. Vinylfy will apply its algorithm based on the settings above.',
              side: 'top',
              align: 'center'
            }
          },
        ]
      },
      results: {
        steps: [
          {
            element: '#resultsSection',
            popover: {
              title: 'Results Section',
              description: 'After clicking the Process Audio button above, this section will appear where you can preview, download, or discard the finished file. You also can manage the metadata for the processed file before downloading (MP3, AAC, and FLAC outputs only).',
              side: 'left',
              align: 'center'
            }
          },
          {
            element: '#resultFileName',
            popover: {
              title: 'Output File Name',
              description: 'This shows the filename that will be outputted upon download. All downloads from Vinylfy will append _vinylfy to the file name.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#resultFileSize',
            popover: {
              title: 'Output File Size',
              description: 'This area shows the size of the processed file if you choose to download it. Ensure your downloads folder has enough space to store this file.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#resultPreset',
            popover: {
              title: 'Preset Applied',
              description: 'This shows the preset applied to the outputted file.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#resultFormat',
            popover: {
              title: 'Output File Format',
              description: 'This shows the outputted file format chosen above. Ensure you have the appropriate software to play this file type before downloading.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#expiresIn',
            popover: {
              title: 'File Expiration',
              description: 'The time shown here represents the amount of time before the processed file is removed from the server, as set by your administrator. You will need to make sure you download the file prior to this time.',
              side: 'left',
              align: 'center'
            }
          },
          {
            element: '#previewBtn',
            popover: {
              title: 'Preview Button',
              description: 'Press this button to prview your vinylfied audio before downloading.',
              side: 'bottom',
              align: 'center'
            }
          },
          {
            element: '#metadataBtn',
            popover: {
              title: 'Metadata Button',
              description: 'Press this button to view, edit, or delete the metadata tags associated with the processed file. Vinylfy will populate any avaialble metadata from the source file by default.',
              side: 'bottom',
              align: 'center'
            }
          },
          {
            element: '#downloadBtn',
            popover: {
              title: 'Download Button',
              description: 'Press this button to download your Vinylfied audio file.',
              side: 'bottom',
              align: 'center'
            }
          },
          {
            element: '#discardBtn',
            popover: {
              title: 'Discard Button',
              description: 'Press this button to discard your Vinylfied audio file. This will delete the file from the server, and allow you to start over. You will need to reupload the same file, or you can select a new file.',
              side: 'bottom',
              align: 'center'
            }
          }
        ]
      },
      metadata: {
        steps: [
          {
            element: '#metadataModal',
            popover: {
              title: 'Metadata Management',
              description: 'In this screen, you can view, edit, or delete any metadata for your file. Vinylfy will automatically include any existing metadata from your uploaded file by default.',
              side: 'top',
              align: 'start'
            }
          },
          {
            element: '#editMetadataBtn',
            popover: {
              title: 'Edit Your Metadata',
              description: 'Press this button to enter into edit mode, where you can edit your file\'s metadata. All of these fields are optional, however, filling in as much metadata as possible can help software such as Apple Music properly organize and show the properties of the song, and allow it to be indexable for features such as smart playlists, searches, etc.',
              side: 'top',
              align: 'center'
            }
          },
          {
            element: '#metaTitle',
            popover: {
              title: 'Title',
              description: 'This is the song title.',
              side: 'left',
              align: 'center'
            }
          },
          {
            element: '#metaArtist',
            popover: {
              title: 'Artist',
              description: 'This is the artist for the song.',
              side: 'right',
              align: 'center'
            }
          },
          {
            element: '#metaAlbum',
            popover: {
              title: 'Album',
              description: 'This is the album for the song.',
              side: 'left',
              align: 'center'
            }
          },
          {
            element: '#metaYear',
            popover: {
              title: 'Year',
              description: 'This is the year the song was released.',
              side: 'right',
              align: 'center'
            }
          },
          {
            element: '#metaGenre',
            popover: {
              title: 'Genre',
              description: 'This is the genre for the song.',
              side: 'left',
              align: 'center'
            }
          },
          {
            element: '#metaTrack',
            popover: {
              title: 'Track Number',
              description: 'This is the track number of the song on the album.',
              side: 'right',
              align: 'center'
            }
          },
          {
            element: '#metaComment',
            popover: {
              title: 'Comments',
              description: 'This is where any comments are shown, or can be added.',
              side: 'bottom',
              align: 'center'
            }
          }
        ]
      }
    };
  }

  /**
   * Start a contextual tour
   * @param {string} tourName - Name of the tour to start
   */
  startTour(tourName) {
    // Check if Driver.js is loaded
    if (typeof window.driver === 'undefined' ||
      typeof window.driver.js === 'undefined' ||
      typeof window.driver.js.driver === 'undefined') {
      console.warn('Driver.js not loaded');
      showToast('Tour functionality not available', 'error');
      return;
    }

    // Get tour definition
    const tours = this.getTourDefinitions();
    const tourDef = tours[tourName];

    if (!tourDef) {
      console.warn(`Tour '${tourName}' not found`);
      return;
    }

    // Create and start the driver
    const driverObj = window.driver.js.driver({
      sanitize: false,
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      steps: tourDef.steps,
      onDestroyStarted: () => {
        driverObj.destroy();
      }
    });

    driverObj.drive();
  }

  /**
   * Setup help button event listeners
   */
  setupHelpButtons() {
    // Get all help buttons
    const helpButtons = document.querySelectorAll('.help-btn[data-tour]');

    helpButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tourName = button.getAttribute('data-tour');
        this.startTour(tourName);
      });
    });
  }

  /**
   * Save user preferences
   */
  savePreferences() {
    storage.set('vinylfy_preferences', {
      preset: this.currentPreset,
      outputFormat: this.outputFormat,
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

      if (prefs.outputFormat) {
        this.outputFormat = prefs.outputFormat;
        const formatSelector = document.getElementById('formatSelector');
        if (formatSelector) {
          formatSelector.value = prefs.outputFormat;
        }
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
    const popIntensity = document.getElementById('popIntensity');
    const wowFlutterIntensity = document.getElementById('wowFlutterIntensity');
    const distortionAmount = document.getElementById('distortionAmount');
    const stereoWidth = document.getElementById('stereoWidth');

    // Removed surfaceNoise toggle check
    noiseIntensity.value = this.customSettings.noise_intensity;
    document.getElementById('noiseIntensityValue').textContent = this.customSettings.noise_intensity.toFixed(3);
    // Update ARIA attributes
    noiseIntensity.setAttribute('aria-valuenow', this.customSettings.noise_intensity);
    noiseIntensity.setAttribute('aria-valuetext', this.customSettings.noise_intensity.toFixed(3));

    popIntensity.value = this.customSettings.pop_intensity;
    document.getElementById('popIntensityValue').textContent = this.customSettings.pop_intensity.toFixed(2);
    // Update ARIA attributes
    popIntensity.setAttribute('aria-valuenow', this.customSettings.pop_intensity);
    popIntensity.setAttribute('aria-valuetext', this.customSettings.pop_intensity.toFixed(2));


    wowFlutterIntensity.value = this.customSettings.wow_flutter_intensity;
    document.getElementById('wowFlutterValue').textContent = this.customSettings.wow_flutter_intensity.toFixed(4);
    // Update ARIA attributes
    wowFlutterIntensity.setAttribute('aria-valuenow', this.customSettings.wow_flutter_intensity);
    wowFlutterIntensity.setAttribute('aria-valuetext', this.customSettings.wow_flutter_intensity.toFixed(4));

    distortionAmount.value = this.customSettings.distortion_amount;
    document.getElementById('distortionValue').textContent = this.customSettings.distortion_amount.toFixed(2);
    // Update ARIA attributes
    distortionAmount.setAttribute('aria-valuenow', this.customSettings.distortion_amount);
    distortionAmount.setAttribute('aria-valuetext', this.customSettings.distortion_amount.toFixed(2));


    stereoWidth.value = this.customSettings.stereo_width;
    document.getElementById('stereoWidthValue').textContent = this.customSettings.stereo_width.toFixed(2);
    // Update ARIA attributes
    stereoWidth.setAttribute('aria-valuenow', this.customSettings.stereo_width);
    stereoWidth.setAttribute('aria-valuetext', this.customSettings.stereo_width.toFixed(2));

    // Bass EQ
    const bassSlider = document.getElementById('bass');
    bassSlider.value = this.customSettings.bass || 0;
    const bassValueText = `${(this.customSettings.bass || 0).toFixed(1)} dB`;
    document.getElementById('bassValue').textContent = bassValueText;
    bassSlider.setAttribute('aria-valuenow', this.customSettings.bass || 0);
    bassSlider.setAttribute('aria-valuetext', bassValueText);

    // Mid EQ
    const midSlider = document.getElementById('mid');
    midSlider.value = this.customSettings.mid || 0;
    const midValueText = `${(this.customSettings.mid || 0).toFixed(1)} dB`;
    document.getElementById('midValue').textContent = midValueText;
    midSlider.setAttribute('aria-valuenow', this.customSettings.mid || 0);
    midSlider.setAttribute('aria-valuetext', midValueText);

    // Treble EQ
    const trebleSlider = document.getElementById('treble');
    trebleSlider.value = this.customSettings.treble || 0;
    const trebleValueText = `${(this.customSettings.treble || 0).toFixed(1)} dB`;
    document.getElementById('trebleValue').textContent = trebleValueText;
    trebleSlider.setAttribute('aria-valuenow', this.customSettings.treble || 0);
    trebleSlider.setAttribute('aria-valuetext', trebleValueText);

    // High-Pass Filter
    const hpfCutoff = document.getElementById('hpfCutoff');
    if (hpfCutoff) {
      hpfCutoff.value = this.customSettings.hpf_cutoff || 30;
      const hpfValueText = this.formatFrequency(this.customSettings.hpf_cutoff || 30);
      document.getElementById('hpfCutoffValue').textContent = hpfValueText;
      hpfCutoff.setAttribute('aria-valuenow', this.customSettings.hpf_cutoff || 30);
      hpfCutoff.setAttribute('aria-valuetext', hpfValueText);
      hpfCutoff.disabled = false; // Always enabled
    }

    // Low-Pass Filter
    const lpfCutoff = document.getElementById('lpfCutoff');
    if (lpfCutoff) {
      lpfCutoff.value = this.customSettings.lpf_cutoff || 15000;
      const lpfValueText = this.formatFrequency(this.customSettings.lpf_cutoff || 15000);
      document.getElementById('lpfCutoffValue').textContent = lpfValueText;
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