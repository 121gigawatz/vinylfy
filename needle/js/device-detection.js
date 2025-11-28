/**
 * Device Detection and Modal Display
 * 
 * CUSTOMIZE MESSAGES HERE:
 * Edit the DEVICE_MESSAGES object below to change the titles and messages
 * shown for different device types.
 */

const DEVICE_MESSAGES = {
    // Message for phones (small screens)
    phone: {
        icon: '📱',
        title: 'Vinylfy Is Best Experienced on Desktop or Tablet',
        message: 'Vinylfy is designed for desktop computers and tablets for the correct experience. Please use a desktop or tablet in landscape mode.'
    },

    // Message for tablets in portrait mode
    tabletPortrait: {
        icon: '<span class="rotate-icon">📱</span>',
        title: 'Please Rotate Your Device',
        message: 'For the best experience, please rotate your tablet to landscape mode to see the full Vinylfy interface.'
    }
};

/**
 * Device Detection Logic
 */
class DeviceDetector {
    constructor() {
        this.modal = document.getElementById('deviceModal');
        this.iconEl = document.getElementById('deviceIcon');
        this.titleEl = document.getElementById('deviceModalTitle');
        this.messageEl = document.getElementById('deviceModalMessage');
        this.dismissBtn = document.getElementById('dismissDeviceModal');

        this.init();
    }

    init() {
        // Check if user has previously dismissed
        if (localStorage.getItem('vinylfy_device_modal_dismissed') === 'true') {
            // If on mobile/tablet but previously dismissed, enforce desktop view
            if (window.innerWidth < 1024) {
                const viewportMeta = document.querySelector('meta[name="viewport"]');
                if (viewportMeta) {
                    viewportMeta.setAttribute('content', 'width=1280');
                }
            }
            return;
        }

        // Check device and show modal if needed
        this.checkDevice();

        // Listen for orientation changes
        window.addEventListener('resize', () => this.checkDevice());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.checkDevice(), 200);
        });

        // Dismiss button handler
        if (this.dismissBtn) {
            this.dismissBtn.addEventListener('click', () => this.dismiss());
        }
    }

    checkDevice() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isPortrait = height > width;

        // Phone detection (width < 768px)
        if (width < 768) {
            this.showModal('phone');
        }
        // Tablet in portrait (768px - 1024px and portrait orientation)
        else if (width >= 768 && width <= 1024 && isPortrait) {
            this.showModal('tabletPortrait');
        }
        // Desktop or tablet landscape - hide modal
        else {
            this.hideModal();
        }
    }

    showModal(deviceType) {
        if (!this.modal || !DEVICE_MESSAGES[deviceType]) return;

        const config = DEVICE_MESSAGES[deviceType];

        // Set content
        this.iconEl.innerHTML = config.icon;
        this.titleEl.textContent = config.title;
        this.messageEl.textContent = config.message;

        // Show modal
        this.modal.classList.remove('hidden');
    }

    hideModal() {
        if (this.modal) {
            this.modal.classList.add('hidden');
        }
    }

    dismiss() {
        // Remember user's choice
        localStorage.setItem('vinylfy_device_modal_dismissed', 'true');

        // Force desktop viewport
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (viewportMeta) {
            viewportMeta.setAttribute('content', 'width=1280');
        }

        this.hideModal();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new DeviceDetector();
    });
} else {
    new DeviceDetector();
}
