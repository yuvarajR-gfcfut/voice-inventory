/**
 * Gemini NLU Fallback Module.
 * Calls Gemini 3.1 Flash-Lite (or configured model) with a 5000ms timeout.
 * Demands strict JSON matching schema.js.
 * Always returns validated object or null on any error/timeout/schema failure.
 */

import { validate } from './schema.js';

const SYSTEM_INSTRUCTION = `You are a voice inventory command parser for an Indian kirana/grocery store app called StockSathi.
Parse the user's spoken sentence into STRICT JSON according to this exact specification:

{
  "action": "in" | "out" | "adjust" | "query_stock" | "query_low" | "unknown",
  "items": [
    {
      "product_hint": "clean name of product (e.g. sugar, refined oil, aata, biyyam, eggs)",
      "qty": 10 or null,
      "unit": "kg" | "l" | "pcs" | "bag" | "packet" | "box" | "bottle" | "can" | "tin" | "dozen" | "quintal" | "g" | "ml" or null
    }
  ],
  "lang": "en" | "hi" | "te",
  "confidence": number between 0.0 and 1.0
}

RULES:
1. "in": Stock arrival/purchase (e.g. aaya, mila, received, added, bought, vachindi, teesukunnam).
2. "out": Stock sold/used/dispatched (e.g. becha, bika, diya, sold, used, ammamu, ichamu).
3. "adjust": Reset or count stock to exact amount (e.g. set stock to, barabar karo, sari chey).
4. "query_stock": Asking current stock level for a product (e.g. kitna bacha hai, how much left, entha undi).
5. "query_low": Asking which items are running low or out of stock (e.g. kya khatam hone wala hai, low stock, takuva unna).
6. Support multi-item sentences split across conjunctions (and, aur, mariyu, commas).
7. Return RAW JSON only. Do not include markdown codeblocks or conversational text.`;

/**
 * Calls Gemini API to parse inventory sentence.
 * Returns validated NLU output or null on failure.
 *
 * @param {string} sentence - Spoken inventory sentence
 * @param {'en'|'hi'|'te'} [lang='en'] - Language hint
 * @returns {Promise<import('./schema.js').nluOutputSchema | null>}
 */
export async function callGemini(sentence, lang = 'en') {
  if (!sentence || typeof sentence !== 'string' || !sentence.trim()) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Gemini NLU] GEMINI_API_KEY not configured, skipping Gemini call');
    return null;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            parts: [
              {
                text: `Language: ${lang || 'auto'}\nSentence: "${sentence.trim()}"`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      }),
      signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS) || 5000)
    });

    if (!response.ok) {
      console.warn(`[Gemini NLU] Gemini API returned status ${response.status}`);
      return null;
    }

    const data = await response.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return null;
    }

    // Clean any markdown code fences if returned
    text = text.trim();
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsedJson = JSON.parse(text);
    // Validate against schema.js
    const validated = validate(parsedJson);
    return validated;
  } catch (err) {
    // Timeout, network error, invalid JSON, or schema failure
    console.warn('[Gemini NLU] Call failed or timed out:', err.name, err.message);
    return null;
  }
}

export default {
  callGemini
};
