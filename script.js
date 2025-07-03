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
        this.foundCache = null; // Cache for found.txt
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
        this.preloadAllChunks();
        this.preloadFoundFile();
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

    async preloadFoundFile() {
        try {
            const response = await fetch("found.txt");
            if (response.ok) {
                const text = await response.text();
                this.foundCache = text.split("\n").filter(id => id.trim());
            }
        } catch (error) {
            console.error("Error preloading found.txt:", error);
            this.foundCache = [];
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

    async preloadAllChunks() {
        const preloadPromises = [];
        for (let i = 0; i < this.totalChunks; i++) {
            preloadPromises.push(this.loadChunk(i));
        }
        await Promise.allSettled(preloadPromises);
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

        try {
            // First, search found.txt (priority results)
            if (this.foundCache) {
                for (const id of this.foundCache) {
                    const trimmedId = id.trim();
                    if (trimmedId && trimmedId.toLowerCase().includes(this.searchTerm) && !seen.has(trimmedId)) {
                        seen.add(trimmedId);
                        this.searchResults.push(trimmedId);
                        totalMatches++;
                    }
                }

                // Display priority results immediately
                if (this.searchResults.length > 0) {
                    const initialDisplay = this.searchResults.slice(0, this.itemsPerLoad);
                    this.displayItems(initialDisplay);
                    this.searchResultIndex = initialDisplay.length;
                    this.updateStats(`Found ${totalMatches} priority matches, searching remaining...`);
                }
            }

            if (this.searchController?.signal.aborted) return;

            // Then search all chunks
            let chunksSearched = 0;
            const searchPromises = Array.from({ length: this.totalChunks }, async (_, i) => {
                if (this.searchController?.signal.aborted) return;
                
                const chunk = await this.loadChunk(i);
                
                for (const id of chunk) {
                    const trimmedId = id.trim();
                    if (trimmedId && trimmedId.toLowerCase().includes(this.searchTerm) && !seen.has(trimmedId)) {
                        seen.add(trimmedId);
                        this.searchResults.push(trimmedId);
                        totalMatches++;
                    }
                }

                chunksSearched++;
                const searchedMillion = chunksSearched * 2;
                const matchText = totalMatches === 1 ? "match" : "matches";
                this.updateStats(`Searched ${searchedMillion} million out of 78 million IDs, found ${totalMatches} ${matchText}`);
            });

            await Promise.allSettled(searchPromises);

            if (this.searchController?.signal.aborted) return;

            // Final results handling
            if (this.searchResults.length === 0) {
                this.noResults.style.display = "block";
                this.loadMoreBtn.style.display = "none";
                this.updateStats("No matches found");
            } else {
                // Display any remaining results up to itemsPerLoad
                if (this.searchResultIndex < this.searchResults.length) {
                    const remainingSlots = this.itemsPerLoad - this.searchResultIndex;
                    if (remainingSlots > 0) {
                        const additionalItems = this.searchResults.slice(
                            this.searchResultIndex, 
                            this.searchResultIndex + remainingSlots
                        );
                        if (additionalItems.length > 0) {
                            this.displayItems(additionalItems);
                            this.searchResultIndex += additionalItems.length;
                        }
                    }
                }
                
                this.updateStats(`Found ${this.searchResults.length} total matches`);
                this.updateLoadMoreButton();
            }

        } catch (error) {
            console.error("Search error:", error);
            this.updateStats("Search error occurred");
        } finally {
            this.showLoading(false);
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
        if (this.searchController) {
            this.searchController.abort();
        }
        
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
}

document.addEventListener("DOMContentLoaded", () => {
    new YouTubeIDFinder();
});

