# PROJECT CONTEXT
Repository: doruklu-cdn
Purpose: Centralized CDN to host shared static assets (CSS, JS) for all Doruklu applications.
Architecture:
- The assets placed here will be accessible at `https://cdn.doruklu.com/...`.
- Other applications import these files via absolute paths to ensure consistent styling and shared dependencies (like Supabase Auth configurations).
