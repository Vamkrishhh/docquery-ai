# DocQuery AI: Secure Multi-Tenant RAG Platform

DocQuery AI is a production-grade, retrieval-augmented generation (RAG) system built with **React**, **Vite**, and **Supabase**. It provides tenant-isolated document intelligence with enterprise-grade security and advanced metadata tracking.

## 🌐 Live Demo

**Production Site:** [https://docquery-ai-vamsi.netlify.app/](https://docquery-ai-vamsi.netlify.app/)

---

## 🚀 Deployment Guide (Netlify)

Follow these steps to deploy the project to production.

### 1. Push to GitHub
If you haven't yet, initialize a git repository and push your code to GitHub.
```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git branch -M main
git push -u origin main
```

### 2. Configure Environment Variables
Vite requires environment variables to be prefixed with `VITE_`. These are statically injected during the build. Before deploying, ensure the following variables are set in your Netlify dashboard under **Site Settings > Environment variables**:

- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase Anonymous Key (Publishable Key).

### 3. Deploy via CLI
If you want to deploy directly from your terminal:
```bash
# Install Netlify CLI if needed
npm install -g netlify-cli

# Build the project locally
npm run build

# Link to your Netlify site (run only if not yet linked)
netlify link

# Deploy the 'dist' folder to production
netlify deploy --prod --dir=dist
```

### 4. Continuous Deployment (Recommended)
Alternatively, import your GitHub repository directly into the Netlify Dashboard:
1.  **Repository**: Connect your GitHub account and select this repo.
2.  **Build Command**: `npm run build`
3.  **Publish Directory**: `dist`
4.  **Env Vars**: Set your `VITE_` variables in the Netlify UI.

---

## 🛡️ Key Features
- **Multi-Tenant Security**: Strict Row-Level Security (RLS) isolation at the PostgreSQL layer.
- **Advanced RAG Pipeline**: Intelligent document chunking, semantic retrieval, and source-cited generation via Gemini 1.5.
- **Role-Based Access (RBAC)**: Admin vs. Member permissions with dynamic routing guards.
- **Intelligence Dashboard**: Research-grade metrics for accuracy, latency, and truthfulness.

## 🛠️ Technology Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion.
- **Backend/DB**: Supabase (PostgreSQL), Deno Edge Functions.
- **AI Engine**: Google Gemini AI.
- **Visualization**: Recharts, react-force-graph-2d.

---

## 🛠️ Local Development
```bash
npm install
npm run dev
```
