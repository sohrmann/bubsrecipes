# Bubs Recipes 🍳

A modern recipe collection powered by [Cooklang](https://cooklang.org). Recipes are written in plain text (`.cook`), automatically validated, compiled into a searchable static web application, and deployed directly to **GitHub Pages**.

---

## 📁 Repository Structure

```text
bubsrecipes/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Automated CI/CD deployment to GitHub Pages
├── .agents/                    # Local AI agent skills & MCP config (gitignored by default)
│   ├── skills/                 # Official Cooklang skills (import, validate, edit, etc.)
│   └── mcp_config.json         # Cook MCP server config
├── config/
│   ├── aisle.conf              # Grocery store aisle categories for shopping lists
│   └── pantry.conf             # Pantry inventory tracking
├── import/                     # Gitignored inbox: drop raw emails, .txt notes, or drafts here
├── recipes/                    # Your recipe collection (.cook files)
├── .gitignore
├── GEMINI.md                   # AI pair programming instructions for Cooklang
└── README.md
```

---

## 📝 Cooklang Syntax Quick Reference

Cooklang recipes are stored as `.cook` plain text files with YAML frontmatter at the top:

```cooklang
---
title: Classic Fluffy Pancakes
description: Golden, fluffy buttermilk-style breakfast pancakes.
servings: 4
prep time: 10 minutes
cook time: 15 minutes
tags:
  - breakfast
  - pancakes
---

In a #large mixing bowl{}, whisk together @all-purpose flour{250%g}, @sugar{2%tbsp}, and @baking powder{2%tsp}.

Beat @eggs{2} with @milk{300%ml} and melted @butter{50%g} in a separate #small bowl{}.

Combine and rest for ~{5%minutes}.

Cook on a hot #skillet{} for ~{3%minutes} per side. Serve warm with @maple syrup{}.
```

### Syntax Elements:
- **Ingredients**: `@name{quantity%unit}` (e.g. `@olive oil{2%tbsp}`, `@eggs{2}`, `@salt{1/2%tsp}`, `@garlic{3%cloves}`). Multi-word ingredients require braces: `@all-purpose flour{}`. Declare quantities only on first mention.
- **Cookware**: `#name{}` (e.g. `#pan{}`, `#mixing bowl{}`, `#baking sheet{9x13%inch}`).
- **Timers**: `~{duration%unit}` or `~name{duration%unit}` (e.g. `~{10%minutes}`, `~simmer{20%minutes}`).
- **Comments / Notes**: `-- note` or `> note`.

---

## 🤖 AI Assistant Skills (Local Superpowers)

This workspace comes pre-configured with the **official Cooklang AI Skills Suite** in `.agents/skills/` and the **Cook MCP Server** (`@cookmd/mcp`).

You can ask Antigravity:
- *"Fetch and convert this recipe into Cooklang: https://example.com/recipe"*
- *"Convert the recipe in import/grandmas_cookies.txt into my collection"*
- *"Validate all recipes in my collection and check aisle categories"*
- *"Generate a shopping list for Risotto and Pancakes"*
- *"Scale Creamy Garlic Risotto to 8 servings"*
- *"Create a meal plan for next week in a .menu file"*

### Offline / Direct Recipe Scraper
A lightweight, zero-dependency Python extractor is included in `.agents/skills/recipe-import/scripts/fetch_recipe.py`:
```bash
python3 .agents/skills/recipe-import/scripts/fetch_recipe.py "https://example.com/recipe"
```

---

## 💻 Local CLI Usage

To preview or manage recipes locally, install [CookCLI](https://cooklang.org/cli/):

```bash
# macOS (via Homebrew)
brew install cookcli
```

### Useful Commands:
- **Live Interactive Server**:
  ```bash
  cook server
  ```
  Opens a local web interface at `http://localhost:9080` with interactive scaling, shopping lists, and live editing.
- **Build Static Website**:
  ```bash
  cook build web
  open _site/index.html
  ```
- **Run Diagnostics**:
  ```bash
  cook doctor
  ```
  Validates syntax, verifies references, and checks for ingredients missing from `config/aisle.conf`.
- **Generate Shopping List**:
  ```bash
  cook shopping-list recipes/mains/creamy-garlic-risotto.cook
  ```

---

## 🚀 GitHub Pages Setup

Whenever you push to `main`, GitHub Actions automatically validates recipes with `cook doctor`, compiles the static web app via `cook build web`, and deploys it to GitHub Pages.

### One-Time Repository Setting:
1. Open your repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Future pushes to `main` will build and publish your site automatically.
