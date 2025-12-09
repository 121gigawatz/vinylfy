/**
 * Version Loader Module
 * Dynamically loads version from version.json at runtime
 */

class VersionLoader {
    constructor() {
        this.version = 'Loading...';
        this.shortVersion = 'loading';
        this.buildDate = null;
        this.description = null;
        this.dockerTag = null;
        this.loaded = false;
    }

    /**
     * Load version from version.json file
     */
    async load() {
        try {
            const response = await fetch('version.json', {
                cache: 'no-store' // Always get fresh version
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn(`⚠️ version.json returned ${contentType} instead of JSON - likely 404 or server misconfiguration`);
                throw new Error('Invalid content type');
            }

            const versionData = await response.json();

            // Store all version data
            this.version = versionData.version || 'Unknown';
            this.shortVersion = versionData.shortVersion || this.version;
            this.buildDate = versionData.buildDate || null;
            this.description = versionData.description || null;
            this.dockerTag = versionData.dockerTag || this.version;
            this.loaded = true;

            console.log(`📦 Version loaded: ${this.version}`);
            if (this.description) {
                console.log(`📝 ${this.description}`);
            }

            return this.version;
        } catch (error) {
            console.log('ℹ️ Using fallback version (version.json not accessible)');
            // Fallback to default
            this.version = 'dev';
            this.shortVersion = 'dev';
            this.description = 'Development build';
            this.loaded = true;
            return this.version;
        }
    }

    /**
     * Wait for version to be loaded
     */
    async waitForLoad() {
        if (this.loaded) {
            return this.version;
        }

        // Poll until loaded (with timeout)
        let attempts = 0;
        while (!this.loaded && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        return this.version;
    }

    /**
     * Get full version string
     */
    getVersion() {
        return this.version;
    }

    /**
     * Get short version string
     */
    getShortVersion() {
        return this.shortVersion;
    }

    /**
     * Get build date
     */
    getBuildDate() {
        return this.buildDate;
    }

    /**
     * Get description
     */
    getDescription() {
        return this.description;
    }

    /**
     * Get Docker tag
     */
    getDockerTag() {
        return this.dockerTag;
    }

    /**
     * Get all version data
     */
    getAllData() {
        return {
            version: this.version,
            shortVersion: this.shortVersion,
            buildDate: this.buildDate,
            description: this.description,
            dockerTag: this.dockerTag
        };
    }
}

// Create singleton instance and start loading immediately
const versionLoader = new VersionLoader();
versionLoader.load(); // Start loading in background

export default versionLoader;
