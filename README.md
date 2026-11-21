# Sims Universe

Sims Universe is a Russian-language starter hub for The Sims 4 mods, custom content, creator discovery, compatibility notes, guides and tools.

## Current status
This is an early public website scaffold. Catalog and compatibility sections are currently concept pages; entries must be researched and source-verified before being labeled verified.

## Deployment
Designed for Railway using Dockerfile. Container serves `index.html` on the platform-provided `PORT`.

## Content policy
Link to original creators and downloads. Do not mirror files without permission. Adult content should be gated and clearly labeled 18+.

## Free AI translator (Groq)

AI translation uses Groq's OpenAI-compatible Chat Completions API. Configure `GROQ_API_KEY` in Railway Variables. Default model is `openai/gpt-oss-120b`; override with `GROQ_TRANSLATOR_MODEL` if needed. The browser never receives the API key.
