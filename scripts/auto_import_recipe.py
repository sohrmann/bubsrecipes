#!/usr/bin/env python3
"""
Automated Cooklang Recipe Importer & 16:9 Editorial Food Photographer.

Runs in GitHub Actions (triggered via mobile Share Sheet or the '+' modal on recipes.bubs.page).
1. Extracts recipe data from a URL (Schema.org JSON-LD + webpage text fallback) or raw pasted text.
2. Uses Gemini API to translate/convert the recipe into English Cooklang (.cook),
   choose the category & filename slug, update config/aisle.conf, and write the dish plating brief.
3. Validates the generated .cook file with @cookmd/mcp (and auto-repairs if any syntax issue is detected).
4. Generates a 1376x768 (16:9) editorial food photograph using Gemini / Imagen and saves it alongside the .cook file.
"""

from __future__ import annotations

import argparse
import base64
import html
import io
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

REPO_ROOT = Path(__file__).resolve().parent.parent
RECIPES_DIR = REPO_ROOT / "recipes"
AISLE_CONF_PATH = REPO_ROOT / "config" / "aisle.conf"
GEMINI_MD_PATH = REPO_ROOT / "GEMINI.md"

VALID_CATEGORIES = [
    "baking",
    "breakfast",
    "desserts",
    "drinks",
    "mains",
    "salads",
    "sauces",
    "snacks",
]

TARGET_WIDTH = 1376
TARGET_HEIGHT = 768


def extract_first_url(text: str) -> str | None:
    match = re.search(r"https?://[^\s<>\"')]+", text)
    return match.group(0) if match else None


