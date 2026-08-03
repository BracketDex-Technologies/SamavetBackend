# Marathi translation provider decision

Date: 2026-08-04

## What the application was using

The entry form produced Marathi text in two stages:

1. An immediate hand-written Latin-to-Devanagari converter in `src/App.tsx`.
2. A debounced call to the backend, which used Microsoft Azure Translator's Marathi `Latn` to `Deva` transliteration endpoint.

A small verified locality glossary overrides both paths for known spellings such as Wanawadi. The local `.env.local` has no Azure Translator key, so local unknown words could only retain the less-accurate hand-written conversion.

This is primarily **transliteration** (preserving names and sounds), not semantic translation. For an address, `Main Road` may need semantic Marathi (`मुख्य रस्ता`), while `Wanawadi` needs phonetic Marathi (`वानवडी`). No general model can guarantee the official spelling of every building and locality, so the editable Marathi field and verified glossary remain necessary.

## Provider evaluation

- **Google Cloud Translation NMT:** Marathi translation is supported and the first 500,000 processed characters per month receive a recurring free credit. Google Cloud's dedicated romanized-text transliteration feature does not currently list Marathi, so standard English-to-Marathi NMT is the applicable Google option.
- **Azure Translator:** Marathi Latin/Devanagari transliteration is officially supported. Its F0 tier includes up to 2 million characters per month and remains a useful fallback for proper names.
- **AI4Bharat IndicXlit:** Open-source, MIT-licensed, Marathi-capable, and trained specifically for Indic transliteration. Self-hosting the model would require a persistent model runtime that does not fit the current Vercel serverless architecture. The public hosted API has availability reports and is not appropriate as the only production dependency.
- **Bhashini:** Exposes AI4Bharat IndicXlit, but its public documentation limits this API path to proof-of-concept use and asks commercial/production integrators to arrange a paid plan.
- **Sarvam:** India-focused and Marathi-capable, but provides initial credits rather than a permanent free production tier.

## Implemented provider order

The backend now uses:

1. Verified locality glossary.
2. Groq-hosted `llama-3.3-70b-versatile` when `GROQ_API_KEY` is configured. Its strict prompt transliterates proper names but translates generic address terms.
3. Azure Marathi transliteration when an existing `AZURE_TRANSLATOR_KEY` is configured.
4. Google Cloud Translation NMT when the earlier providers are unavailable, time out, or return a quota/provider error.
5. Existing editable browser suggestion while every remote provider is unavailable.

Remote results are validated and cached, and provider keys remain server-side. Groq has a four-second timeout; the dedicated providers retain their two-second timeouts.

## Activation requirement

Create a Groq API key at `https://console.groq.com/keys`, then add `GROQ_API_KEY` to the backend Vercel project's environment variables. `GROQ_TRANSLATION_MODEL` is optional and defaults to `llama-3.3-70b-versatile`. Redeploy the backend after saving the variable. Azure and Google keys remain optional fallbacks. No provider credential belongs in the frontend project or in a `VITE_` variable.

Sources:

- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/keys
- https://cloud.google.com/products/translate/pricing
- https://docs.cloud.google.com/translate/docs/languages
- https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate
- https://learn.microsoft.com/en-us/azure/ai-services/Translator/language-support
- https://github.com/AI4Bharat/IndicXlit
- https://dibd-bhashini.gitbook.io/bhashini-apis
- https://docs.sarvam.ai/api/getting-started/pricing
