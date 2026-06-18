const form = document.querySelector("#searchForm");
const aiSearchForm = document.querySelector("#aiSearchForm");
const aiPromptInput = document.querySelector("#aiPrompt");
const aiSearchButton = document.querySelector("#aiSearchButton");
const aiAnswer = document.querySelector("#aiAnswer");
const aiExampleButtons = document.querySelectorAll("[data-ai-prompt]");
const searchTextInput = document.querySelector("#searchText");
const suggestionsBox = document.querySelector("#suggestions");
const toggleFiltersButton = document.querySelector("#toggleFilters");
const filterPanel = document.querySelector("#filterPanel");
const typeFilter = document.querySelector("#typeFilter");
const yearFilter = document.querySelector("#yearFilter");
const clearFiltersButton = document.querySelector("#clearFilters");
const showFavoritesButton = document.querySelector("#showFavorites");
const favoriteCount = document.querySelector("#favoriteCount");
const statusBox = document.querySelector("#status");
const resultsBox = document.querySelector("#results");
const recentStack = document.querySelector("#recentStack");
const browseRows = document.querySelector("#browseRows");
const favoritesPanel = document.querySelector("#favorites");
const favoriteResults = document.querySelector("#favoriteResults");
const modal = document.querySelector("#detailsModal");
const modalContent = document.querySelector("#modalContent");
const quickSearchButtons = document.querySelectorAll("[data-search]");

const homeRows = [
  { id: "topMovies", row: "top", limit: 10 },
  { id: "hindiMovies", row: "hindi", limit: 8 },
  { id: "teluguMovies", row: "telugu", limit: 8 },
  { id: "tamilMovies", row: "tamil", limit: 8 },
  { id: "actionMovies", row: "action", limit: 8 },
  { id: "dramaMovies", row: "drama", limit: 8 },
  { id: "comedyMovies", row: "comedy", limit: 8 },
];

let currentMovies = [];
let suggestionMovies = [];
let suggestionTimer;
let favorites = JSON.parse(localStorage.getItem("movieFavorites") || "[]");

updateFavoriteCount();
showStatus("Search any movie or show.");
loadHomeRows();
loadRecentReleases();

quickSearchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    searchTextInput.value = button.getAttribute("data-search");
    hideSuggestions();
    searchMovies();
    resultsBox.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  hideSuggestions();
  searchMovies();
});

aiSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  getAiRecommendations();
});

aiExampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    aiPromptInput.value = button.dataset.aiPrompt;
    aiPromptInput.focus();
  });
});

toggleFiltersButton.addEventListener("click", () => {
  filterPanel.hidden = !filterPanel.hidden;
});

searchTextInput.addEventListener("input", () => {
  window.clearTimeout(suggestionTimer);
  const query = searchTextInput.value.trim();

  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  suggestionTimer = window.setTimeout(() => {
    loadSuggestions(query);
  }, 280);
});

searchTextInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideSuggestions();
  }
});

suggestionsBox.addEventListener("click", (event) => {
  const item = event.target.closest("[data-suggestion-id]");
  if (!item) {
    return;
  }

  const movie = suggestionMovies.find((result) => result.id === item.dataset.suggestionId);
  if (!movie) {
    return;
  }

  searchTextInput.value = movie.title;
  hideSuggestions();
  searchMovies();
});

typeFilter.addEventListener("change", () => {
  if (searchTextInput.value.trim()) {
    searchMovies();
  }
});

yearFilter.addEventListener("input", () => {
  if (searchTextInput.value.trim()) {
    searchMovies();
  }
});

clearFiltersButton.addEventListener("click", () => {
  searchTextInput.value = "";
  typeFilter.value = "";
  yearFilter.value = "";
  currentMovies = [];
  resultsBox.innerHTML = "";
  hideSuggestions();
  showStatus("Search any movie or show.");
});

showFavoritesButton.addEventListener("click", () => {
  favoritesPanel.hidden = !favoritesPanel.hidden;
  renderFavorites();

  if (!favoritesPanel.hidden) {
    favoritesPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

resultsBox.addEventListener("click", handleCardActions);
recentStack.addEventListener("click", handleCardActions);
browseRows.addEventListener("click", handleCardActions);
favoriteResults.addEventListener("click", handleCardActions);

modal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-modal]")) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("open")) {
    closeModal();
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".field")) {
    hideSuggestions();
  }
});

