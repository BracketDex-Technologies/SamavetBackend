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
2. Azure Marathi transliteration when `AZURE_TRANSLATOR_KEY` is configured.
3. Google Cloud Translation NMT when Azure is unavailable, times out, or returns a quota/provider error.
4. Existing editable browser suggestion while a remote provider is unavailable.

Remote results are cached, provider keys remain server-side, and both requests have a two-second timeout. Azure is always attempted before Google.

## Activation requirement

Add both `AZURE_TRANSLATOR_KEY` (plus `AZURE_TRANSLATOR_REGION` when required by the Azure resource) and `GOOGLE_TRANSLATE_API_KEY` to the backend deployment environment. Restrict the Google key to the Cloud Translation API and monitor both quotas. These credentials were not present locally, so the provider integration is tested but cannot be live-tested or activated from this workspace alone.

Sources:

- https://cloud.google.com/products/translate/pricing
- https://docs.cloud.google.com/translate/docs/languages
- https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate
- https://learn.microsoft.com/en-us/azure/ai-services/Translator/language-support
- https://github.com/AI4Bharat/IndicXlit
- https://dibd-bhashini.gitbook.io/bhashini-apis
- https://docs.sarvam.ai/api/getting-started/pricing
