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

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialData();
    }

    setupEventListeners() {
        this.searchInput.addEventListener("input", () => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.handleSearch();
            }, 200);
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

    async loadInitialData() {
        this.showLoading(true);
        try {
            const chunk = await this.loadChunk(0);
            const itemsToShow = Math.min(this.itemsPerLoad, chunk.length);
            this.displayItems(chunk.slice(0, itemsToShow));
            this.currentDisplayIndex = itemsToShow;
            this.updateLoadMoreButton();
        } catch (error) {
            console.error("Error loading initial data:", error);
            this.updateStats("Error loading data");
        }
        this.showLoading(false);

        // Start background preloading after slight delay
        setTimeout(() => {
            this.preloadAllChunks();
        }, 3000);
    }

    async preloadAllChunks() {
        for (let i = 0; i < this.totalChunks; i++) {
            await this.loadChunk(i);
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        this.updateStats("All chunks preloaded for faster searching.");
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
        const batchSize = 5;

        for (let i = 0; i < this.totalChunks; i += batchSize) {
            const batch = [];

            for (let j = i; j < Math.min(i + batchSize, this.totalChunks); j++) {
                batch.push(
                    this.loadChunk(j).then(chunk => {
                        for (const id of chunk) {
                            if (id.toLowerCase().includes(this.searchTerm) && !seen.has(id)) {
                                seen.add(id);
                                this.searchResults.push(id);
                                totalMatches++;
                            }
                        }
                    })
                );
            }

            await Promise.allSettled(batch);

            const searchedMillion = Math.min(i + batchSize, this.totalChunks) * 2;
            this.updateStats(`Searched ${searchedMillion} million out of 74 million IDs, found ${totalMatches} matches`);

            await new Promise(resolve => setTimeout(resolve, 10));
        }

        if (!this.searchController?.signal.aborted) {
            if (this.searchResults.length === 0) {
                this.noResults.style.display = "block";
                this.loadMoreBtn.style.display = "none";
            } else {
                this.displayItems(this.searchResults.slice(0, this.itemsPerLoad));
                this.searchResultIndex = this.itemsPerLoad;
                this.updateLoadMoreButton();
            }
        }

        this.showLoading(false);
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
}

document.addEventListener("DOMContentLoaded", () => {
    new YouTubeIDFinder();
});