async function searchMovies() {
  const query = searchTextInput.value.trim();

  if (!query) {
    showStatus("Enter a movie or show name first.", true);
    return;
  }

  renderSkeletons(resultsBox);
  showStatus("Searching TMDB...");

  try {
    currentMovies = await fetchSearchResults(query);

    if (!currentMovies.length) {
      resultsBox.innerHTML = `<div class="empty-state">No titles found. Try another spelling or clear the filters.</div>`;
      showStatus("No matching titles found.", true);
      return;
    }

    renderMovies(resultsBox, currentMovies);
    showStatus(`${currentMovies.length} TMDB result(s) found.`);
  } catch (error) {
    currentMovies = [];
    resultsBox.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    showStatus("Could not search right now.", true);
  }
}

async function getAiRecommendations() {
  const prompt = aiPromptInput.value.trim();

  if (!prompt) {
    showAiAnswer("Tell me what you feel like watching first.", true);
    return;
  }

  aiSearchButton.disabled = true;
  aiSearchButton.querySelector("span:last-child").textContent = "Thinking…";
  showAiAnswer("Finding the best matches in TMDB…");
  renderSkeletons(resultsBox);
  showStatus("Your AI movie concierge is thinking...");

  try {
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "AI recommendations are unavailable right now.");
    }

    currentMovies = data.results || [];
    showAiAnswer(data.message || "Here are some picks based on your request.");

    if (!currentMovies.length) {
      resultsBox.innerHTML = `<div class="empty-state">No matching titles were found. Try a broader request.</div>`;
      showStatus("AI understood the request, but TMDB found no matches.", true);
      return;
    }

    renderMovies(resultsBox, currentMovies);
    showStatus(`${currentMovies.length} AI-curated TMDB pick(s).`);
    resultsBox.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    currentMovies = [];
    resultsBox.innerHTML = "";
    showAiAnswer(error.message, true);
    showStatus("Could not get AI recommendations.", true);
  } finally {
    aiSearchButton.disabled = false;
    aiSearchButton.querySelector("span:last-child").textContent = "Ask AI";
  }
}

function showAiAnswer(message, isError = false) {
  aiAnswer.hidden = false;
  aiAnswer.classList.toggle("error", isError);
  aiAnswer.textContent = message;
}

async function loadSuggestions(query) {
  try {
    suggestionMovies = await fetchSearchResults(query);
    renderSuggestions(suggestionMovies.slice(0, 5));
  } catch (error) {
    hideSuggestions();
  }
}

async function fetchSearchResults(query) {
  const url = createTmdbUrl("search");
  url.searchParams.set("query", query);

  if (typeFilter.value) {
    url.searchParams.set("type", typeFilter.value);
  }

  if (yearFilter.value.trim()) {
    url.searchParams.set("year", yearFilter.value.trim());
  }

  return fetchTmdbResults(url, "Search failed.");
}

async function loadHomeRows() {
  await Promise.all(homeRows.map(async (row) => {
    const container = document.querySelector(`#${row.id}`);
    if (!container) {
      return;
    }

    renderMiniSkeletons(container);

    try {
      const movies = await fetchMoviesForRow(row.row);
      renderMovies(container, movies.slice(0, row.limit), true);
    } catch (error) {
      container.innerHTML = `<div class="empty-state">Could not load this row.</div>`;
    }
  }));
}

async function loadRecentReleases() {
  recentStack.innerHTML = Array.from({ length: 3 }, () => `
    <div class="recent-card skeleton-line"></div>
  `).join("");

  try {
    const movies = await fetchRecentMovies();
    recentStack.innerHTML = movies.slice(0, 3).map(createRecentCard).join("");
  } catch (error) {
    recentStack.innerHTML = `<div class="empty-state dark-state">Recent releases unavailable.</div>`;
  }
}

async function fetchMoviesForRow(row) {
  const url = createTmdbUrl("row");
  url.searchParams.set("row", row);
  return fetchTmdbResults(url, "Row failed.");
}

async function fetchRecentMovies() {
  const url = createTmdbUrl("recent");
  return fetchTmdbResults(url, "Recent releases failed.");
}

async function fetchTmdbResults(url, fallbackMessage) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }

  return data.results || [];
}

function createTmdbUrl(mode) {
  const url = new URL("/api/tmdb", window.location.origin);
  url.searchParams.set("mode", mode);
  return url;
}

function renderSuggestions(movies) {
  if (!movies.length) {
    hideSuggestions();
    return;
  }

  suggestionsBox.innerHTML = movies.map((movie) => `
    <button class="suggestion-item" type="button" data-suggestion-id="${movie.id}">
      <span>${escapeHtml(movie.title)}</span>
      <small>${escapeHtml(movie.year)} · ${escapeHtml(movie.type)}</small>
    </button>
  `).join("");
  suggestionsBox.hidden = false;
}

