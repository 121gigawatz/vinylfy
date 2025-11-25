/**
 * API Communication Module for Vinylfy
 * Handles all interactions with the table (backend)
 */

// API Configuration
// Point to backend server on port 8888 for local dev (Docker)
const API_BASE_URL = 'http://localhost:8888/api';

// API Client Class
class VinylAPI {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  /**
   * Generic request handler
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      // Handle non-JSON responses (like file downloads)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        return data;
      }

      // For binary responses (audio files)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint) {
    return this.request(endpoint, {
      method: 'GET',
    });
  }

  /**
   * POST request with JSON body
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }

  /**
   * POST request with FormData (for file uploads)
   */
  async postFormData(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header, browser will set it with boundary
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE',
    });
  }

  /**
   * Check API health
   */
  async checkHealth() {
    try {
      const data = await this.get('/health');
      return {
        healthy: data.status === 'healthy',
        ...data
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get available presets
   */
  async getPresets() {
    return this.get('/presets');
  }

  /**
   * Get supported audio formats
   */
  async getFormats() {
    return this.get('/formats');
  }

  /**
   * Check if audio file has DRM protection (quick check)
   */
  async checkDRM(file) {
    const formData = new FormData();
    formData.append('audio', file);
    return this.postFormData('/check-drm', formData);
  }

  /**
   * Process audio file with vinyl effects
   * Returns file ID for preview/download
   */
  async processAudio(file, options = {}) {
    const formData = new FormData();
    formData.append('audio', file);

    // Add preset
    if (options.preset) {
      formData.append('preset', options.preset);
    }

    // Add output format
    if (options.outputFormat) {
      formData.append('output_format', options.outputFormat);
    }

    // Add custom settings if preset is 'custom'
    if (options.preset === 'custom' && options.settings) {
      const settings = options.settings;

      formData.append('frequency_response', settings.frequency_response);
      formData.append('surface_noise', settings.surface_noise);
      formData.append('noise_intensity', settings.noise_intensity);
      formData.append('pop_intensity', settings.pop_intensity);
      formData.append('wow_flutter', settings.wow_flutter);
      formData.append('wow_flutter_intensity', settings.wow_flutter_intensity);
      formData.append('harmonic_distortion', settings.harmonic_distortion);
      formData.append('distortion_amount', settings.distortion_amount);
      formData.append('stereo_reduction', settings.stereo_reduction);
      formData.append('stereo_width', settings.stereo_width);
    }

    return this.postFormData('/process', formData);
  }

  /**
   * Get preview URL for a processed file
   */
  getPreviewURL(fileId) {
    return `${this.baseURL}/preview/${fileId}`;
  }

  /**
   * Get download URL for a processed file
   */
  getDownloadURL(fileId) {
    return `${this.baseURL}/download/${fileId}`;
  }

  /**
   * Get file information
   */
  async getFileInfo(fileId) {
    return this.get(`/file/${fileId}`);
  }

  /**
   * Delete a processed file
   */
  async deleteFile(fileId) {
    return this.delete(`/file/${fileId}`);
  }

  /**
   * Download a processed file
   */
  async downloadFile(fileId) {
    const response = await this.request(`/download/${fileId}`, {
      method: 'GET',
    });

    // Get filename from Content-Disposition header
    const contentDisposition = response.headers.get('content-disposition');
    let filename = 'vinylfy_audio.wav';

    if (contentDisposition) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
      if (matches != null && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    }

    const blob = await response.blob();
    return { blob, filename };
  }

  /**
   * Validate custom settings
   */
  async validateSettings(settings) {
    return this.post('/validate', { settings });
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    return this.get('/stats');
  }
}

// Create singleton instance
const api = new VinylAPI();

// Export the API instance
export default api;