const grid = document.getElementById("grid");
const loading = document.getElementById("loading");
const searchInput = document.getElementById("search");

let currentChunk = 0;
const totalChunks = 37;
let loadingChunk = false;
let searchTerm = "";
let searching = false;

let chunkCache = {}; // cache parsed lines
let chunkDisplayIndex = {}; // track display progress per chunk

async function loadChunk(index, batchSize = 300) {
  if (index >= totalChunks || loadingChunk) return;
  loadingChunk = true;
  loading.style.display = "block";

  try {
    // Load and cache chunk if not yet done
    if (!chunkCache[index]) {
      const res = await fetch(`chunk_${index}.txt`);
      const text = await res.text();
      chunkCache[index] = text.split("\n").filter(Boolean);
      chunkDisplayIndex[index] = 0;
    }

    // Filter and display a batch
    const lines = chunkCache[index];
    const start = chunkDisplayIndex[index];
    const end = start + batchSize;

    let batch = lines.slice(start, end);
    chunkDisplayIndex[index] = end;

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      batch = batch.filter(id => id.toLowerCase().includes(lowerSearch));
    }

    for (const id of batch) {
      const a = document.createElement("a");
      a.href = `https://www.youtube.com/watch?v=${id}`;
      a.target = "_blank";
      a.textContent = id;
      grid.appendChild(a);
    }

    // If more in this chunk to display, keep it current
    if (chunkDisplayIndex[index] < chunkCache[index].length) {
      currentChunk = index; // don't increment yet
    } else {
      currentChunk = index + 1;
    }

  } catch (err) {
    console.error(`Error loading chunk ${index}:`, err);
  }

  loading.style.display = "none";
  loadingChunk = false;
}

// Infinite scroll trigger
window.addEventListener("scroll", () => {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) {
    if (!searchTerm) loadChunk(currentChunk);
  }
});

// Throttled search
let searchTimeout = null;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchTerm = searchInput.value.trim();
    
        const validPattern = /^[a-zA-Z0-9\-_]+$/;
    if (searchTerm && !validPattern.test(searchTerm)) {
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = "";
    currentChunk = 0;
    searching = !!searchTerm;
    loadAllChunksSlowly();
  }, 300); // throttle delay
});

// Search loads all chunks, but slowly
async function loadAllChunksSlowly() {
  for (let i = 0; i < totalChunks; i++) {
    await loadChunk(i);
    await new Promise(resolve => setTimeout(resolve, 50)); // slow it down
  }
}

// Initial load
loadChunk(currentChunk);
