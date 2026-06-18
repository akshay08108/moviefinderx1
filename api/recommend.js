const imageBaseUrl = "https://image.tmdb.org/t/p/w500";
const backdropBaseUrl = "https://image.tmdb.org/t/p/w780";
const supportedGenreIds = [
  12, 14, 16, 18, 27, 28, 35, 36, 37, 53, 80, 99, 878, 9648, 10402,
  10749, 10751, 10752,
];

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST for AI recommendations." });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  const tmdbKey = process.env.TMDB_API_KEY;
  const prompt = String(request.body?.prompt || "").trim();

  if (!openAiKey) {
    return response.status(500).json({ error: "Server is missing OPENAI_API_KEY." });
  }

  if (!tmdbKey) {
    return response.status(500).json({ error: "Server is missing TMDB_API_KEY." });
  }

  if (!prompt || prompt.length > 400) {
    return response.status(400).json({ error: "Enter a request between 1 and 400 characters." });
  }

  try {
    const preferences = await understandPreferences(openAiKey, prompt);
    const results = await discoverTitles(tmdbKey, preferences);

    return response.status(200).json({
      message: preferences.message,
      results,
    });
  } catch (error) {
    console.error("AI recommendation failed", error);
    return response.status(502).json({
      error: error.message || "Could not create recommendations right now.",
    });
  }
}

async function understandPreferences(apiKey, prompt) {
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You translate movie and TV requests into TMDB discovery filters.",
        "Use ISO 639-1 for originalLanguage, or an empty string when unspecified.",
        `Only use these TMDB movie genre IDs: ${supportedGenreIds.join(", ")}.`,
        "Use 0 for either year when the user did not specify one.",
        "Keep message to one friendly sentence explaining the selected mood and filters.",
        "Do not claim that a specific title is recommended because TMDB results are fetched afterward.",
      ].join(" "),
      input: prompt,
      max_output_tokens: 300,
      text: {
        format: {
          type: "json_schema",
          name: "movie_preferences",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              mediaType: { type: "string", enum: ["movie", "tv"] },
              originalLanguage: { type: "string" },
              genreIds: {
                type: "array",
                maxItems: 3,
                items: { type: "integer", enum: supportedGenreIds },
              },
              yearMin: { type: "integer", minimum: 0, maximum: 2100 },
              yearMax: { type: "integer", minimum: 0, maximum: 2100 },
              message: { type: "string", maxLength: 220 },
            },
            required: [
              "mediaType",
              "originalLanguage",
              "genreIds",
              "yearMin",
              "yearMax",
              "message",
            ],
          },
        },
      },
    }),
  });

  const data = await openAiResponse.json();

  if (!openAiResponse.ok) {
    throw new Error(data.error?.message || "OpenAI request failed.");
  }

  const outputText = (data.output || [])
    .flatMap((item) => item.content || [])
    .find((content) => content.type === "output_text")?.text;

  if (!outputText) {
    throw new Error("The AI response did not contain usable preferences.");
  }

  return JSON.parse(outputText);
}

async function discoverTitles(apiKey, preferences) {
  const mediaType = preferences.mediaType === "tv" ? "tv" : "movie";
  const url = new URL(`https://api.themoviedb.org/3/discover/${mediaType}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("vote_count.gte", "20");

  if (preferences.originalLanguage) {
    url.searchParams.set("with_original_language", preferences.originalLanguage);
  }

  if (preferences.genreIds?.length) {
    url.searchParams.set("with_genres", preferences.genreIds.join(","));
  }

  const datePrefix = mediaType === "tv" ? "first_air_date" : "primary_release_date";
  if (preferences.yearMin) {
    url.searchParams.set(`${datePrefix}.gte`, `${preferences.yearMin}-01-01`);
  }
  if (preferences.yearMax) {
    url.searchParams.set(`${datePrefix}.lte`, `${preferences.yearMax}-12-31`);
  }

  let data = await fetchTmdb(url);

  // If a very specific combination is empty, loosen genres while preserving language and years.
  if (!(data.results || []).length && preferences.genreIds?.length > 1) {
    url.searchParams.set("with_genres", preferences.genreIds.join("|"));
    data = await fetchTmdb(url);
  }

  return (data.results || []).slice(0, 12).map((item) => ({
    id: `${mediaType === "tv" ? "series" : "movie"}:${item.id}`,
    tmdbId: item.id,
    title: item.title || item.name,
    year: getYear(item.release_date || item.first_air_date),
    type: mediaType === "tv" ? "series" : "movie",
    poster: item.poster_path ? `${imageBaseUrl}${item.poster_path}` : "N/A",
    backdrop: item.backdrop_path ? `${backdropBaseUrl}${item.backdrop_path}` : "",
    plot: item.overview || "",
    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : "N/A",
  }));
}

async function fetchTmdb(url) {
  const tmdbResponse = await fetch(url);
  const data = await tmdbResponse.json();

  if (!tmdbResponse.ok) {
    throw new Error(data.status_message || "TMDB request failed.");
  }

  return data;
}

function getYear(date) {
  return date ? String(date).slice(0, 4) : "N/A";
}
