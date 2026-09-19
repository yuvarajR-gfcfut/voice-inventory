# Voice Inventory

A voice-first inventory management application designed for small Indian retail merchants.
Enables fast, intuitive stock tracking using multilingual speech recognition and AI parsing.

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yuvarajR-gfcfut/voice-inventory.git
   cd voice-inventory
   ```
2. Install project dependencies:
   ```bash
   npm install
   ```
3. Create your local environment file:
   ```bash
   cp .env.example .env
   ```
4. Fill in your environment values in `.env` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`).
5. Verify your setup:
   ```bash
   npm run verify
   ```

> **Never commit secrets:** The `.env` file contains sensitive API keys and database credentials. It is listed in `.gitignore` and must never be committed to source control or shared publicly.