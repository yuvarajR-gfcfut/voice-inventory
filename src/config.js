const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL'
];

const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = process.env.GEMINI_MODEL;
export const CRON_SECRET = process.env.CRON_SECRET;
export const VERCEL_REGION = process.env.VERCEL_REGION;
export const PORT = process.env.PORT || 3000;

export default {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  CRON_SECRET,
  VERCEL_REGION,
  PORT
};
