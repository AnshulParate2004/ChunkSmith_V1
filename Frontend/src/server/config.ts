export const serverConfig = {
  // Model settings
  AZURE_OPENAI_CHAT_MODEL: process.env.AZURE_OPENAI_CHAT_MODEL || "gpt-4o",
  AZURE_OPENAI_EMBEDDING_MODEL: process.env.AZURE_OPENAI_EMBEDDING_MODEL || "text-embedding-3-large",
  AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY || "",
  AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || "",
  AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",

  // Portkey AI Gateway settings (multi-provider, failover, load balancing)
  PORTKEY_API_KEY: process.env.PORTKEY_API_KEY || "",
  PORTKEY_CONFIG_ID: process.env.PORTKEY_CONFIG_ID || "",
  PORTKEY_VIRTUAL_KEY: process.env.PORTKEY_VIRTUAL_KEY || "",

  // Google Gemini Key Pool (supports single key or comma-separated list of 10+ keys)
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
  GOOGLE_EMBEDDING_MODEL: process.env.GOOGLE_EMBEDDING_MODEL || "text-embedding-004",
  GEMINI_KEYS: (process.env.GEMINI_KEYS || process.env.GOOGLE_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),

  // Groq Key Pool (supports comma-separated list of 10+ keys)
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_KEYS: (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),

  // Qdrant
  QDRANT_URL: process.env.QDRANT_URL || "",
  QDRANT_API_KEY: process.env.QDRANT_API_KEY || "",

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_KEY: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  SUPABASE_BUCKET_NAME: process.env.SUPABASE_BUCKET_NAME || "chunk_images",
  SUPABASE_DATA_BUCKET_NAME: process.env.SUPABASE_DATA_BUCKET_NAME || "chunk_data",
  SUPABASE_PDF_BUCKET_NAME: process.env.SUPABASE_PDF_BUCKET_NAME || "chunk_pdf",
  SUPABASE_PKL_BUCKET_NAME: process.env.SUPABASE_PKL_BUCKET_NAME || "chunk_pkl",

  // Unstructured API
  UNSTRUCTURED_API_KEY: process.env.UNSTRUCTURED_API_KEY || "",
  UNSTRUCTURED_API_URL: process.env.UNSTRUCTURED_API_URL || "https://api.unstructuredapp.io/general/v0/general",

  // App settings
  API_VERSION: "1.0.0",
  MAX_CHARACTERS: 3000,
  NEW_AFTER_N_CHARS: 3800,
  COMBINE_TEXT_UNDER_N_CHARS: 200,
  EXTRACT_IMAGES: true,
  EXTRACT_TABLES: true,
  LANGUAGES: ["eng"],
};
