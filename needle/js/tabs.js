/**
 * Tab Management for Vinylfy
 * Handles tab switching, state persistence, and accessibility
 */

class TabManager {
    constructor() {
        this.tabs = document.querySelectorAll('.tab-button');
        this.tabPanels = document.querySelectorAll('.tab-content');
        this.currentTab = 'home';

        this.init();
    }

    init() {
        // Set up tab click handlers
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Handle URL hash for deep linking
        this.handleHashChange();
        window.addEventListener('hashchange', () => this.handleHashChange());

        // Restore last active tab from session storage
        const lastTab = sessionStorage.getItem('vinylfy-active-tab');
        if (lastTab && !window.location.hash) {
            this.switchTab(lastTab);
        }
    }

    switchTab(tabName) {
        if (this.currentTab === tabName) return;

        // Deactivate all tabs and panels
        this.tabs.forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });

        this.tabPanels.forEach(panel => {
            panel.classList.remove('active');
        });

        // Activate selected tab and panel
        const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
        const selectedPanel = document.getElementById(`tab-${tabName}`);

        if (selectedTab && selectedPanel) {
            selectedTab.classList.add('active');
            selectedTab.setAttribute('aria-selected', 'true');
            selectedPanel.classList.add('active');

            this.currentTab = tabName;

            // Save to session storage
            sessionStorage.setItem('vinylfy-active-tab', tabName);

            // Update URL hash
            history.replaceState(null, null, `#${tabName}`);

            // Emit custom event for other components
            window.dispatchEvent(new CustomEvent('tabChange', {
                detail: { tabName }
            }));
        }
    }

    handleHashChange() {
        const hash = window.location.hash.slice(1);
        if (hash && document.getElementById(`tab-${hash}`)) {
            this.switchTab(hash);
        }
    }
}

// Initialize tab manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new TabManager();
    });
} else {
    new TabManager();
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TabManager;
}
