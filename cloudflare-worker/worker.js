/**
 * PopAuraStream Chatbot - Cloudflare Worker
 * Proxies requests to Gemini API for critic-style recommendations and comparisons
 * 
 * IMPORTANT: The API key should be set as a secret in Cloudflare:
 * wrangler secret put GEMINI_API_KEY
 * Then enter your new API key when prompted
 */

const GEMINI_MODEL = 'gemini-2.5-pro';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const DEFAULT_SYSTEM_PROMPT = [
  'You are AuraBot, PopAuraStream\'s witty streaming critic.',
  'Compare movies, series, shows, characters, and actors with clear verdicts, scorecards, and taste-aware recommendations.',
  'Write like a sharp human critic: conversational, specific, playful, and a little cheeky.',
  'Use harmless jokes about the query or watchlist energy, but never bully the user, use slurs, or attack protected traits.',
  'Keep answers concise enough for a small chat window.'
].join(' ');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      const { systemPrompt, messages } = await request.json();
      const prompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const contents = Array.isArray(messages) && messages.length
        ? messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: message.parts?.length ? message.parts : [{ text: String(message.content || '') }]
        }))
        : [{ role: 'user', parts: [{ text: 'Recommend something good to watch.' }] }];

      // Build the Gemini request
      const geminiRequest = {
        systemInstruction: {
          parts: [{ text: prompt }]
        },
        contents,
        generationConfig: {
          temperature: 0.9,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1536,
        }
      };

      const response = await fetch(`${GEMINI_API_URL}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequest)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Gemini API error:', JSON.stringify(data));
        return new Response(JSON.stringify({ 
          error: 'API error',
          details: data.error?.message || 'Unknown error',
          response: "I'm having trouble connecting to the critic model right now. Try again in a minute, or use the search bar while I dramatically recover."
        }), {
          status: 200,
          headers: corsHeaders
        });
      }

      // Extract the response text
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 
        "I couldn't generate a response. Please try again!";

      return new Response(JSON.stringify({ response: responseText }), {
        status: 200,
        headers: corsHeaders
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Server error',
        details: error.message,
        response: "Something went wrong. Please try again later. Even critics need intermission sometimes."
      }), {
        status: 200,
        headers: corsHeaders
      });
    }
  }
};
