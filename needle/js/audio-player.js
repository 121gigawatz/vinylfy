/**
 * Audio Player Component for Vinylfy
 * Handles audio preview playback with custom controls
 */

import { formatTime } from './utils.js';

export class AudioPlayer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);

    // If container doesn't exist, skip initialization
    if (!this.container) {
      console.warn(`⚠️ Audio player container '${containerId}' not found`);
      return;
    }

    this.audio = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;

    this.render();
    this.attachEventListeners();
  }

  /**
   * Render the audio player UI
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="audio-player">
        <div class="audio-controls">
          <button class="audio-play-btn" id="playBtn" aria-label="Play audio" aria-pressed="false">
            ▶
          </button>
          <div class="audio-timeline" id="timeline" role="slider" aria-label="Audio timeline" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00 of 0:00" tabindex="0">
            <div class="audio-progress" id="progress"></div>
          </div>
        </div>
        <div class="audio-time">
          <span id="currentTime">0:00</span>
          <span id="duration">0:00</span>
        </div>
      </div>
    `;

    // Get references to elements
    this.playBtn = document.getElementById('playBtn');
    this.timeline = document.getElementById('timeline');
    this.progress = document.getElementById('progress');
    this.currentTimeEl = document.getElementById('currentTime');
    this.durationEl = document.getElementById('duration');
    this.playerContainer = this.container.querySelector('.audio-player');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Play/Pause button
    this.playBtn.addEventListener('click', () => this.togglePlay());

    // Timeline click to seek
    this.timeline.addEventListener('click', (e) => this.seek(e));

    // Keyboard controls for timeline navigation
    this.timeline.addEventListener('keydown', (e) => {
      if (!this.audio || !this.duration) return;

      const step = 5; // 5% increments
      let newPercent = parseFloat(this.timeline.getAttribute('aria-valuenow') || 0);

      switch (e.key) {
        case 'ArrowLeft':
          newPercent = Math.max(0, newPercent - step);
          break;
        case 'ArrowRight':
          newPercent = Math.min(100, newPercent + step);
          break;
        case 'Home':
          newPercent = 0;
          break;
        case 'End':
          newPercent = 100;
          break;
        default:
          return; // Don't prevent default for other keys
      }

      e.preventDefault();
      const newTime = (newPercent / 100) * this.duration;
      this.audio.currentTime = newTime;
    });

    // Keyboard controls for global play/pause
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.audio && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        this.togglePlay();
      }
    });
  }

  /**
   * Load an audio file
   */
  load(url) {
    // Clean up existing audio
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.removeAudioListeners();
    }

    // Create new audio element
    this.audio = new Audio(url);
    this.audio.preload = 'metadata';

    // Add audio event listeners
    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration;
      this.durationEl.textContent = formatTime(this.duration);
    });

    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;
      this.updateProgress();
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.updatePlayButton();
      this.audio.currentTime = 0;
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.showError('Failed to load audio');
    });

    // Show player
    this.show();
  }

  /**
   * Toggle play/pause
   */
  async togglePlay() {
    if (!this.audio) return;

    try {
      if (this.isPlaying) {
        this.audio.pause();
        this.isPlaying = false;
      } else {
        await this.audio.play();
        this.isPlaying = true;
      }
      this.updatePlayButton();
    } catch (error) {
      console.error('Playback error:', error);
      this.showError('Playback failed');
    }
  }

  /**
   * Seek to a position
   */
  seek(e) {
    if (!this.audio || !this.duration) return;

    const rect = this.timeline.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * this.duration;

    this.audio.currentTime = Math.max(0, Math.min(time, this.duration));
  }

  /**
   * Update progress bar
   */
  updateProgress() {
    if (!this.duration) return;

    const percent = (this.currentTime / this.duration) * 100;
    const currentSeconds = Math.floor(this.currentTime);
    const durationSeconds = Math.floor(this.duration);

    this.progress.style.width = `${percent}%`;
    this.currentTimeEl.textContent = formatTime(this.currentTime);

    // Update timeline ARIA attributes for accessibility
    this.timeline.setAttribute('aria-valuenow', percent);
    this.timeline.setAttribute('aria-valuetext',
      `${formatTime(currentSeconds)} of ${formatTime(durationSeconds)}`
    );
  }

  /**
   * Update play button appearance
   */
  updatePlayButton() {
    if (this.isPlaying) {
      this.playBtn.textContent = '⏸';
      this.playBtn.setAttribute('aria-label', 'Pause audio');
      this.playBtn.setAttribute('aria-pressed', 'true');
    } else {
      this.playBtn.textContent = '▶';
      this.playBtn.setAttribute('aria-label', 'Play audio');
      this.playBtn.setAttribute('aria-pressed', 'false');
    }
  }

  /**
   * Show the player
   */
  show() {
    if (!this.container) return;

    console.log('AudioPlayer.show() called');
    console.log('Container:', this.container);
    console.log('Player container:', this.playerContainer);
    this.container.classList.remove('hidden');
    if (this.playerContainer) {
      this.playerContainer.classList.add('animate-fadeIn');
    }
    console.log('Container classes after show:', this.container.className);
  }

  /**
   * Hide the player
   */
  hide() {
    if (!this.container) return;

    this.container.classList.add('hidden');
    if (this.audio) {
      this.audio.pause();
      this.isPlaying = false;
      this.updatePlayButton();
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-error';
    errorDiv.textContent = message;
    this.playerContainer.appendChild(errorDiv);

    setTimeout(() => errorDiv.remove(), 3000);
  }

  /**
   * Remove audio event listeners
   */
  removeAudioListeners() {
    if (this.audio) {
      this.audio.removeEventListener('loadedmetadata', () => { });
      this.audio.removeEventListener('timeupdate', () => { });
      this.audio.removeEventListener('ended', () => { });
      this.audio.removeEventListener('error', () => { });
    }
  }

  /**
   * Clean up and destroy the player
   */
  destroy() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.removeAudioListeners();
      this.audio = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Get current playback state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      duration: this.duration,
      loaded: this.audio !== null
    };
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume) {
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Get current volume
   */
  getVolume() {
    return this.audio ? this.audio.volume : 1.0;
  }

  /**
   * Mute/unmute
   */
  toggleMute() {
    if (this.audio) {
      this.audio.muted = !this.audio.muted;
      return this.audio.muted;
    }
    return false;
  }

  /**
   * Skip forward/backward
   */
  skip(seconds) {
    if (this.audio && this.duration) {
      this.audio.currentTime = Math.max(0, Math.min(this.currentTime + seconds, this.duration));
    }
  }
}

export default AudioPlayer;