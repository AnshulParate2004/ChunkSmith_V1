export const serverConfig = {
  // Google Gemini Configuration & Key Pool
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL || process.env.GOOGLE_EMBEDDING_MODEL || "text-embedding-004",
  GEMINI_KEYS: (process.env.GEMINI_KEYS || process.env.GOOGLE_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),

  // Groq Configuration & Key Pool
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_MODEL: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  GROQ_KEYS: (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),

  // Qdrant Vector DB
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
