/**
 * AI layer.
 *
 * Two jobs, and neither runs on the hot path:
 *
 *   1. extractPriceWithAi() — last-resort extraction when every deterministic
 *      strategy misses. It returns a CSS selector alongside the price, which we
 *      cache per-hostname, so a site costs one inference *ever*, not one per check.
 *
 *   2. judgeDeal() — the thing deterministic code genuinely can't do: read a
 *      price history and say whether this is a real discount or a fake one.
 *
 * Provider order is chosen to keep Ocular free:
 *   'builtin'   Chrome's on-device Gemini Nano  — $0, no key, no network
 *   'gemini' /  user's own API key (BYOK)       — $0 to *us*
 *   'anthropic'
 */

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    price: { type: 'number' },
    currency: { type: 'string' },
    inStock: { type: 'boolean' },
    selector: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['price', 'currency', 'selector', 'confidence'],
};

const EXTRACTION_PROMPT = `You read trimmed e-commerce page fragments and identify the CURRENT SELLING PRICE.

Rules:
- Pick the price the shopper pays today, not the struck-through M.R.P. or list price.
- Ignore EMI/monthly figures, delivery fees, coupon amounts, and "you save" values.
- "selector" must be the CSS selector from the line you chose, copied exactly.
- If no genuine product price is present, return price 0 and confidence "low".
Respond with JSON only.`;

const DEAL_PROMPT = `You advise shoppers on whether to buy now or wait, using observed price history.

Be concrete and skeptical:
- A "discount" off an inflated M.R.P. is not a discount.
- Prices raised shortly before a sale event, then "cut", are fake drops.
- Compare against the 90-day median and the all-time low, not the list price.
Respond with JSON only. Keep "reasoning" under 40 words.`;

const DEAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['buy_now', 'wait', 'neutral'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string' },
    fairPrice: { type: 'number' },
  },
  required: ['verdict', 'confidence', 'reasoning'],
};

// ---------------------------------------------------------------------------
// Chrome built-in model (Gemini Nano, on-device)
// ---------------------------------------------------------------------------

/** The API moved namespaces a few times; probe all the shapes we've seen. */
function builtinNamespace() {
  if (typeof LanguageModel !== 'undefined') return LanguageModel;
  if (typeof self !== 'undefined') {
    if (self.LanguageModel) return self.LanguageModel;
    if (self.ai?.languageModel) return self.ai.languageModel;
  }
  return null;
}

export async function builtinStatus() {
  const ns = builtinNamespace();
  if (!ns) return 'unsupported';
  try {
    const availability = await (ns.availability?.() ?? ns.capabilities?.().then((c) => c.available));
    // Older builds said 'readily' / 'after-download' / 'no'.
    return { readily: 'available', 'after-download': 'downloadable', no: 'unavailable' }[availability] || availability;
  } catch {
    return 'unsupported';
  }
}

async function runBuiltin(systemPrompt, userPrompt, schema) {
  const ns = builtinNamespace();
  if (!ns) throw new Error('Built-in AI is not available in this browser.');

  const status = await builtinStatus();
  if (status === 'unavailable' || status === 'unsupported') {
    throw new Error('Built-in AI is not available on this device.');
  }

  const session = await ns.create({
    initialPrompts: [{ role: 'system', content: systemPrompt }],
  });

  try {
    const text = await session.prompt(userPrompt, { responseConstraint: schema });
    return parseJsonLoosely(text);
  } finally {
    session.destroy?.();
  }
}

// ---------------------------------------------------------------------------
// Bring-your-own-key providers
// ---------------------------------------------------------------------------

async function runGemini({ apiKey, model }, systemPrompt, userPrompt, schema) {
  const name = model || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return parseJsonLoosely(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

async function runAnthropic({ apiKey, model }, systemPrompt, userPrompt, schema) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for calls originating from a browser context.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      temperature: 0,
      system: `${systemPrompt}\n\nJSON schema:\n${JSON.stringify(schema)}`,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return parseJsonLoosely(data.content?.map((block) => block.text || '').join('') || '');
}

/** Models sometimes wrap JSON in prose or a code fence. Dig it out. */
function parseJsonLoosely(text) {
  if (!text) throw new Error('Empty model response.');
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Model did not return JSON: ${text.slice(0, 200)}`);
    return JSON.parse(match[0]);
  }
}

async function run(settings, systemPrompt, userPrompt, schema) {
  const ai = settings.ai || {};
  if (ai.provider === 'off') throw new Error('AI features are turned off.');

  if (ai.provider === 'builtin') return runBuiltin(systemPrompt, userPrompt, schema);
  if (!ai.apiKey) throw new Error(`No API key configured for ${ai.provider}.`);
  if (ai.provider === 'gemini') return runGemini(ai, systemPrompt, userPrompt, schema);
  if (ai.provider === 'anthropic') return runAnthropic(ai, systemPrompt, userPrompt, schema);

  throw new Error(`Unknown AI provider: ${ai.provider}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {string} snippet  Output of extract.js buildPriceSnippet() — NOT raw HTML.
 */
export async function extractPriceWithAi(settings, snippet, url) {
  const result = await run(
    settings,
    EXTRACTION_PROMPT,
    `URL: ${url}\n\n${snippet}`,
    EXTRACTION_SCHEMA
  );

  if (!result?.price || result.price <= 0) return null;
  return {
    price: Number(result.price),
    currency: result.currency || 'INR',
    inStock: result.inStock !== false,
    selector: typeof result.selector === 'string' ? result.selector.trim() : null,
    confidence: result.confidence || 'low',
    strategy: 'ai',
  };
}

export async function judgeDeal(settings, { title, currency, stats, history }) {
  // Downsample: the model needs the shape of the curve, not every reading.
  const trail = history.slice(-24).map((point) => ({
    d: new Date(point.ts).toISOString().slice(0, 10),
    p: point.price,
  }));

  return run(
    settings,
    DEAL_PROMPT,
    JSON.stringify({ title, currency, stats, history: trail }),
    DEAL_SCHEMA
  );
}

export async function describeAiStatus(settings) {
  const provider = settings.ai?.provider || 'builtin';
  if (provider === 'off') return { provider, ready: false, detail: 'Disabled' };
  if (provider === 'builtin') {
    const status = await builtinStatus();
    return {
      provider,
      ready: status === 'available',
      detail: {
        available: 'Ready (on-device)',
        downloadable: 'Model needs downloading — run a check to trigger it',
        downloading: 'Model is downloading',
        unavailable: 'Not supported on this device',
        unsupported: 'This Chrome build has no built-in AI',
      }[status] || status,
    };
  }
  return {
    provider,
    ready: Boolean(settings.ai?.apiKey),
    detail: settings.ai?.apiKey ? 'API key saved' : 'No API key set',
  };
}