function hideSuggestions() {
  suggestionsBox.hidden = true;
  suggestionsBox.innerHTML = "";
}

function handleCardActions(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const movieId = button.getAttribute("data-id");

  if (button.dataset.action === "details") {
    openDetails(movieId);
  }

  if (button.dataset.action === "trailer") {
    openTrailer(movieId);
  }

  if (button.dataset.action === "favorite") {
    toggleFavorite(movieId);
  }
}

async function openDetails(movieId) {
  const movie = findMovie(movieId);
  if (!movie) {
    return;
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  modalContent.innerHTML = `<div class="empty-state dark-state">Loading TMDB details...</div>`;

  const details = await fetchDetails(movie);
  modalContent.innerHTML = createDetails({ ...movie, ...details });
}

async function fetchDetails(movie) {
  try {
    const url = createTmdbUrl("details");
    url.searchParams.set("id", movie.id);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return {};
    }

    return data;
  } catch (error) {
    return {};
  }
}

async function openTrailer(movieId) {
  const movie = findMovie(movieId);
  if (!movie) {
    return;
  }

  const details = movie.trailerUrl ? movie : { ...movie, ...(await fetchDetails(movie)) };
  const youtubeUrl = details.trailerUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${movie.title} ${movie.year} official trailer`)}`;
  window.open(youtubeUrl, "_blank", "noopener,noreferrer");
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  modalContent.innerHTML = "";
}

function toggleFavorite(movieId) {
  const movie = findMovie(movieId);
  if (!movie) {
    return;
  }

  if (isFavorite(movieId)) {
    favorites = favorites.filter((item) => item.id !== movieId);
  } else {
    favorites = [movie, ...favorites];
  }

  localStorage.setItem("movieFavorites", JSON.stringify(favorites));
  updateFavoriteCount();
  renderMovies(resultsBox, currentMovies);
  renderFavorites();
}

function updateFavoriteCount() {
  favoriteCount.textContent = favorites.length;
}

