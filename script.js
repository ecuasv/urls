class YouTubeIDFinder {
    constructor() {
        this.grid = document.getElementById("grid");
        this.loading = document.getElementById("loading");
        this.searchInput = document.getElementById("search");
        this.stats = document.getElementById("stats");
        this.loadMoreBtn = document.getElementById("loadMoreBtn");
        this.noResults = document.getElementById("noResults");

        this.totalChunks = 39;
        this.chunkCache = new Map();
        this.currentDisplayChunk = 0;
        this.currentDisplayIndex = 0;
        this.itemsPerLoad = 200;
        this.isLoading = false;
        this.searchTerm = "";
        this.searchResults = [];
        this.searchResultIndex = 0;
        this.searchTimeout = null;
        this.searchController = null;
        this.playlistIds = {
            'playlist1.txt': 'PL_KtqxTCaHT6yYy5POQ8EqmtTQqctG9dh',
            'playlist2.txt': 'PL_KtqxTCaHT5by5xMzIlrSVksZiSB_69Z',
            'playlist3.txt': 'PL_KtqxTCaHT48V5Q3S_LTVPPC2Mz_7ikN'
        };
        // Sidebar properties
        this.sidebar = document.getElementById("sidebar");
        this.sidebarToggle = document.getElementById("sidebarToggle");
        this.filterButtons = document.getElementById("filterButtons");
        this.clearFilterBtn = document.getElementById("clearFilter");
        this.activeFilter = null;
        this.filterFiles = ['playlist1.txt', 'playlist2.txt', 'playlist3.txt', '10num.txt', 'upper.txt', 'lower.txt', '9w.txt', '8s.txt', '7s.txt', '6s.txt', '6+5s.txt', '6+4s.txt', '6+3s.txt', '6+3+2s.txt', '5+5s.txt', '5+4s.txt', '5+3+3s.txt', '5+2+2+2s.txt', '4+4+3s.txt'];
        this.init();
    }

    detectDeviceClass() {
        const ua = navigator.userAgent;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
        return isMobile ? "mobile" : "desktop";
    }

    init() {
        this.deviceClass = this.detectDeviceClass();
        
        // Both mobile and desktop now start in limited mode by default
        this.limitedMode = true;
        this.allowedChunks = [-1]; // Only search found.txt initially
        
        if (this.deviceClass === "mobile") {
            this.itemsPerLoad = 50;
        } else {
            this.itemsPerLoad = 200;
        }

        this.setupEventListeners();
        this.loadInitialData();
        this.setupExpandSearchButton(); // Changed from setupLimitSearchButton
        this.setupClearSearchButton();
        this.preloadChunks();
    }

    setupExpandSearchButton() {
        this.expandSearchBtn = document.getElementById("limitSearchBtn"); // Reuse the same button element
        
        if (this.deviceClass === "desktop") {
            this.expandSearchBtn.style.display = "block";
            this.expandSearchBtn.style.padding = "10px 16px";
            this.expandSearchBtn.style.fontSize = "14px";
            this.expandSearchBtn.style.marginBottom = "15px";
            
            // Change button text and functionality
            this.expandSearchBtn.textContent = "Search All 78 Million IDs";
            this.expandSearchBtn.title = "Expand search to include all YouTube IDs (uses more bandwidth)";
            
            this.expandSearchBtn.addEventListener("click", () => {
                this.allowedChunks = [-1, ...Array.from({ length: this.totalChunks }, (_, i) => i)];
                this.limitedMode = false;
                this.preloadAllChunks(); // Preload all chunks now
                this.clearSearch();
                this.updateStats("Full search mode activated: searching all 78 million IDs");
                this.expandSearchBtn.style.display = "none"; // Hide button after use
            });
        }
    }

    async preloadAllChunks() {
        // Preload all chunks when user expands search
        const preloadPromises = [];
        for (let i = 0; i < this.totalChunks; i++) {
            preloadPromises.push(this.loadChunk(i));
        }
        await Promise.allSettled(preloadPromises);
    }

    setupClearSearchButton() {
        // Create clear search button
        const clearSearchBtn = document.createElement("button");
        clearSearchBtn.id = "clearSearchBtn";
        clearSearchBtn.textContent = "Clear";
        clearSearchBtn.style.display = "none";
        clearSearchBtn.style.marginLeft = "10px";
        clearSearchBtn.style.padding = "8px 12px";
        clearSearchBtn.style.background = "#dc3545";
        clearSearchBtn.style.color = "white";
        clearSearchBtn.style.border = "none";
        clearSearchBtn.style.borderRadius = "4px";
        clearSearchBtn.style.cursor = "pointer";
        clearSearchBtn.style.fontSize = "14px";
        clearSearchBtn.style.verticalAlign = "top";
        
        // Add the button after the search container
        const searchContainer = document.querySelector(".search-container");
        searchContainer.style.display = "flex";
        searchContainer.style.alignItems = "center";
        searchContainer.appendChild(clearSearchBtn);

        clearSearchBtn.addEventListener("click", () => {
            this.searchInput.value = "";
            this.clearSearch();
            clearSearchBtn.style.display = "none";
        });

        clearSearchBtn.addEventListener("mouseover", () => {
            clearSearchBtn.style.background = "#c82333";
        });

        clearSearchBtn.addEventListener("mouseout", () => {
            clearSearchBtn.style.background = "#dc3545";
        });

        // Show/hide clear button based on search input
        this.searchInput.addEventListener("input", () => {
            clearSearchBtn.style.display = this.searchInput.value.trim() ? "block" : "none";
        });
    }

    setupEventListeners() {
        this.searchInput.addEventListener("input", () => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.handleSearch();
            }, 300);
        });

        this.loadMoreBtn.addEventListener("click", () => {
            if (this.searchTerm) {
                this.loadMoreSearchResults();
            } else {
                this.loadMoreData();
            }
        });

        window.addEventListener("scroll", () => {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
                if (!this.isLoading && this.loadMoreBtn.style.display !== "none") {
                    this.loadMoreBtn.click();
                }
            }
        });

        // Sidebar functionality
        this.sidebarToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleSidebar();
        });
        this.clearFilterBtn.addEventListener("click", () => {
            this.clearFilter();
        });
        document.addEventListener("click", (e) => {
            this.handleClickOutside(e);
        });
        this.sidebar.addEventListener("click", (e) => {
            e.stopPropagation();
        });
        this.createFilterButtons();
    }

    handleClickOutside(event) {
        if (!this.sidebar.classList.contains("open")) return;
        if (!this.sidebar.contains(event.target) && 
            !this.sidebarToggle.contains(event.target)) {
            this.closeSidebar();
        }
    }

    async loadChunk(chunkIndex) {
        if (this.chunkCache.has(chunkIndex)) {
            return this.chunkCache.get(chunkIndex);
        }

        try {
            const response = await fetch(`chunk_${chunkIndex}.txt`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const text = await response.text();
            const ids = text.split("\n").filter(id => id.trim());
            this.chunkCache.set(chunkIndex, ids);
            return ids;
        } catch (error) {
            console.error(`Error loading chunk ${chunkIndex}:`, error);
            return [];
        }
    }

    async preloadChunks() {
        // Always preload found.txt and filter files
        try {
            const response = await fetch("found.txt");
            if (response.ok) {
                const text = await response.text();
                const ids = text.split("\n").filter(id => id.trim());
                this.chunkCache.set(-1, ids);
            }
        } catch (err) {
            console.error("Error preloading found.txt:", err);
        }
        
        const filterPreloadPromises = this.filterFiles.map(async (filename) => {
            try {
                const response = await fetch(filename);
                if (response.ok) {
                    const text = await response.text();
                    const ids = text.split("\n").filter(id => id.trim());
                    this.chunkCache.set(`filter_${filename}`, ids);
                }
            } catch (err) {
                console.error(`Error preloading filter ${filename}:`, err);
            }
        });
        await Promise.allSettled(filterPreloadPromises);
        
        // Don't preload all chunks by default anymore
        // Only preload when user expands search
    }

    clearChunkCache() {
        // Keep only found.txt and filter data in cache, clear everything else
        const foundData = this.chunkCache.get(-1);
        const filterData = new Map();
        
        // Preserve filter data
        for (const [key, value] of this.chunkCache.entries()) {
            if (key.toString().startsWith('filter_')) {
                filterData.set(key, value);
            }
        }
        
        this.chunkCache.clear();
        if (foundData) {
            this.chunkCache.set(-1, foundData);
        }
        
        // Restore filter data
        for (const [key, value] of filterData.entries()) {
            this.chunkCache.set(key, value);
        }
    }

    async loadInitialData() {
        this.showLoading(true);
        try {
            const initialDataEl = document.getElementById("initial-ids");
            let initialIds = [];
            if (initialDataEl) {
                initialIds = JSON.parse(initialDataEl.textContent);
            }
            const itemsToShow = Math.min(this.itemsPerLoad, initialIds.length);
            this.displayItems(initialIds.slice(0, itemsToShow));
            this.currentDisplayIndex = itemsToShow;
            this.updateLoadMoreButton();
            this.initialLoaded = true;
            
            // Update stats to reflect limited mode
            this.updateStats("Showing known words only - click 'Search All 78 Million IDs' to expand");
        } catch (error) {
            console.error("Error loading initial data:", error);
            this.updateStats("Error loading data");
        }
        this.showLoading(false);
    }

    async loadMoreData() {
        if (this.isLoading) return;
        this.showLoading(true);

        try {
            const currentChunk = await this.loadChunk(this.currentDisplayChunk);
            if (this.currentDisplayIndex < currentChunk.length) {
                const start = this.currentDisplayIndex;
                const end = Math.min(start + this.itemsPerLoad, currentChunk.length);
                this.displayItems(currentChunk.slice(start, end));
                this.currentDisplayIndex = end;
            } else {
                this.currentDisplayChunk++;
                this.currentDisplayIndex = 0;
                if (this.currentDisplayChunk < this.totalChunks) {
                    const nextChunk = await this.loadChunk(this.currentDisplayChunk);
                    const itemsToShow = Math.min(this.itemsPerLoad, nextChunk.length);
                    this.displayItems(nextChunk.slice(0, itemsToShow));
                    this.currentDisplayIndex = itemsToShow;
                }
            }

            this.updateStats(`Loaded ${this.grid.children.length} IDs total`);
            this.updateLoadMoreButton();
        } catch (error) {
            console.error("Error loading more data:", error);
        }

        this.showLoading(false);
    }

    async handleSearch() {
        const query = this.searchInput.value.trim();

        // Clear any active filter when searching
        if (this.activeFilter) {
            this.clearFilter();
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.searchController) {
            this.searchController.abort();
        }

        if (!query) {
            this.clearSearch();
            return;
        }

        if (!/^[a-zA-Z0-9\-_]+$/.test(query) || query.length > 11) {
            this.grid.innerHTML = "";
            this.updateStats("Invalid characters in search");
            this.noResults.style.display = "block";
            this.loadMoreBtn.style.display = "none";
            return;
        }

        this.searchTerm = query.toLowerCase();
        this.searchResults = [];
        this.searchResultIndex = 0;
        this.grid.innerHTML = "";
        this.noResults.style.display = "none";

        this.searchController = new AbortController();
        await this.performSearch();
    }

    async performSearch() {
        this.showLoading(true);
        this.updateStats("Searching...");

        const seen = new Set();
        let totalMatches = 0;
        let chunksCompleted = 0;

        const displayBatch = (matches) => {
            const newItems = matches.slice(0, this.itemsPerLoad - this.grid.children.length);
            if (newItems.length > 0) {
                this.displayItems(newItems);
                this.searchResultIndex += newItems.length;
            }
        };

        for (const chunkIndex of this.allowedChunks) {
            const promise = chunkIndex === -1
                ? Promise.resolve(this.chunkCache.get(-1) || [])
                : this.loadChunk(chunkIndex);

            promise.then(chunk => {
                if (this.searchController?.signal.aborted) return;

                const localMatches = [];
                for (const id of chunk) {
                    if (id.toLowerCase().includes(this.searchTerm) && !seen.has(id)) {
                        seen.add(id);
                        this.searchResults.push(id);
                        localMatches.push(id);
                        totalMatches++;
                    }
                }

                displayBatch(localMatches);

                if (chunkIndex >= 0) {
                    const searchedMillion = (chunkIndex + 1) * 2;
                    const matchText = totalMatches === 1 ? "match" : "matches";
                    this.updateStats(`Searched ${searchedMillion} million out of 78 million IDs, found ${totalMatches} ${matchText}`);
                } else if (chunkIndex === -1) {
                    const matchText = totalMatches === 1 ? "match" : "matches";
                    const modeText = this.limitedMode ? " (limited mode - click 'Search All 78 Million IDs' to expand)" : "";
                    this.updateStats(`Searched known words only, found ${totalMatches} ${matchText}${modeText}`);
                }

                chunksCompleted++;
                if (chunksCompleted === this.allowedChunks.length && !this.searchController?.signal.aborted) {
                    if (totalMatches === 0) {
                        this.noResults.style.display = "block";
                        this.loadMoreBtn.style.display = "none";
                    } else {
                        this.updateLoadMoreButton();
                    }
                    this.showLoading(false);
                }
            }).catch(err => {
                console.error(`Error loading chunk ${chunkIndex}:`, err);
            });
        }
    }

    loadMoreSearchResults() {
        if (this.searchResultIndex >= this.searchResults.length) return;
        const end = Math.min(this.searchResultIndex + this.itemsPerLoad, this.searchResults.length);
        this.displayItems(this.searchResults.slice(this.searchResultIndex, end));
        this.searchResultIndex = end;
        this.updateStats(`Showing ${this.searchResultIndex} of ${this.searchResults.length} search results`);
        this.updateLoadMoreButton();
    }

    displayItems(items, playlistId = null) {
        const fragment = document.createDocumentFragment();
        for (const id of items) {
            const link = document.createElement("a");
            
            if (playlistId) {
                link.href = `https://www.youtube.com/watch?v=${id}&list=${playlistId}`;
            } else {
                link.href = `https://www.youtube.com/watch?v=${id}`;
            }
            
            link.target = "_blank";
            link.innerHTML = this.highlightMatch(id);
            link.rel = "noopener noreferrer";
            fragment.appendChild(link);
        }
        requestAnimationFrame(() => {
            this.grid.appendChild(fragment);
        });
    }

    clearSearch() {
        this.searchTerm = "";
        this.searchResults = [];
        this.searchResultIndex = 0;
        this.grid.innerHTML = "";
        this.noResults.style.display = "none";

        this.currentDisplayChunk = 0;
        this.currentDisplayIndex = 0;
        this.loadInitialData();
    }

    updateLoadMoreButton() {
        const hasMore = this.searchTerm
            ? this.searchResultIndex < this.searchResults.length
            : this.currentDisplayChunk < this.totalChunks - 1 ||
              this.currentDisplayIndex < (this.chunkCache.get(this.currentDisplayChunk)?.length || 0);

        this.loadMoreBtn.style.display = hasMore ? "block" : "none";
        this.loadMoreBtn.disabled = this.isLoading;
    }

    showLoading(show) {
        this.isLoading = show;
        this.loading.style.display = show ? "block" : "none";
        this.loadMoreBtn.disabled = show;
    }

    updateStats(message) {
        this.stats.textContent = message;
    }

    highlightMatch(id) {
        if (!this.searchTerm) return id;
        const escaped = this.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'ig');
        return id.replace(regex, '<mark>$1</mark>');
    }

    // Sidebar methods
    toggleSidebar() {
        if (this.sidebar.classList.contains("open")) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }

    openSidebar() {
        this.sidebar.classList.add("open");
        this.createOverlay();
    }

    closeSidebar() {
        this.sidebar.classList.remove("open");
        this.removeOverlay();
    }

    createFilterButtons() {
        const filterDisplayNames = {
            'playlist1.txt': 'IDs related to the video itself',
            'playlist2.txt': 'selected 7+ letters', 
            'playlist3.txt': 'selected 6 letters',
            '10num.txt': '10 numbers',
            'upper.txt': 'ALL UPPERCASE',
            'lower.txt': 'all lowercase',
            '9w.txt': '9 letter words',
            '8s.txt': '8 letter words',
            '7s.txt': '7 letter words',
            '6s.txt': '6 letter words',
            '6+5s.txt': '6+5 letter words',
            '6+4s.txt': '6+4 letter words',
            '6+3s.txt': '6+3 letter words',
            '6+3+2s.txt': '6+3+2 letter words',
            '5+5s.txt': '5+5 letter words',
            '5+4s.txt': '5+4 letter words',
            '5+3+3s.txt': '5+3+3 letter words',
            '5+2+2+2s.txt': '5+2+2+2 letter words',
            '4+4+3s.txt': '4+4+3 letter words'
        };

        this.filterFiles.forEach(filename => {
            const button = document.createElement("button");
            button.className = "filter-button";
            button.textContent = filterDisplayNames[filename] || filename.replace('.txt', '');
            button.addEventListener("click", () => {
                this.loadFilter(filename, button);
            });
            this.filterButtons.appendChild(button);
        });
    }

    async loadFilter(filename, buttonElement) {
        if (this.isLoading) return;
        
        document.querySelectorAll('.filter-button').forEach(btn => {
            btn.classList.remove('active');
        });
        buttonElement.classList.add('active');
        
        this.activeFilter = filename;
        this.showLoading(true);
        this.updateStats(`Loading filter: ${filename.replace('.txt', '')}...`);
        
        try {
            const response = await fetch(filename);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const text = await response.text();
            const ids = text.split("\n").filter(line => line.trim());
            this.grid.innerHTML = "";
            
            const playlistId = this.playlistIds[filename];
            this.displayItems(ids, playlistId);
            
            this.updateStats(`Showing ${ids.length} IDs`);
            this.loadMoreBtn.style.display = "none";
            this.noResults.style.display = ids.length === 0 ? "block" : "none";
            
            if (window.innerWidth <= 768) {
                this.sidebar.classList.remove("open");
            }
            
        } catch (error) {
            console.error(`Error loading filter ${filename}:`, error);
            this.updateStats(`Error loading filter: ${filename.replace('.txt', '')}`);
        }
        
        this.showLoading(false);
    }

    clearFilter() {
        this.activeFilter = null;
        document.querySelectorAll('.filter-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        this.grid.innerHTML = "";
        this.currentDisplayChunk = 0;
        this.currentDisplayIndex = 0;
        this.loadInitialData();
        
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
    }

    createOverlay() {
        // Implementation for overlay if needed
    }

    removeOverlay() {
        // Implementation for overlay removal if needed
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new YouTubeIDFinder();
});
