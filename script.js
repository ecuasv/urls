class YouTubeIDFinder {
    constructor() {
        this.grid = document.getElementById("grid");
        this.loading = document.getElementById("loading");
        this.searchInput = document.getElementById("search");
        this.stats = document.getElementById("stats");
        this.loadMoreBtn = document.getElementById("loadMoreBtn");
        this.noResults = document.getElementById("noResults");

        this.totalChunks = 37;
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
        this.isPreloaded = false; // Track preload status
        this.displayedIds = new Set(); // Track displayed IDs globally

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialDataAndPreload();
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
    }

    async loadInitialDataAndPreload() {
        this.showLoading(true);
        this.updateStats("Loading initial data and preloading chunks...");
        
        try {
            // Load initial data first
            const chunk = await this.loadChunk(0);
            const itemsToShow = Math.min(this.itemsPerLoad, chunk.length);
            const initialItems = chunk.slice(0, itemsToShow);
            this.displayItems(initialItems);
            this.currentDisplayIndex = itemsToShow;
            
            // Track initially displayed IDs
            initialItems.forEach(id => this.displayedIds.add(id.toLowerCase()));
            
            this.updateLoadMoreButton();
            this.updateStats("Initial data loaded, preloading remaining chunks...");
            
            // Now preload remaining chunks in background
            await this.preloadRemainingChunks();
            
            this.isPreloaded = true;
            this.updateStats(`Loaded ${this.grid.children.length} IDs total - All chunks preloaded`);
        } catch (error) {
            console.error("Error during initialization:", error);
            this.updateStats("Error loading data");
        }
        
        this.showLoading(false);
    }

    async preloadRemainingChunks() {
        const preloadPromises = [];
        // Start from chunk 1 since chunk 0 is already loaded
        for (let i = 1; i < this.totalChunks; i++) {
            preloadPromises.push(this.loadChunk(i));
        }
        await Promise.allSettled(preloadPromises);
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

    async loadMoreData() {
        if (this.isLoading) return;
        this.showLoading(true);

        try {
            const currentChunk = await this.loadChunk(this.currentDisplayChunk);
            if (this.currentDisplayIndex < currentChunk.length) {
                const start = this.currentDisplayIndex;
                const end = Math.min(start + this.itemsPerLoad, currentChunk.length);
                const items = currentChunk.slice(start, end);
                this.displayItems(items);
                items.forEach(id => this.displayedIds.add(id.toLowerCase()));
                this.currentDisplayIndex = end;
            } else {
                this.currentDisplayChunk++;
                this.currentDisplayIndex = 0;
                if (this.currentDisplayChunk < this.totalChunks) {
                    const nextChunk = await this.loadChunk(this.currentDisplayChunk);
                    const itemsToShow = Math.min(this.itemsPerLoad, nextChunk.length);
                    const items = nextChunk.slice(0, itemsToShow);
                    this.displayItems(items);
                    items.forEach(id => this.displayedIds.add(id.toLowerCase()));
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

        if (this.searchController) {
            this.searchController.abort();
        }

        if (!query) {
            this.clearSearch();
            return;
        }

        if (!/^[a-zA-Z0-9\-_]+$/.test(query) || query.length > 11) {
            this.grid.innerHTML = "";
            this.displayedIds.clear();
            this.updateStats("Invalid characters in search");
            this.noResults.style.display = "block";
            this.loadMoreBtn.style.display = "none";
            return;
        }

        this.searchTerm = query.toLowerCase();
        this.searchResults = [];
        this.searchResultIndex = 0;
        this.grid.innerHTML = "";
        this.displayedIds.clear();
        this.noResults.style.display = "none";

        this.searchController = new AbortController();
        
        if (!this.isPreloaded) {
            this.updateStats("Still preloading chunks, search may be slower...");
        }
        
        await this.performSearch();
    }

    async performSearch() {
        this.showLoading(true);
        this.updateStats("Searching...");

        const seen = new Set();
        let totalMatches = 0;

        const searchPromises = Array.from({ length: this.totalChunks }, (_, i) =>
            this.loadChunk(i).then(chunk => {
                if (this.searchController?.signal.aborted) return;

                for (const id of chunk) {
                    const lowerCaseId = id.toLowerCase();
                    if (lowerCaseId.includes(this.searchTerm) && !seen.has(lowerCaseId)) {
                        seen.add(lowerCaseId);
                        this.searchResults.push(id);
                        totalMatches++;
                    }
                }

                const searchedMillion = (i + 1) * 2;
                const matchText = totalMatches === 1 ? "match" : "matches";
                this.updateStats(`Searched ${searchedMillion} million out of 74 million IDs, found ${totalMatches} ${matchText}`);
            })
        );

        await Promise.allSettled(searchPromises);

        if (this.searchController?.signal.aborted) return;

        if (this.searchResults.length === 0) {
            this.noResults.style.display = "block";
            this.loadMoreBtn.style.display = "none";
        } else {
            const initialResults = this.searchResults.slice(0, this.itemsPerLoad);
            this.displayItems(initialResults);
            initialResults.forEach(id => this.displayedIds.add(id.toLowerCase()));
            this.searchResultIndex = this.itemsPerLoad;
            this.updateLoadMoreButton();
        }

        this.showLoading(false);
    }

    loadMoreSearchResults() {
        if (this.searchResultIndex >= this.searchResults.length) return;
        const end = Math.min(this.searchResultIndex + this.itemsPerLoad, this.searchResults.length);
        const items = this.searchResults.slice(this.searchResultIndex, end);
        this.displayItems(items);
        items.forEach(id => this.displayedIds.add(id.toLowerCase()));
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
            link.textContent = id;
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
        this.displayedIds.clear();
        this.noResults.style.display = "none";

        this.currentDisplayChunk = 0;
        this.currentDisplayIndex = 0;
        this.loadInitialDataAndPreload();
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
}

document.addEventListener("DOMContentLoaded", () => {
    new YouTubeIDFinder();
});
