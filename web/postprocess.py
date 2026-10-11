#!/usr/bin/env python3
"""
postprocess.py - Post-build enhancement pipeline for Bubs Recipes

Performs:
1. Icon replacement with custom Bubs Recipes branding.
2. Web Manifest update with correct relative scopes and theme colors.
3. CSS injection (custom warm theme, smooth card transitions, checklist styling).
4. Custom JS injection (interactive ingredient strikethrough, category emojis, brand header).
5. Service Worker installation and dynamic pre-caching of all recipe pages.
6. HTML head enrichment (PWA meta tags, title cleanups, footer branding).
"""

import os
import sys
import shutil
import re
from pathlib import Path

def postprocess(site_dir_str="_site"):
    site_dir = Path(site_dir_str).resolve()
    repo_root = Path(__file__).resolve().parent.parent
    web_dir = repo_root / "web"

    if not site_dir.exists():
        print(f"Error: Site directory '{site_dir}' does not exist.")
        sys.exit(1)

    print(f"==> Post-processing Bubs Recipes at: {site_dir}")

    # 1. Copy custom icons
    icons_src = web_dir / "icons"
    static_dst = site_dir / "static"
    static_dst.mkdir(parents=True, exist_ok=True)

    if icons_src.exists():
        for icon_file in icons_src.glob("*"):
            if icon_file.is_file() and icon_file.suffix in [".png", ".ico", ".svg"]:
                shutil.copy2(icon_file, static_dst / icon_file.name)
        print("  ✓ Custom icons copied to static/")

    # 2. Update Manifest
    manifest_src = web_dir / "manifest.json"
    if manifest_src.exists():
        shutil.copy2(manifest_src, static_dst / "site.webmanifest")
        shutil.copy2(manifest_src, site_dir / "manifest.json")
        print("  ✓ PWA web manifest updated (site.webmanifest & manifest.json)")

    # 3. Copy custom.js to static/js/
    js_dst = static_dst / "js"
    js_dst.mkdir(parents=True, exist_ok=True)
    custom_js_src = web_dir / "custom.js"
    if custom_js_src.exists():
        shutil.copy2(custom_js_src, js_dst / "custom.js")
        print("  ✓ custom.js installed")

    # 4. Append/Update custom.css in static/css/output.css
    output_css = static_dst / "css" / "output.css"
    custom_css_src = web_dir / "custom.css"
    if custom_css_src.exists() and output_css.exists():
        with open(custom_css_src, "r", encoding="utf-8") as f_in:
            custom_css_content = f_in.read()
        with open(output_css, "r", encoding="utf-8") as f_curr:
            curr_content = f_curr.read()
        marker = "/* ========================================================\n   Bubs Recipes - Custom Brand & Layout Polish"
        if marker in curr_content:
            base_content = curr_content.split(marker)[0].rstrip()
            with open(output_css, "w", encoding="utf-8") as f_out:
                f_out.write(base_content + "\n\n" + custom_css_content)
            print("  ✓ custom.css updated cleanly in output.css")
        else:
            with open(output_css, "a", encoding="utf-8") as f_out:
                f_out.write("\n\n" + custom_css_content)
            print("  ✓ custom.css appended to output.css")

    # 5. Collect all HTML and static assets for Service Worker pre-caching
    all_html_files = list(site_dir.rglob("*.html"))
    precache_list = [
        "./",
        "./index.html",
        "./static/css/output.css",
        "./static/css/cooking-mode.css",
        "./static/js/custom.js",
        "./static/js/search.js",
        "./static/js/timers.js",
        "./static/js/cooking-mode.js",
        "./static/search-index.js",
        "./static/site.webmanifest",
        "./manifest.json",
        "./static/favicon.ico",
        "./static/apple-touch-icon.png",
        "./static/android-chrome-192x192.png",
        "./static/android-chrome-512x512.png"
    ]

    for html_file in all_html_files:
        rel = html_file.relative_to(site_dir).as_posix()
        rel_path = f"./{rel}"
        if rel_path not in precache_list:
            precache_list.append(rel_path)

    # Pre-cache all local recipe images (.jpg, .png, .webp)
    for ext in ["*.jpg", "*.jpeg", "*.png", "*.webp"]:
        for img_file in site_dir.rglob(ext):
            rel = img_file.relative_to(site_dir).as_posix()
            rel_path = f"./{rel}"
            if rel_path not in precache_list:
                precache_list.append(rel_path)

    # 6. Install Service Worker with dynamic pre-cache list
    sw_src = web_dir / "sw.js"
    if sw_src.exists():
        with open(sw_src, "r", encoding="utf-8") as f:
            sw_code = f.read()
        
        # Format precache array into JS
        formatted_assets = ",\n  ".join(f"'{p}'" for p in precache_list)
        sw_code = re.sub(
            r"const PRECACHE_ASSETS = \[[\s\S]*?\];",
            f"const PRECACHE_ASSETS = [\n  {formatted_assets}\n];",
            sw_code
        )

        with open(site_dir / "sw.js", "w", encoding="utf-8") as f:
            f.write(sw_code)
        print(f"  ✓ Service worker created with {len(precache_list)} pre-cached routes")

    # 7. Enrich HTML pages
    pwa_head_meta = """
    <!-- PWA & Apple Touch Meta Tags -->
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Bubs Recipes">
    <meta name="theme-color" content="#e05a2f">
    <link rel="apple-touch-icon" href="{rel_prefix}static/apple-touch-icon.png">
    """

    pwa_scripts_template = """
    <!-- Custom Interactions & PWA Service Worker -->
    <script src="{rel_prefix}static/js/custom.js"></script>
    <script>
        if ('serviceWorker' in navigator) {{
            window.addEventListener('load', function() {{
                // Auto-unregister legacy domain root service worker (e.g. old root CineBubs with scope '/')
                navigator.serviceWorker.getRegistrations().then(function(regs) {{
                    for (var i = 0; i < regs.length; i++) {{
                        try {{
                            var p = new URL(regs[i].scope).pathname;
                            if (p === '/' || p === '') {{
                                console.warn('Unregistering legacy root SW:', regs[i].scope);
                                regs[i].unregister();
                            }}
                        }} catch (e) {{}}
                    }}
                }});
                navigator.serviceWorker.register('{rel_prefix}sw.js', {{ scope: '/bubsrecipes/' }}).catch(function(err) {{
                    console.warn('SW registration failed:', err);
                }});
            }});
        }}
    </script>
</body>
"""

    modified_count = 0
    for html_file in all_html_files:
        rel_to_root = html_file.relative_to(site_dir)
        depth = len(rel_to_root.parts) - 1
        rel_prefix = "../" * depth if depth > 0 else "./"

        with open(html_file, "r", encoding="utf-8") as f:
            content = f.read()

        # Update titles
        content = re.sub(r"<title>Recipes - Cook</title>", "<title>Bubs Recipes</title>", content)
        content = re.sub(r"<title>(.*?) - Cook</title>", r"<title>\1 | Bubs Recipes</title>", content)

        # Update brand-mark alt
        content = content.replace('alt="Cook" class="brand-mark', 'alt="Bubs Recipes" class="brand-mark')

        # Transform All Recipes heading on home page
        if html_file.name == "index.html" and len(rel_to_root.parts) == 1:
            hero_pattern = r'<h1 class="text-display font-bold text-text">\s*All Recipes\s*</h1>'
            hero_replacement = (
                '<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">\n'
                '            <h1 class="text-display font-bold text-text bubs-hero-title">\n'
                '                Bubs Recipes\n'
                '            </h1>\n'
                '            <span class="bubs-hero-subtitle text-sm font-semibold tracking-wider uppercase text-muted">\n'
                '                &middot; All Recipes\n'
                '            </span>\n'
                '        </div>'
            )
            content = re.sub(hero_pattern, hero_replacement, content)

        # Inject PWA Head Meta before </head>
        formatted_meta = pwa_head_meta.format(rel_prefix=rel_prefix)
        if '<meta name="apple-mobile-web-app-capable"' not in content:
            content = content.replace("</head>", f"{formatted_meta}\n</head>")

        # Inject / Update Scripts before </body>
        marker = "<!-- Custom Interactions & PWA Service Worker -->"
        formatted_scripts = pwa_scripts_template.format(rel_prefix=rel_prefix)
        if marker in content:
            content = re.sub(
                r"<!-- Custom Interactions & PWA Service Worker -->[\s\S]*?</body>",
                formatted_scripts,
                content
            )
        else:
            content = content.replace("</body>", formatted_scripts)

        # Polish footer text
        content = re.sub(
            r'Built with\s*<a href="https://cooklang\.org/cli/"',
            r'Bubs Recipes &middot; Built with <a href="https://cooklang.org/cli/"',
            content
        )

        with open(html_file, "w", encoding="utf-8") as f:
            f.write(content)
        modified_count += 1

    print(f"  ✓ Enriched {modified_count} HTML pages with PWA meta, title branding, and scripts")
    print("==> Post-processing complete successfully!")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "_site"
    postprocess(target)
