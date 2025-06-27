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
        // Optimized search with debouncing
        this.searchInput.addEventListener("input", () => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.handleSearch();
            }, 200);
        });
        
        // Load more button
        this.loadMoreBtn.addEventListener("click", () => {
            if (this.searchTerm) {
                this.loadMoreSearchResults();
            } else {
                this.loadMoreData();
            }
        });
        
        // Infinite scroll (backup to load more button)
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
        this.updateStats("Loading initial data...");
        
        try {
            const chunk = await this.loadChunk(0);
            const itemsToShow = Math.min(this.itemsPerLoad, chunk.length);
            
            this.displayItems(chunk.slice(0, itemsToShow));
            this.currentDisplayIndex = itemsToShow;
            
            this.updateStats(`Showing ${itemsToShow} of ${chunk.length} IDs from chunk 0`);
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
                // More items in current chunk
                const start = this.currentDisplayIndex;
                const end = Math.min(start + this.itemsPerLoad, currentChunk.length);
                const newItems = currentChunk.slice(start, end);
                
                this.displayItems(newItems);
                this.currentDisplayIndex = end;
            } else {
                // Move to next chunk
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
        
        // Cancel previous search
        if (this.searchController) {
            this.searchController.abort();
        }
        
        if (!query) {
            this.clearSearch();
            return;
        }
        
        // Validate search query
        if ((!/^[a-zA-Z0-9\-_]+$/.test(query))||(query.length > 11)) {
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
        
        try {
            let totalMatches = 0;
            
            // Search through chunks efficiently
            for (let i = 0; i < this.totalChunks; i++) {
                if (this.searchController?.signal.aborted) break;
                
                const chunk = await this.loadChunk(i);
                const matches = this.searchInChunk(chunk, this.searchTerm);
                
                if (matches.length > 0) {
                    this.searchResults.push(...matches);
                    totalMatches += matches.length;
                    
                    // Display first batch immediately
                    if (i === 0 || this.grid.children.length < this.itemsPerLoad) {
                        const toDisplay = Math.min(
                            this.itemsPerLoad - this.grid.children.length,
                            matches.length
                        );
                        this.displayItems(matches.slice(0, toDisplay));
                        this.searchResultIndex += toDisplay;
                    }
                }
                const searchedMillion = (i + 1) * 2;
                const matchText = totalMatches === 1 ? "match" : "matches";
                this.updateStats(`Searched ${searchedMillion} million out of 74 million IDs, found ${totalMatches} ${matchText}`);
                
                // Small delay to prevent UI blocking
                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
            if (totalMatches === 0) {
                this.noResults.style.display = "block";
                this.loadMoreBtn.style.display = "none";
            } else {
                this.updateLoadMoreButton();
            }
        } catch (error) {
            if (!this.searchController?.signal.aborted) {
                console.error("Search error:", error);
                this.updateStats("Search error occurred");
            }
        }
        
        this.showLoading(false);
    }
    
    // Optimized search using Boyer-Moore-like approach for substring matching
    searchInChunk(chunk, searchTerm) {
        const matches = [];
        const termLength = searchTerm.length;
        
        for (const id of chunk) {
            const lowerID = id.toLowerCase();
            
            // Fast substring search - check if search term exists
            if (lowerID.includes(searchTerm)) {
                matches.push(id);
            }
        }
        
        return matches;
    }
    
    loadMoreSearchResults() {
        if (this.searchResultIndex >= this.searchResults.length) return;
        
        const end = Math.min(
            this.searchResultIndex + this.itemsPerLoad,
            this.searchResults.length
        );
        
        const newItems = this.searchResults.slice(this.searchResultIndex, end);
        this.displayItems(newItems);
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
        
        this.grid.appendChild(fragment);
    }
    
    clearSearch() {
        this.searchTerm = "";
        this.searchResults = [];
        this.searchResultIndex = 0;
        this.grid.innerHTML = "";
        this.noResults.style.display = "none";
        
        // Reset to initial state
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

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
    new YouTubeIDFinder();
});