def is_safe_public_url(url: str) -> bool:
    """Ensure URL uses http/https and resolves only to public (non-private/loopback/link-local) IPs."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        hostname = parsed.hostname.lower()
        if hostname in ("localhost", "ip6-localhost", "ip6-loopback"):
            return False
        for info in socket.getaddrinfo(hostname, None):
            ip_str = info[4][0]
            ip_obj = ipaddress.ip_address(ip_str)
            if (
                ip_obj.is_private
                or ip_obj.is_loopback
                or ip_obj.is_link_local
                or ip_obj.is_multicast
                or ip_obj.is_reserved
            ):
                return False
        return True
    except Exception:
        return False


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not is_safe_public_url(newurl):
            raise urllib.error.URLError("Blocked redirect to unsafe or non-public URL")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_webpage_data(url: str) -> dict:
    """Fetch Schema.org JSON-LD recipe data plus cleaned readable page text as fallback."""
    if not is_safe_public_url(url):
        return {"source_url": url, "error": "Blocked unsafe or non-public URL"}

    opener = urllib.request.build_opener(SafeRedirectHandler)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
        },
    )
    try:
        with opener.open(req, timeout=20) as resp:
            # Cap read at 2 MB to prevent memory exhaustion on huge responses
            raw_html = resp.read(2_000_000).decode("utf-8", errors="replace")
    except Exception as exc:
        return {"source_url": url, "error": f"Failed to fetch URL: {exc}"}

    # 1. Try Schema.org JSON-LD extraction
    blocks = re.findall(
        r"<script[^>]*type=['\"]application/ld\+json['\"][^>]*>(.*?)</script>",
        raw_html,
        re.DOTALL | re.IGNORECASE,
    )
    json_ld_recipe = None
    for block in blocks:
        try:
            data = json.loads(block.strip())
        except Exception:
            continue

        nodes = []
        if isinstance(data, list):
            nodes = data
        elif isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                nodes = data["@graph"]
            else:
                nodes = [data]

        for node in nodes:
            if not isinstance(node, dict):
                continue
            t = node.get("@type")
            if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
                instructions = []
                raw_inst = node.get("recipeInstructions", [])
                if isinstance(raw_inst, str):
                    instructions = [raw_inst]
                elif isinstance(raw_inst, list):
                    for item in raw_inst:
                        if isinstance(item, str):
                            instructions.append(item)
                        elif isinstance(item, dict):
                            if item.get("@type") == "HowToSection":
                                sec_name = item.get("name", "")
                                if sec_name:
                                    instructions.append(f"## {sec_name}")
                                for sub in item.get("itemListElement", []):
                                    if isinstance(sub, dict) and "text" in sub:
                                        instructions.append(sub["text"])
                                    elif isinstance(sub, str):
                                        instructions.append(sub)
                            elif "text" in item:
                                instructions.append(item["text"])

                json_ld_recipe = {
                    "source_url": url,
                    "title": node.get("name"),
                    "description": node.get("description"),
                    "servings": node.get("recipeYield"),
                    "prepTime": node.get("prepTime"),
                    "cookTime": node.get("cookTime"),
                    "totalTime": node.get("totalTime"),
                    "ingredients": node.get("recipeIngredient", []),
                    "instructions": instructions,
                }
                break
        if json_ld_recipe:
            break

    # 2. Also extract stripped body text as fallback/context
    cleaned = re.sub(r"<(script|style|noscript|svg|footer|nav)[^>]*>.*?</\1>", " ", raw_html, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return {
        "source_url": url,
        "json_ld": json_ld_recipe,
        "page_text_excerpt": cleaned[:18000],
    }


def gemini_get(api_key: str, path: str, timeout: int = 30) -> dict:
    """Call Gemini REST API GET endpoint passing the API key strictly via header."""
    url = f"https://generativelanguage.googleapis.com/v1beta/{path}"
    req = urllib.request.Request(
        url,
        headers={"x-goog-api-key": api_key},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def gemini_post(api_key: str, model_path: str, payload: dict, timeout: int = 90) -> dict:
    """Call Gemini REST API passing the API key strictly via header (never in URL)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/{model_path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")[:300]
            if api_key:
                body = body.replace(api_key, "***")
        except Exception:
            pass
        raise RuntimeError(f"HTTP {exc.code} {exc.reason}: {body}") from exc


def discover_models(api_key: str) -> tuple[list[str], list[str], list[str]]:
    """Query /v1beta/models to dynamically discover available text and image models."""
    text_models: list[str] = []
    gemini_image_models: list[str] = []
    imagen_models: list[str] = []

    try:
        data = gemini_get(api_key, "models?pageSize=100")
        models = data.get("models", [])
        available_names = {}
        for m in models:
            name = m.get("name", "")  # e.g. "models/gemini-3-flash-preview"
            methods = m.get("supportedGenerationMethods", [])
            if name:
                available_names[name] = methods

        print(f"  ✓ Discovered {len(available_names)} models on API key")

        # Preferred text model order
        preferred_text = [
            "models/gemini-3-flash-preview",
            "models/gemini-3-flash",
            "models/gemini-flash-latest",
            "models/gemini-3.1-pro-preview",
            "models/gemini-3-pro-preview",
            "models/gemini-pro-latest",
            "models/gemini-2.5-flash",
            "models/gemini-2.5-pro",
            "models/gemini-2.0-flash",
        ]
        for pref in preferred_text:
            if pref in available_names and "generateContent" in available_names[pref]:
                text_models.append(f"{pref}:generateContent")

        # Add any other available gemini text models supporting generateContent
        for name, methods in available_names.items():
            if "generateContent" not in methods:
                continue
            low = name.lower()
            if "image" in low or "imagen" in low:
                gemini_image_models.append(f"{name}:generateContent")
            elif (
                "gemini" in low
                and not any(x in low for x in ("tts", "audio", "embedding", "robotics", "computer-use", "thinking", "aqa", "vision"))
                and f"{name}:generateContent" not in text_models
            ):
                text_models.append(f"{name}:generateContent")

        # Add Imagen predict models
        for name, methods in available_names.items():
            low = name.lower()
            if "imagen" in low and "predict" in methods:
                imagen_models.append(f"{name}:predict")

    except Exception as exc:
        print(f"  ! Model discovery note: {exc}")

    # Fallbacks if discovery didn't populate
    if not text_models:
        text_models = [
            "models/gemini-flash-latest:generateContent",
            "models/gemini-3-flash-preview:generateContent",
            "models/gemini-2.5-flash:generateContent",
            "models/gemini-pro-latest:generateContent",
        ]
    if not gemini_image_models:
        gemini_image_models = [
            "models/gemini-3-pro-image-preview:generateContent",
            "models/gemini-2.5-flash-image:generateContent",
            "models/gemini-2.5-flash-image-preview:generateContent",
            "models/gemini-2.0-flash-exp-image-generation:generateContent",
        ]
    if not imagen_models:
        imagen_models = [
            "models/imagen-4.0-generate-001:predict",
            "models/imagen-3.0-generate-002:predict",
        ]

    return text_models, gemini_image_models, imagen_models


def generate_cooklang_via_gemini(
    api_key: str,
    raw_source: str,
    notes: str,
    scraped_data: dict | None,
    validation_errors: str | None = None,
    previous_draft: str | None = None,
) -> dict:
    aisle_conf = AISLE_CONF_PATH.read_text(encoding="utf-8") if AISLE_CONF_PATH.exists() else ""
    gemini_rules = GEMINI_MD_PATH.read_text(encoding="utf-8") if GEMINI_MD_PATH.exists() else ""

    existing_files = [
        p.relative_to(RECIPES_DIR).as_posix()
        for p in RECIPES_DIR.rglob("*.cook")
    ]

    system_prompt = f"""You are an expert culinary editor and Cooklang author for the 'Bubs Recipes' collection.
Follow all repository rules from GEMINI.md strictly:
{gemini_rules}

CRITICAL COOKLANG SYNTAX & COLLECTION RULES:
1. Language: ALWAYS write the recipe in English. Translate all ingredients, steps, notes, and metadata into natural culinary English.
2. YAML Frontmatter: Must be at the very top between `---` markers. Include:
   - `title`: Recipe title in Title Case
   - `description`: 1-sentence appetizing summary
   - `servings`: Integer number of servings (e.g. `4`)
   - `prep time`: e.g. `15 minutes`
   - `cook time`: e.g. `25 minutes` (if applicable)
   - `tags`: YAML list starting with the category name (e.g., `- mains`, `- italian`, ...)
   - `source`: The original URL if imported from a URL (omit if pasted text without URL)
   - NEVER include `image:` in frontmatter. NEVER use `>>` metadata lines.
3. No Separate Ingredient List: Cooklang derives ingredients from inline `@ingredient{{qty%unit}}(prep note)` tags inside the steps.
4. Declare Each Ingredient Quantity ONCE:
   - The FIRST time an ingredient is used in a step, write `@ingredient name{{qty%unit}}` (or `@ingredient name{{qty}}` for countable items like `@large eggs{{4}}`).
   - Use `%` between quantity and unit (e.g., `@all-purpose flour{{200%g}}`, `@olive oil{{2%tbsp}}`, `@fine sea salt{{1/2%tsp}}`).
   - If an ingredient is used again in a later step, reference it bare WITHOUT quantity: `@ingredient name{{}}`.
5. Always Brace Multi-Word Names:
   - Ingredients: `@dark chocolate{{200%g}}`, `@extra virgin olive oil{{2%tbsp}}`
   - Cookware: `#large mixing bowl{{}}`, `#saucepan{{}}`, `#whisk{{}}`
6. Timers & Tildes:
   - Write timers as `~{{10%minutes}}` or `~{{4-6%hours}}`.
   - NEVER use the tilde character `~` for approximations in plain text (write `about 30 ml`, never `~30 ml`).
   - NEVER put Cooklang syntax (`~{{...}}`, `@...`, `#...`) inside `> Note:` blockquote lines, because CookCLI renders `>` note lines as plain text! Write plain English (`20 minutes`) inside `>` notes.
7. Sections & Steps:
   - Group logical stages with `= Section Name` headers.
   - Separate each step paragraph with a blank line.

Current `config/aisle.conf`:
```
{aisle_conf}
```

Existing recipe files (do not overwrite an existing slug unless intentionally updating):
{json.dumps(existing_files)}

Return ONLY a valid JSON object matching this exact schema:
{{
  "category": "one of: {', '.join(VALID_CATEGORIES)}",
  "slug": "kebab-case-filename-without-extension",
  "title": "Human Readable Recipe Title",
  "cook_content": "Full content of the .cook file starting with ---",
  "aisle_additions": [
    {{
      "section": "exact section header name in aisle.conf without brackets, e.g. produce, dairy & refrigerated, bakery & grains, pantry & baking, spices, meat & seafood",
      "synonym_group_hint": "optional existing word on the line to append to (e.g. 'sugar' or 'cheese'), or empty string to add a new line",
      "item": "exact lowercase ingredient name used in @ingredient{{}} that is missing from aisle.conf"
    }}
  ],
  "photo_plating_brief": "2-3 vivid sentences describing the finished dish plating, key visible ingredients, textures, garnishes, and appropriate tableware (bowl/plate/board) for the 16:9 editorial photograph."
}}"""

    user_parts = [f"Raw user input / source:\n{raw_source}\n"]
    if notes:
        user_parts.append(f"User notes / requested adjustments:\n{notes}\n")
    if scraped_data:
        user_parts.append(f"Extracted webpage data:\n{json.dumps(scraped_data, indent=2, ensure_ascii=False)}\n")
    if validation_errors and previous_draft:
        user_parts.append(
            f"IMPORTANT: Your previous `.cook` draft failed Cooklang validation with these diagnostics:\n"
            f"{validation_errors}\n\nPrevious draft:\n{previous_draft}\n\nPlease fix all validation errors and return the corrected JSON."
        )

    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": "\n".join(user_parts)}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    models_to_try, _, _ = discover_models(api_key)
    last_err = None
    for model_path in models_to_try:
        try:
            resp = gemini_post(api_key, model_path, payload, timeout=90)
            text = resp["candidates"][0]["content"]["parts"][0]["text"]
            print(f"  ✓ Generated Cooklang recipe via {model_path}")
            return json.loads(text)
        except Exception as exc:
            print(f"  ! Model {model_path} attempt failed: {exc}")
            last_err = exc
    raise RuntimeError(f"All Gemini text models failed: {last_err}")


def validate_with_cook_mcp(rel_path: str, content: str) -> tuple[bool, str]:
    """Validate the generated .cook content using @cookmd/mcp."""
    node_script = """
const { spawn } = require("child_process");
const relPath = process.env.COOK_VALIDATE_PATH;
const content = process.env.COOK_VALIDATE_CONTENT;
const p = spawn("npx", ["-y", "@cookmd/mcp@0.2.3"], { env: { ...process.env, COOK_RECIPES_DIR: process.cwd() } });
let buf = "";
p.stdout.on("data", d => {
  buf += d.toString();
  const lines = buf.split("\\n");
  buf = lines.pop();
  for (const l of lines) {
    if (!l.trim()) continue;
    const msg = JSON.parse(l);
    if (msg.id === 1) {
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "validate", arguments: { content, as_path: relPath } } }) + "\\n");
    } else if (msg.id === 2) {
      console.log(msg.result.content[0].text);
      process.exit(0);
    }
  }
});
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "auto-import", version: "1.0" } } }) + "\\n");
"""
    env = os.environ.copy()
    env["COOK_VALIDATE_PATH"] = rel_path
    env["COOK_VALIDATE_CONTENT"] = content
    try:
        proc = subprocess.run(
            ["node", "-e", node_script],
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=45,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            res = json.loads(proc.stdout.strip())
            ok = bool(res.get("ok", False))
            diagnostics = res.get("diagnostics", [])
            return ok, json.dumps(diagnostics, indent=2)
    except Exception as exc:
        print(f"  ! MCP validation check warning: {exc}")
    return True, "[]"


def update_aisle_conf(additions: list[dict]) -> None:
    if not additions or not AISLE_CONF_PATH.exists():
        return

    content = AISLE_CONF_PATH.read_text(encoding="utf-8")
    existing_items = {
        part.strip().lower()
        for line in content.splitlines()
        if line.strip() and not line.strip().startswith("[")
        for part in line.split("|")
    }

    lines = content.splitlines()
    changed = False

    for entry in additions:
        item = (entry.get("item") or "").strip()
        section = (entry.get("section") or "pantry & baking").strip().lower()
        hint = (entry.get("synonym_group_hint") or "").strip().lower()
        if not item or item.lower() in existing_items:
            continue

        # 1. If hint matches an existing line, append ` | <item>` to that line
        placed = False
        if hint:
            for idx, line in enumerate(lines):
                if line.strip().startswith("[") or not line.strip():
                    continue
                parts = [p.strip().lower() for p in line.split("|")]
                if hint in parts:
                    lines[idx] = f"{line.rstrip()} | {item}"
                    existing_items.add(item.lower())
                    placed = True
                    changed = True
                    print(f"  ✓ Added '{item}' to aisle.conf line with '{hint}'")
                    break

        if placed:
            continue

        # 2. Otherwise insert at the end of the matching [section]
        sec_header = f"[{section}]"
        sec_idx = None
        for idx, line in enumerate(lines):
            if line.strip().lower() == sec_header:
                sec_idx = idx
                break

        if sec_idx is not None:
            insert_at = sec_idx + 1
            while insert_at < len(lines) and lines[insert_at].strip() and not lines[insert_at].strip().startswith("["):
                insert_at += 1
            lines.insert(insert_at, item)
        else:
            lines.append(item)

        existing_items.add(item.lower())
        changed = True
        print(f"  ✓ Added '{item}' under [{section}] in aisle.conf")

    if changed:
        AISLE_CONF_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def ensure_no_unknown_aisle_items() -> None:
    """Run collection-wide MCP validate and add any remaining unknown aisle items to [pantry & baking]."""
    node_script = """
const { spawn } = require("child_process");
const p = spawn("npx", ["-y", "@cookmd/mcp@0.2.3"], { env: { ...process.env, COOK_RECIPES_DIR: process.cwd() } });
let buf = "";
p.stdout.on("data", d => {
  buf += d.toString();
  const lines = buf.split("\\n");
  buf = lines.pop();
  for (const l of lines) {
    if (!l.trim()) continue;
    const msg = JSON.parse(l);
    if (msg.id === 1) {
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");
      p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "validate", arguments: {} } }) + "\\n");
    } else if (msg.id === 2) {
      console.log(msg.result.content[0].text);
      process.exit(0);
    }
  }
});
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "auto-import", version: "1.0" } } }) + "\\n");
"""
    try:
        proc = subprocess.run(
            ["node", "-e", node_script],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            timeout=45,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            res = json.loads(proc.stdout.strip())
            unknown = res.get("aisle", {}).get("unknown", [])
            if unknown:
                fallback_additions = [
                    {"section": "pantry & baking", "synonym_group_hint": "", "item": u}
                    for u in unknown
                ]
                update_aisle_conf(fallback_additions)
    except Exception as exc:
        print(f"  ! Collection aisle check warning: {exc}")


def save_16_9_jpeg(raw_image_bytes: bytes, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if Image is None:
        output_path.write_bytes(raw_image_bytes)
        return

    with Image.open(io.BytesIO(raw_image_bytes)) as img:
        img = img.convert("RGB")
        w, h = img.size
        target_ratio = TARGET_WIDTH / TARGET_HEIGHT
        curr_ratio = w / h

        if abs(curr_ratio - target_ratio) > 0.01:
            if curr_ratio > target_ratio:
                new_w = int(h * target_ratio)
                left = (w - new_w) // 2
                img = img.crop((left, 0, left + new_w, h))
            else:
                new_h = int(w / target_ratio)
                top = (h - new_h) // 2
                img = img.crop((0, top, w, top + new_h))

        img = img.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.Resampling.LANCZOS)
        img.save(output_path, format="JPEG", quality=90, optimize=True)


def generate_editorial_photo(api_key: str, title: str, plating_brief: str, output_path: Path) -> None:
    prompt = (
        f"Editorial food photography of '{title}'. "
        f"Plating & Details: {plating_brief} "
        "Generous serving presented in a rustic stoneware bowl, ceramic plate, or wooden board matching the cuisine. "
        "Key visible ingredients, authentic textures, fresh garnishes, subtle rising steam if warm. "
        "Setting: Rustic dining table (dark reclaimed wood or sunlit stone), natural soft side window light, "
        "shallow depth of field (f/2.8), subtle blurred background props (linen napkin, vintage cutlery, water glass). "
        "Technical: 16:9 landscape aspect ratio, editorial food magazine style (Bon Appetit / NYT Cooking). "
        "Ultra-realistic, authentic food textures, no CGI gloss, no text, no watermarks, no labels."
    )

    _, generate_content_models, imagen_models = discover_models(api_key)

    # 1. Try Gemini native image generation models (generateContent)
    for model_path in generate_content_models:
        try:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseModalities": ["TEXT", "IMAGE"],
                },
            }
            resp = gemini_post(api_key, model_path, payload, timeout=120)
            parts = resp.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            for part in parts:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    img_bytes = base64.b64decode(inline["data"])
                    save_16_9_jpeg(img_bytes, output_path)
                    print(f"  ✓ Generated 16:9 photo via {model_path} -> {output_path}")
                    return
        except Exception as exc:
            print(f"  ! Image model {model_path} note: {exc}")

    # 2. Try Imagen 3 / Imagen 4 predict endpoint
    for model_path in imagen_models:
        try:
            payload = {
                "instances": [{"prompt": prompt}],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": "16:9",
                    "outputOptions": {"mimeType": "image/jpeg"},
                },
            }
            resp = gemini_post(api_key, model_path, payload, timeout=120)
            preds = resp.get("predictions", [])
            if preds and preds[0].get("bytesBase64Encoded"):
                img_bytes = base64.b64decode(preds[0]["bytesBase64Encoded"])
                save_16_9_jpeg(img_bytes, output_path)
                print(f"  ✓ Generated 16:9 photo via {model_path} -> {output_path}")
                return
        except Exception as exc:
            print(f"  ! Imagen model {model_path} note: {exc}")

    raise RuntimeError("Failed to generate recipe image from all available Gemini/Imagen endpoints.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-import a recipe into Bubs Recipes.")
    parser.add_argument("--source", default="", help="Recipe URL or raw recipe text")
    parser.add_argument("--notes", default="", help="Optional user notes or modifications")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY", "").strip().strip("'\"")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)
    print(f"  -> GEMINI_API_KEY configured (length={len(api_key)}, AIza_prefix={api_key.startswith('AIza')})")

    raw_source = (args.source or os.environ.get("RECIPE_SOURCE") or "").strip()
    notes = (args.notes or os.environ.get("RECIPE_NOTES") or "").strip()
    if not raw_source:
        print("Error: No recipe source provided via --source or RECIPE_SOURCE.", file=sys.stderr)
        sys.exit(1)

    print(f"==> Starting recipe import for source: {raw_source[:120]}")

    url = extract_first_url(raw_source)
    scraped_data = None
    if url:
        print(f"  -> Detected URL: {url}")
        scraped_data = fetch_webpage_data(url)
        if scraped_data.get("json_ld"):
            print(f"  ✓ Extracted Schema.org Recipe JSON-LD: {scraped_data['json_ld'].get('title')}")
        else:
            print("  ! No JSON-LD found; using extracted webpage text.")

    print("  -> Generating Cooklang (.cook) and aisle mappings via Gemini...")
    result = generate_cooklang_via_gemini(api_key, raw_source, notes, scraped_data)

    category = (result.get("category") or "mains").strip().lower()
    if category not in VALID_CATEGORIES:
        category = "mains"

    slug = re.sub(r"[^a-z0-9]+", "-", (result.get("slug") or "new-recipe").lower()).strip("-")[:80].strip("-")
    if not slug:
        slug = "imported-recipe"
    title = result.get("title") or slug.replace("-", " ").title()
    cook_content = (result.get("cook_content") or "").strip() + "\n"

    rel_cook_path = f"recipes/{category}/{slug}.cook"
    ok, diag_json = validate_with_cook_mcp(rel_cook_path, cook_content)
    if not ok:
        print(f"  ! Initial validation reported issues: {diag_json}. Requesting auto-repair from Gemini...")
        result = generate_cooklang_via_gemini(
            api_key,
            raw_source,
            notes,
            scraped_data,
            validation_errors=diag_json,
            previous_draft=cook_content,
        )
        cook_content = (result.get("cook_content") or "").strip() + "\n"

    cook_file_path = (REPO_ROOT / rel_cook_path).resolve()
    if not str(cook_file_path).startswith(str(RECIPES_DIR.resolve()) + os.sep):
        raise RuntimeError(f"Refusing to write outside recipes directory: {cook_file_path}")
    cook_file_path.parent.mkdir(parents=True, exist_ok=True)
    cook_file_path.write_text(cook_content, encoding="utf-8")
    print(f"  ✓ Saved Cooklang recipe: {rel_cook_path}")

    update_aisle_conf(result.get("aisle_additions") or [])
    ensure_no_unknown_aisle_items()

    img_file_path = (REPO_ROOT / f"recipes/{category}/{slug}.jpg").resolve()
    if not str(img_file_path).startswith(str(RECIPES_DIR.resolve()) + os.sep):
        raise RuntimeError(f"Refusing to write image outside recipes directory: {img_file_path}")
    plating_brief = result.get("photo_plating_brief") or f"A generous serving of {title}, freshly prepared."
    print(f"  -> Generating 16:9 editorial photograph for '{title}'...")
    generate_editorial_photo(api_key, title, plating_brief, img_file_path)

    # Write GitHub Actions step summary if running in CI
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f_sum:
            f_sum.write(f"## 🍽️ Imported Recipe: {title}\n")
            f_sum.write(f"- **Category**: `{category}`\n")
            f_sum.write(f"- **Recipe File**: `{rel_cook_path}`\n")
            f_sum.write(f"- **Photo File**: `recipes/{category}/{slug}.jpg`\n")
            if url:
                f_sum.write(f"- **Source URL**: {url}\n")

    print(f"==> Successfully imported '{title}' -> {rel_cook_path}")


if __name__ == "__main__":
    main()
