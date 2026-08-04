# Marathi translation provider decision

Date: 2026-08-04

## Current production order

The backend now uses this order for Marathi name and address conversion:

1. Verified local Pune glossary for known spellings such as Wanawadi and Natubaug.
2. Groq when `GROQ_API_KEY` is configured.
3. OpenRouter when `OPENROUTER_API_KEY` is configured and Groq is unavailable, over quota, or times out.
4. Existing editable browser suggestion when every remote provider is unavailable.

Azure Translator, Google Cloud Translation, and DeepL are intentionally skipped. They created account, tenant, billing, card-verification, or API-plan friction.

## Backend environment variables

Add these only to the backend deployment, not the frontend:

```env
GROQ_API_KEY=
GROQ_TRANSLATION_MODEL=llama-3.3-70b-versatile
OPENROUTER_API_KEY=
OPENROUTER_TRANSLATION_MODEL=openrouter/free
```

`GROQ_TRANSLATION_MODEL` and `OPENROUTER_TRANSLATION_MODEL` are optional. After adding or changing keys in Vercel, redeploy the backend.

## Provider notes

Groq and OpenRouter both use strict Marathi address-editor prompts. The prompt transliterates proper names, societies, buildings, and localities phonetically while translating generic address terms such as "Main Road", "Near", and "Lane Number" into natural Marathi.

Remote results are validated, corrected with the verified glossary, and cached in memory per backend instance. Provider keys remain server-side only. Both remote calls have four-second timeouts.

Sources:

- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/keys
- https://openrouter.ai/docs/quickstart
- https://openrouter.ai/docs/guides/routing/routers/free-router
- https://openrouter.ai/docs/guides/routing/model-variants/free