function renderFavorites() {
  if (!favorites.length) {
    favoriteResults.innerHTML = `<div class="empty-state">No favorites yet. Save a title from the search results.</div>`;
    return;
  }

  renderMovies(favoriteResults, favorites);
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function renderMovies(container, movies, compact = false) {
  container.innerHTML = movies.map((movie) => createMovieCard(movie, compact)).join("");
}

function renderSkeletons(container) {
  container.innerHTML = Array.from({ length: 6 }, () => `
    <article class="skeleton-card" aria-label="Loading result">
      <div class="skeleton-poster"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
      </div>
    </article>
  `).join("");
}

function renderMiniSkeletons(container) {
  container.innerHTML = Array.from({ length: 6 }, () => `
    <article class="movie-card compact-card">
      <div class="skeleton-poster"></div>
    </article>
  `).join("");
}

function createMovieCard(movie, compact = false) {
  const activeFavorite = isFavorite(movie.id) ? "active" : "";
  const favoriteText = isFavorite(movie.id) ? "Saved" : "Save";
  const poster = movie.poster && movie.poster !== "N/A"
    ? `<img class="poster" src="${movie.poster}" alt="${escapeHtml(movie.title)} poster" loading="lazy" />`
    : `<div class="poster placeholder">No poster available</div>`;

  return `
    <article class="movie-card ${compact ? "compact-card" : ""}" tabindex="0">
      ${poster}
      <div class="movie-body">
        <h2 class="movie-title">${escapeHtml(movie.title)}</h2>
        <p class="movie-meta">${escapeHtml(movie.year)} · ${escapeHtml(movie.type)}</p>
        ${compact ? "" : `<p class="movie-description">View TMDB details, cast, seasons, and trailer links.</p>`}
        <div class="actions">
          <button class="details-button" type="button" data-action="details" data-id="${movie.id}">
            More info
          </button>
          <button class="small-button" type="button" data-action="trailer" data-id="${movie.id}">
            Trailer on YouTube
          </button>
          <button class="small-button favorite-button ${activeFavorite}" type="button" data-action="favorite" data-id="${movie.id}">
            ${favoriteText}
          </button>
        </div>
      </div>
    </article>
  `;
}

function createRecentCard(movie) {
  const poster = movie.poster && movie.poster !== "N/A"
    ? `<img src="${movie.poster}" alt="${escapeHtml(movie.title)} poster" />`
    : `<div class="poster placeholder">No poster</div>`;

  return `
    <article class="recent-card">
      ${poster}
      <div>
        <strong>${escapeHtml(movie.title)}</strong>
        <span>${escapeHtml(movie.year)} · ${escapeHtml(movie.type)}</span>
      </div>
      <button type="button" data-action="details" data-id="${movie.id}">Info</button>
    </article>
  `;
}

function createDetails(movie) {
  const poster = movie.poster && movie.poster !== "N/A"
    ? `<img class="details-poster" src="${movie.poster}" alt="${escapeHtml(movie.title)} poster" />`
    : `<div class="details-poster poster placeholder">No poster available</div>`;
  const seasonsMarkup = movie.type === "series" && Array.isArray(movie.seasons) && movie.seasons.length
    ? `
      <section class="seasons-panel">
        <div class="section-heading compact-heading">
          <p class="eyebrow">Seasons</p>
          <h3>${escapeHtml(movie.seasons.length)} season(s)</h3>
        </div>
        <div id="seasonsContent">${movie.seasons.map(createSeasonBlock).join("")}</div>
      </section>
    `
    : "";

  return `
    <div class="details-layout netflix-details">
      ${poster}
      <div class="details-copy">
        <p class="eyebrow">${escapeHtml(movie.type)}</p>
        <h2 id="modalTitle">${escapeHtml(movie.title)}</h2>
        <div class="badge-row">
          <span class="badge">${escapeHtml(movie.year)}</span>
          <span class="badge">${escapeHtml(movie.rated || "Rating N/A")}</span>
          <span class="badge">${escapeHtml(movie.runtime || "Runtime N/A")}</span>
          <span class="badge">${escapeHtml(movie.genre || movie.type)}</span>
          <span class="badge">TMDB ${escapeHtml(movie.imdbRating || "N/A")}</span>
        </div>
        <p class="plot">${escapeHtml(movie.plot || "Plot details are unavailable for this title.")}</p>
        <div class="actions inline-actions">
          <button class="details-button" type="button" data-action="trailer" data-id="${movie.id}">
            Open trailer on YouTube
          </button>
        </div>
        <div class="fact-grid">
          ${createFact("Director / Creator", movie.director)}
          ${createFact("Actors", movie.actors)}
          ${createFact("Released", movie.released)}
          ${createFact("Language", movie.language)}
        </div>
        ${Array.isArray(movie.actorDetails) && movie.actorDetails.length ? createActorGrid(movie.actorDetails) : ""}
      </div>
    </div>
    ${seasonsMarkup}
  `;
}

function createSeasonBlock(season) {
  return `
    <details class="season-block" open>
      <summary>Season ${escapeHtml(season.season)} · ${escapeHtml(season.episodes)} episode(s)</summary>
      <div class="episode-list">
        <article class="episode-row">
          <div>
            <strong>${escapeHtml(season.title || `Season ${season.season}`)}</strong>
            <span>${escapeHtml(season.released || "Release N/A")}</span>
          </div>
          <small>${escapeHtml(season.episodes)} episodes</small>
        </article>
      </div>
    </details>
  `;
}

function createActorGrid(actors) {
  return `
    <section class="actor-panel">
      <p class="eyebrow">Cast</p>
      <div class="actor-grid">
        ${actors.map((actor) => `
          <article class="actor-card">
            ${actor.image && actor.image !== "N/A" ? `<img src="${actor.image}" alt="${escapeHtml(actor.name)}" />` : `<div class="actor-placeholder"></div>`}
            <strong>${escapeHtml(actor.name)}</strong>
            <span>${escapeHtml(actor.character || "Cast")}</span>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function createFact(label, value) {
  return `
    <div class="fact">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value || "N/A")}</span>
    </div>
  `;
}

function findMovie(movieId) {
  return currentMovies.find((movie) => movie.id === movieId)
    || favorites.find((movie) => movie.id === movieId)
    || findInHomeRows(movieId);
}

function findInHomeRows(movieId) {
  for (const container of document.querySelectorAll(".card-row, #recentStack")) {
    const button = container.querySelector(`[data-id="${CSS.escape(movieId)}"]`);
    if (button) {
      const card = button.closest(".movie-card, .recent-card");
      return {
        id: movieId,
        title: card?.querySelector(".movie-title, strong")?.textContent || "Unknown",
        year: card?.querySelector(".movie-meta, span")?.textContent?.split("·")[0]?.trim() || "N/A",
        type: card?.querySelector(".movie-meta, span")?.textContent?.split("·")[1]?.trim() || "movie",
      };
    }
  }

  return null;
}

function isFavorite(movieId) {
  return favorites.some((movie) => movie.id === movieId);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[char];
  });
}
