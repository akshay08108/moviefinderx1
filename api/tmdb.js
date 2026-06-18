const imageBaseUrl = "https://image.tmdb.org/t/p/w500";
const backdropBaseUrl = "https://image.tmdb.org/t/p/w780";

export default async function handler(request, response) {
  const apiKey = process.env.TMDB_API_KEY;
  const mode = String(request.query.mode || "").trim();

  if (!apiKey) {
    return response.status(500).json({ error: "Server is missing TMDB_API_KEY." });
  }

  try {
    if (mode === "search") {
      return response.status(200).json({
        results: await searchMulti(apiKey, request.query),
      });
    }

    if (mode === "row") {
      return response.status(200).json({
        results: await getRow(apiKey, request.query),
      });
    }

    if (mode === "recent") {
      return response.status(200).json({
        results: await getRecent(apiKey),
      });
    }

    if (mode === "details") {
      return response.status(200).json(
        await getDetails(apiKey, request.query)
      );
    }

    return response.status(400).json({ error: "Unsupported TMDB mode." });
  } catch (error) {
    return response.status(502).json({ error: error.message || "Could not reach TMDB right now." });
  }
}

async function searchMulti(apiKey, query) {
  const search = String(query.query || "").trim();
  const type = String(query.type || "").trim();
  const year = String(query.year || "").trim();

  if (!search) {
    return [];
  }

  const tmdbUrl = createTmdbUrl(apiKey, "/search/multi");
  tmdbUrl.searchParams.set("query", search);
  tmdbUrl.searchParams.set("include_adult", "false");

  const data = await fetchJson(tmdbUrl);
  return normalizeResults(data.results || [])
    .filter((item) => !type || item.type === normalizeType(type))
    .filter((item) => !year || item.year.includes(year));
}

async function getRow(apiKey, query) {
  const row = String(query.row || "").trim();
  const genreMap = {
    action: "28",
    comedy: "35",
    drama: "18",
  };
  const languageMap = {
    hindi: "hi",
    telugu: "te",
    tamil: "ta",
  };

  if (row === "top") {
    const tmdbUrl = createTmdbUrl(apiKey, "/trending/movie/week");
    const data = await fetchJson(tmdbUrl);
    return normalizeResults(data.results || []);
  }

  const tmdbUrl = createTmdbUrl(apiKey, "/discover/movie");
  tmdbUrl.searchParams.set("sort_by", "popularity.desc");
  tmdbUrl.searchParams.set("include_adult", "false");
  tmdbUrl.searchParams.set("vote_count.gte", "20");

  if (languageMap[row]) {
    tmdbUrl.searchParams.set("with_original_language", languageMap[row]);
  }

  if (genreMap[row]) {
    tmdbUrl.searchParams.set("with_genres", genreMap[row]);
  }

  const data = await fetchJson(tmdbUrl);
  return normalizeResults(data.results || []);
}

async function getRecent(apiKey) {
  const tmdbUrl = createTmdbUrl(apiKey, "/movie/now_playing");
  tmdbUrl.searchParams.set("region", "US");

  const data = await fetchJson(tmdbUrl);
  return normalizeResults(data.results || []).slice(0, 3);
}

async function getDetails(apiKey, query) {
  const { mediaType, tmdbId } = parseTmdbId(query.id);
  const path = mediaType === "series" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const tmdbUrl = createTmdbUrl(apiKey, path);
  tmdbUrl.searchParams.set("append_to_response", "credits,videos,external_ids");

  const data = await fetchJson(tmdbUrl);
  const trailer = (data.videos?.results || []).find((video) =>
    video.site === "YouTube" && video.type === "Trailer"
  ) || (data.videos?.results || []).find((video) => video.site === "YouTube");
  const credits = data.credits?.cast || [];

  return {
    id: `${mediaType}:${data.id}`,
    tmdbId: data.id,
    imdbId: data.imdb_id || data.external_ids?.imdb_id || "",
    title: data.title || data.name,
    year: getYear(data.release_date || data.first_air_date),
    type: mediaType,
    poster: getPoster(data.poster_path),
    backdrop: getBackdrop(data.backdrop_path),
    rated: data.adult ? "Adult" : "General",
    runtime: getRuntime(data, mediaType),
    genre: (data.genres || []).map((genre) => genre.name).join(", "),
    director: getDirector(data, mediaType),
    actors: credits.slice(0, 6).map((person) => person.name).join(", "),
    actorDetails: credits.slice(0, 8).map((person) => ({
      name: person.name,
      character: person.character,
      image: getPoster(person.profile_path),
    })),
    plot: data.overview,
    totalSeasons: data.number_of_seasons,
    imdbRating: data.vote_average ? data.vote_average.toFixed(1) : "N/A",
    released: data.release_date || data.first_air_date || "N/A",
    language: (data.spoken_languages || []).map((language) => language.english_name).join(", "),
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : "",
    seasons: mediaType === "series" ? normalizeTmdbSeasons(data.seasons || []) : [],
  };
}

function createTmdbUrl(apiKey, path) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  return url;
}

async function fetchJson(url) {
  const tmdbResponse = await fetch(url);
  const data = await tmdbResponse.json();

  if (!tmdbResponse.ok) {
    throw new Error(data.status_message || "TMDB request failed.");
  }

  return data;
}

function normalizeResults(results) {
  return results
    .filter((item) => item.media_type !== "person")
    .filter((item) => item.title || item.name)
    .map((item) => {
      const type = normalizeType(item.media_type || (item.name ? "tv" : "movie"));

      return {
        id: `${type}:${item.id}`,
        tmdbId: item.id,
        title: item.title || item.name,
        year: getYear(item.release_date || item.first_air_date),
        type,
        poster: getPoster(item.poster_path),
        backdrop: getBackdrop(item.backdrop_path),
      };
    });
}

function normalizeType(type) {
  if (type === "tv" || type === "series") {
    return "series";
  }

  return "movie";
}

function parseTmdbId(id) {
  const [type, value] = String(id || "").split(":");
  return {
    mediaType: normalizeType(type),
    tmdbId: value,
  };
}

function getYear(date) {
  return date ? String(date).slice(0, 4) : "N/A";
}

function getPoster(path) {
  return path ? `${imageBaseUrl}${path}` : "N/A";
}

function getBackdrop(path) {
  return path ? `${backdropBaseUrl}${path}` : "";
}

function getRuntime(data, mediaType) {
  if (mediaType === "series") {
    return data.episode_run_time?.length ? `${data.episode_run_time[0]} min episodes` : "Runtime N/A";
  }

  return data.runtime ? `${data.runtime} min` : "Runtime N/A";
}

function getDirector(data, mediaType) {
  if (mediaType === "series") {
    return (data.created_by || []).map((person) => person.name).join(", ") || "N/A";
  }

  return (data.credits?.crew || [])
    .filter((person) => person.job === "Director")
    .map((person) => person.name)
    .join(", ") || "N/A";
}

function normalizeTmdbSeasons(seasons) {
  return seasons
    .filter((season) => season.season_number > 0)
    .map((season) => ({
      season: season.season_number,
      title: season.name,
      episodes: season.episode_count,
      released: season.air_date || "N/A",
      poster: getPoster(season.poster_path),
    }));
}
