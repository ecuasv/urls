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
        this.limitedMode = false; // Track if we're in limited mode
        
        if (this.deviceClass === "mobile") {
            // On mobile, only search found.txt
            this.allowedChunks = [-1];
            this.itemsPerLoad = 50;
            this.limitedMode = true;
        } else {
            // On desktop, search all chunks by default
            this.allowedChunks = [-1, ...Array.from({ length: this.totalChunks }, (_, i) => i)];
            this.itemsPerLoad = 200;
        }

        this.setupEventListeners();
        this.loadInitialData();
        this.setupLimitSearchButton();
        this.setupClearSearchButton();
        this.preloadChunks(); // Only preload what we need
    }

    setupLimitSearchButton() {
        this.limitSearchBtn = document.getElementById("limitSearchBtn");

        if (this.deviceClass === "desktop") {
            this.limitSearchBtn.style.display = "block";
            this.limitSearchBtn.style.padding = "10px 16px";
            this.limitSearchBtn.style.fontSize = "14px";
            this.limitSearchBtn.style.marginBottom = "15px";
            this.limitSearchBtn.addEventListener("click", () => {
                this.allowedChunks = [-1]; // Only search found.txt
                this.limitedMode = true;
                this.clearChunkCache(); // Clear memory of other chunks
                this.clearSearch();
                this.updateStats("Limited search mode activated: searching only known words");
                this.limitSearchBtn.style.display = "none"; // Hide button after use
            });
        }
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
        this.sidebarToggle.addEventListener("click", () => {
            this.toggleSidebar();
        });

        this.clearFilterBtn.addEventListener("click", () => {
            this.clearFilter();
        });

        // Create filter buttons
        this.createFilterButtons();
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
        // Always preload found.txt
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

        // Only preload other chunks if not in limited mode
        if (!this.limitedMode) {
            const preloadPromises = [];
            for (let i = 0; i < this.totalChunks; i++) {
                preloadPromises.push(this.loadChunk(i));
            }
            await Promise.allSettled(preloadPromises);
        }
    }

    clearChunkCache() {
        // Keep only found.txt in cache, clear everything else
        const foundData = this.chunkCache.get(-1);
        this.chunkCache.clear();
        if (foundData) {
            this.chunkCache.set(-1, foundData);
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
            // Small delay to let clear filter complete
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

        // Use allowedChunks instead of all chunks
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
                    // Searching only found.txt
                    const matchText = totalMatches === 1 ? "match" : "matches";
                    this.updateStats(`Searched known words only, found ${totalMatches} ${matchText}`);
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

    displayItems(items) {
        const fragment = document.createDocumentFragment();
        for (const id of items) {
            const link = document.createElement("a");
            link.href = `https://www.youtube.com/watch?v=${id}`;
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
        const escaped = this.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\    highlightMatch(id) {
        if (!this.searchTerm) return id;
        const escaped = this.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'ig');
        return id.replace(regex, '<mark>$1</mark>');
    }');
        const regex = new RegExp(`(${escaped})`, 'ig');
        return id.replace(regex, '<mark>$1</mark>');
    }

    // Sidebar methods
    toggleSidebar() {
        this.sidebar.classList.toggle("open");
    }

    createFilterButtons() {
        this.filterFiles.forEach(filename => {
            const button = document.createElement("button");
            button.className = "filter-button";
            button.textContent = filename.replace('.txt', '');
            button.addEventListener("click", () => {
                this.loadFilter(filename, button);
            });
            this.filterButtons.appendChild(button);
        });
    }

    async loadFilter(filename, buttonElement) {
        if (this.isLoading) return;
        
        // Update active filter button
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
            const lines = text.split("\n").filter(line => line.trim());
            
            // Extract video IDs from full URLs
            const ids = lines.map(line => {
                const match = line.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                return match ? match[1] : null;
            }).filter(id => id !== null);
            
            // Clear grid and display filtered IDs
            this.grid.innerHTML = "";
            this.displayItems(ids);
            
            this.updateStats(`Showing ${ids.length} IDs from ${filename.replace('.txt', '')}`);
            this.loadMoreBtn.style.display = "none"; // No load more for filters
            this.noResults.style.display = ids.length === 0 ? "block" : "none";
            
            // Close sidebar on mobile
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
        
        // Return to normal browsing mode
        this.grid.innerHTML = "";
        this.currentDisplayChunk = 0;
        this.currentDisplayIndex = 0;
        this.loadInitialData();
        
        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            this.sidebar.classList.remove("open");
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new YouTubeIDFinder();
});
