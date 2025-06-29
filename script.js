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
        this.preloadAllChunks();
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
        // First search found.txt for priority results
        try {
            const foundResponse = await fetch("found.txt");
            if (foundResponse.ok) {
                const foundText = await foundResponse.text();
                const foundIds = foundText.split("\n").filter(id => id.trim());
                
                for (const id of foundIds) {
                    const trimmedId = id.trim();
                    if (trimmedId.toLowerCase().includes(this.searchTerm) && !seen.has(trimmedId)) {
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
                }
            }
        } catch (error) {
            console.error("Error loading found.txt:", error);
        }

        // Then search all chunks
        const searchPromises = Array.from({ length: this.totalChunks }, async (_, i) => {
            if (this.searchController?.signal.aborted) return 0;
            
            const chunk = await this.loadChunk(i);
            let localMatches = 0;
            
            for (const id of chunk) {
                const trimmedId = id.trim();
                if (trimmedId.toLowerCase().includes(this.searchTerm) && !seen.has(trimmedId)) {
                    seen.add(trimmedId);
                    this.searchResults.push(trimmedId);
                    localMatches++;
                    totalMatches++;
                }
            }

            // Update progress
            const searchedMillion = (i + 1) * 2;
            const matchText = totalMatches === 1 ? "match" : "matches";
            this.updateStats(`Searched ${searchedMillion} million out of 74 million IDs, found ${totalMatches} ${matchText}`);
            
            return localMatches;
        });

        await Promise.allSettled(searchPromises);

        if (this.searchController?.signal.aborted) return;

        // Final display logic
        if (this.searchResults.length === 0) {
            this.noResults.style.display = "block";
            this.loadMoreBtn.style.display = "none";
            this.updateStats("No matches found");
        } else {
            // If we haven't displayed all results yet, show more
            if (this.searchResultIndex < this.searchResults.length) {
                const remainingToShow = Math.min(
                    this.itemsPerLoad - (this.searchResultIndex % this.itemsPerLoad),
                    this.searchResults.length - this.searchResultIndex
                );
                if (remainingToShow > 0) {
                    this.displayItems(this.searchResults.slice(this.searchResultIndex, this.searchResultIndex + remainingToShow));
                    this.searchResultIndex += remainingToShow;
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
            link.textContent = id;
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
}

document.addEventListener("DOMContentLoaded", () => {
    new YouTubeIDFinder();
});


