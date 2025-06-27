const grid = document.getElementById("grid");
const loading = document.getElementById("loading");
const searchInput = document.getElementById("search");

let currentChunk = 0;
const totalChunks = 37;
let loadingChunk = false;
let searchTerm = "";
let searching = false;

// Load a chunk and optionally filter it
async function loadChunk(index) {
  if (index >= totalChunks || loadingChunk) return;
  loadingChunk = true;
  loading.style.display = "block";

  try {
    const res = await fetch(`chunk_${index}.txt`);
    const text = await res.text();
    const lines = text.split("\n").filter(Boolean);

    let filtered = lines;
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = lines.filter(id => id.toLowerCase().includes(lowerSearch));
    }

    for (const id of filtered) {
      const a = document.createElement("a");
      a.href = `https://www.youtube.com/watch?v=${id}`;
      a.target = "_blank";
      a.textContent = id;
      grid.appendChild(a);
    }
  } catch (err) {
    console.error(`Error loading chunk ${index}:`, err);
  }

  loading.style.display = "none";
  currentChunk++;
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
