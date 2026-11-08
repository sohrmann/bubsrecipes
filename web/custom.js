// ========================================================
// Bubs Recipes - Client Polish & Interactions
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Two-Way Interactive Ingredient & Cookware Checklist
  // Crossing off an item in the sidebar crosses it off in recipe text/step refs (and vice-versa).
  const cleanName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const getStepRefName = (span) => {
    if (!span) return '';
    const text = span.textContent || '';
    const colonIdx = text.indexOf(':');
    const raw = colonIdx !== -1 ? text.substring(0, colonIdx) : text;
    return cleanName(raw.replace(/[,;]+$/, ''));
  };

  const getSidebarSection = (row) => {
    const ul = row.closest('ul.ingredient-list');
    if (!ul) return '';
    let prev = ul.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'H3' && !prev.textContent.toLowerCase().includes('cookware')) {
        return cleanName(prev.textContent);
      }
      if (prev.tagName === 'H2') break;
      prev = prev.previousElementSibling;
    }
    return '';
  };

  const getStepSection = (element) => {
    const ol = element.closest('ol.step-list');
    if (!ol) return '';
    let prev = ol.previousElementSibling;
    while (prev) {
      if (['H2', 'H3'].includes(prev.tagName) && prev.classList.contains('border-b')) {
        return cleanName(prev.textContent);
      }
      prev = prev.previousElementSibling;
    }
    return '';
  };

  const findMatchingElements = (type, name, section) => {
    const result = { rows: [], badges: [], refs: [] };
    if (!name) return result;

    if (type === 'cookware') {
      document.querySelectorAll('ul.cookware-list li.ingredient-row').forEach((row) => {
        if (cleanName(row.querySelector('.font-medium')?.textContent) === name) {
          result.rows.push(row);
        }
      });
      document.querySelectorAll('.cookware-badge').forEach((badge) => {
        if (cleanName(badge.textContent) === name) {
          result.badges.push(badge);
        }
      });
      return result;
    }

    // Type is 'ingredient'
    const allRows = Array.from(document.querySelectorAll('ul.ingredient-list:not(.cookware-list) li.ingredient-row'));
    const allBadges = Array.from(document.querySelectorAll('.ingredient-badge'));
    const allRefs = Array.from(document.querySelectorAll('.step-refs span'));

    if (section) {
      const secRows = allRows.filter((r) => cleanName(r.querySelector('.font-medium')?.textContent) === name && getSidebarSection(r) === section);
      const secBadges = allBadges.filter((b) => cleanName(b.textContent) === name && getStepSection(b) === section);
      const secRefs = allRefs.filter((r) => getStepRefName(r) === name && getStepSection(r) === section);

      if (secRows.length > 0 && (secBadges.length > 0 || secRefs.length > 0)) {
        result.rows = secRows;
        result.badges = secBadges;
        result.refs = secRefs;
        return result;
      }
    }

    // Fallback: match by name across the entire recipe
    result.rows = allRows.filter((r) => cleanName(r.querySelector('.font-medium')?.textContent) === name);
    result.badges = allBadges.filter((b) => cleanName(b.textContent) === name);
    result.refs = allRefs.filter((r) => getStepRefName(r) === name);
    return result;
  };

  const toggleItems = (type, name, section, forcedState) => {
    const matches = findMatchingElements(type, name, section);
    matches.rows.forEach((el) => el.classList.toggle('checked', forcedState));
    matches.badges.forEach((el) => el.classList.toggle('checked', forcedState));
    matches.refs.forEach((el) => el.classList.toggle('checked', forcedState));
  };

  // Set friendly tooltips on all interactive elements
  document.querySelectorAll('ul.ingredient-list:not(.cookware-list) li.ingredient-row').forEach((row) => {
    row.setAttribute('title', 'Tap to cross off ingredient');
  });
  document.querySelectorAll('ul.cookware-list li.ingredient-row').forEach((row) => {
    row.setAttribute('title', 'Tap to cross off cookware');
  });
  document.querySelectorAll('.ingredient-badge').forEach((badge) => {
    badge.setAttribute('title', 'Tap to cross off ingredient');
  });
  document.querySelectorAll('.cookware-badge').forEach((badge) => {
    badge.setAttribute('title', 'Tap to cross off cookware');
  });
  document.querySelectorAll('.step-refs span').forEach((ref) => {
    ref.setAttribute('title', 'Tap to cross off ingredient');
  });

  // Event delegation for clicks across ingredients and cookware
  document.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;

    const row = e.target.closest('.ingredient-row');
    const ingBadge = e.target.closest('.ingredient-badge');
    const cookBadge = e.target.closest('.cookware-badge');
    const stepRef = e.target.closest('.step-refs span');

    if (row) {
      const isCookware = !!row.closest('.cookware-list');
      const name = cleanName(row.querySelector('.font-medium')?.textContent);
      const section = isCookware ? '' : getSidebarSection(row);
      const targetChecked = !row.classList.contains('checked');
      toggleItems(isCookware ? 'cookware' : 'ingredient', name, section, targetChecked);
    } else if (ingBadge) {
      const name = cleanName(ingBadge.textContent);
      const section = getStepSection(ingBadge);
      const targetChecked = !ingBadge.classList.contains('checked');
      toggleItems('ingredient', name, section, targetChecked);
    } else if (cookBadge) {
      const name = cleanName(cookBadge.textContent);
      const targetChecked = !cookBadge.classList.contains('checked');
      toggleItems('cookware', name, '', targetChecked);
    } else if (stepRef) {
      const name = getStepRefName(stepRef);
      const section = getStepSection(stepRef);
      const targetChecked = !stepRef.classList.contains('checked');
      toggleItems('ingredient', name, section, targetChecked);
    }
  });

  // 2. Friendly Category Icons on the Home Page
  const categoryEmojis = {
    baking: '🥐',
    breakfast: '🥞',
    mains: '🍲',
    salads: '🥗',
    sauces: '🫙',
    desserts: '🍰',
    drinks: '🍹',
    snacks: '🥨'
  };

  const directoryCards = document.querySelectorAll('.recipe-card[data-type="directory"]');
  directoryCards.forEach((card) => {
    const name = card.getAttribute('data-name')?.toLowerCase();
    if (name && categoryEmojis[name]) {
      const iconSpan = card.querySelector('.recipe-card-icon span');
      if (iconSpan) {
        iconSpan.textContent = categoryEmojis[name];
        iconSpan.classList.add('category-icon-emoji');
      }
    }
  });

  // 3. Brand Title in Navigation if not already present
  const brandImg = document.querySelector('nav .brand-mark');
  if (brandImg && !document.querySelector('.brand-text')) {
    const brandLink = brandImg.closest('a');
    if (brandLink) {
      brandLink.classList.remove('hidden');
      brandLink.classList.add('flex', 'items-center', 'space-x-2', 'brand-link');
      const text = document.createElement('span');
      text.className = 'brand-text font-bold text-lg tracking-tight text-text hidden sm:inline';
      text.textContent = 'Bubs Recipes';
      brandLink.appendChild(text);
    }
  }

  // 4. Bubs Recipes Header on Home Page (Subtle Fade Effect)
  const homeHeading = document.querySelector('main h1.text-display');
  if (homeHeading && homeHeading.textContent.trim() === 'All Recipes' && !homeHeading.classList.contains('bubs-hero-title')) {
    homeHeading.classList.add('bubs-hero-title');
    homeHeading.textContent = 'Bubs Recipes';
    const sub = document.createElement('span');
    sub.className = 'bubs-hero-subtitle text-sm font-semibold tracking-wider uppercase text-muted';
    sub.innerHTML = '&middot; All Recipes';
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-wrap items-baseline gap-x-3 gap-y-1';
    homeHeading.parentNode.insertBefore(wrapper, homeHeading);
    wrapper.appendChild(homeHeading);
    wrapper.appendChild(sub);
  }

  // 5. Auto-cleanup of legacy root-level Service Worker (e.g. old root CineBubs with scope '/')
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        try {
          const scopePath = new URL(reg.scope).pathname;
          if (scopePath === '/' || scopePath === '') {
            console.warn('Unregistering legacy root Service Worker:', reg.scope);
            reg.unregister().then((success) => {
              if (success) console.log('Successfully unregistered legacy root Service Worker.');
            });
          }
        } catch (e) {
          console.error('Error checking service worker registration:', e);
        }
      }
    });
  }

  // 6. Quick Recipe Import (+ Add Recipe Modal, Magic Setup Link, & Android Share Target)
  const TOKEN_STORAGE_KEY = 'bubs_gh_import_token';
  const GITHUB_DISPATCH_URL =
    'https://api.github.com/repos/sohrmann/bubsrecipes/actions/workflows/import-recipe.yml/dispatches';
  const VALID_TOKEN_RE = /^(github_pat_[A-Za-z0-9_]{20,255}|gh[pousr]_[A-Za-z0-9_]{20,255})$/;

  const escapeHtml = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const isValidTokenFormat = (t) => VALID_TOKEN_RE.test((t || '').trim());
  const getToken = () => (localStorage.getItem(TOKEN_STORAGE_KEY) || '').trim();
  const setToken = (t) => {
    const clean = (t || '').trim();
    if (clean && isValidTokenFormat(clean)) {
      localStorage.setItem(TOKEN_STORAGE_KEY, clean);
      return true;
    }
    if (!clean) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    return false;
  };

  // Toast helper
  const toastEl = document.createElement('div');
  toastEl.className = 'bubs-toast print:hidden';
  document.body.appendChild(toastEl);
  let toastTimer = null;
  const showToast = (msg, durationMs = 4200) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), durationMs);
  };

  // Build Modal DOM
  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'bubs-modal-backdrop print:hidden';
  modalBackdrop.setAttribute('role', 'dialog');
  modalBackdrop.setAttribute('aria-modal', 'true');
  modalBackdrop.setAttribute('aria-labelledby', 'bubs-import-title');

  modalBackdrop.innerHTML = `
    <div class="bubs-modal-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
        <h2 id="bubs-import-title" style="font-size:1.15rem;font-weight:700;margin:0;display:flex;align-items:center;gap:0.45rem;">
          <span>✨</span> <span>Add Recipe</span>
        </h2>
        <button type="button" id="bubs-modal-close" class="icon-btn" aria-label="Close">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <p style="font-size:0.85rem;opacity:0.75;margin:0 0 0.9rem 0;line-height:1.4;">
        Paste a recipe link or text in any language. It will be translated into English Cooklang with a custom 16:9 photo in ~60 seconds.
      </p>

      <form id="bubs-import-form">
        <div style="margin-bottom:0.75rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem;">
            <label for="bubs-recipe-source" style="font-size:0.8125rem;font-weight:600;">Recipe Link or Text</label>
            <button type="button" id="bubs-paste-btn" class="bubs-btn-secondary" style="padding:0.2rem 0.55rem;font-size:0.75rem;">
              📋 Paste
            </button>
          </div>
          <textarea id="bubs-recipe-source" class="bubs-textarea" rows="3" required
            placeholder="https://example.com/recipe or paste full recipe text..."></textarea>
        </div>

        <div style="margin-bottom:0.9rem;">
          <label for="bubs-recipe-notes" style="display:block;font-size:0.8125rem;font-weight:600;margin-bottom:0.35rem;">
            Optional Tweaks <span style="font-weight:400;opacity:0.65;">(e.g. servings, vegetarian)</span>
          </label>
          <input type="text" id="bubs-recipe-notes" class="bubs-input" placeholder="Leave blank to import as-is">
        </div>

        <div id="bubs-token-section" style="margin-bottom:0.9rem;display:none;padding:0.75rem;border-radius:8px;background:var(--accent-soft);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.25rem;">
            <label for="bubs-token-input" style="font-size:0.8125rem;font-weight:600;">
              🔑 One-Time Setup Key
            </label>
            <button type="button" id="bubs-clear-token-btn" class="bubs-btn-secondary" style="font-size:0.7rem;padding:0.15rem 0.45rem;display:none;">
              Forget Key
            </button>
          </div>
          <p style="font-size:0.75rem;opacity:0.8;margin:0 0 0.5rem 0;line-height:1.35;">
            Enter your fine-grained GitHub token (Actions: Read &amp; Write on <code>bubsrecipes</code>) or use a 1-tap Magic Setup Link.
          </p>
          <input type="password" id="bubs-token-input" class="bubs-input" placeholder="github_pat_..." autocomplete="off">
        </div>

        <div id="bubs-status-box" style="display:none;margin-bottom:0.9rem;padding:0.7rem 0.85rem;border-radius:8px;font-size:0.84rem;line-height:1.4;"></div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:0.4rem;">
            <button type="button" id="bubs-share-setup-btn" class="bubs-btn-secondary" title="Copy a 1-tap setup link to send to your partner" style="display:none;">
              💌 Partner Setup Link
            </button>
            <button type="button" id="bubs-toggle-token-btn" class="bubs-btn-secondary" style="font-size:0.75rem;padding:0.35rem 0.6rem;">
              ⚙️ Key
            </button>
          </div>

          <button type="submit" id="bubs-submit-btn" class="bubs-add-recipe-btn" style="padding:0.55rem 1.1rem;">
            <span>🍰 Import Recipe</span>
          </button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modalBackdrop);

  const sourceInput = modalBackdrop.querySelector('#bubs-recipe-source');
  const notesInput = modalBackdrop.querySelector('#bubs-recipe-notes');
  const tokenSection = modalBackdrop.querySelector('#bubs-token-section');
  const tokenInput = modalBackdrop.querySelector('#bubs-token-input');
  const statusBox = modalBackdrop.querySelector('#bubs-status-box');
  const shareSetupBtn = modalBackdrop.querySelector('#bubs-share-setup-btn');
  const toggleTokenBtn = modalBackdrop.querySelector('#bubs-toggle-token-btn');
  const clearTokenBtn = modalBackdrop.querySelector('#bubs-clear-token-btn');
  const pasteBtn = modalBackdrop.querySelector('#bubs-paste-btn');
  const submitBtn = modalBackdrop.querySelector('#bubs-submit-btn');
  const closeBtn = modalBackdrop.querySelector('#bubs-modal-close');
  const formEl = modalBackdrop.querySelector('#bubs-import-form');

  const syncTokenUI = () => {
    const hasToken = !!getToken();
    tokenSection.style.display = hasToken ? 'none' : 'block';
    shareSetupBtn.style.display = hasToken ? 'inline-flex' : 'none';
    if (clearTokenBtn) clearTokenBtn.style.display = hasToken ? 'inline-flex' : 'none';
    if (hasToken) {
      tokenInput.value = getToken();
    }
  };

  const setStatus = (type, htmlMsg) => {
    if (!htmlMsg) {
      statusBox.style.display = 'none';
      statusBox.innerHTML = '';
      return;
    }
    statusBox.style.display = 'block';
    if (type === 'error') {
      statusBox.style.background = '#fee2e2';
      statusBox.style.color = '#991b1b';
    } else if (type === 'success') {
      statusBox.style.background = '#dcfce7';
      statusBox.style.color = '#166534';
    } else {
      statusBox.style.background = 'var(--accent-soft)';
      statusBox.style.color = 'var(--text)';
    }
    statusBox.innerHTML = htmlMsg;
  };

  const openImportModal = (prefillSource = '', prefillNotes = '') => {
    syncTokenUI();
    setStatus('', '');
    if (prefillSource) sourceInput.value = prefillSource;
    if (prefillNotes) notesInput.value = prefillNotes;
    modalBackdrop.classList.add('open');
    setTimeout(() => sourceInput.focus(), 60);
  };

  const closeImportModal = () => {
    modalBackdrop.classList.remove('open');
  };

  closeBtn.addEventListener('click', closeImportModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeImportModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) {
      closeImportModal();
    }
  });

  toggleTokenBtn.addEventListener('click', () => {
    const isHidden = tokenSection.style.display === 'none';
    tokenSection.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      tokenInput.value = getToken();
      tokenInput.focus();
    }
  });

  if (clearTokenBtn) {
    clearTokenBtn.addEventListener('click', () => {
      setToken('');
      tokenInput.value = '';
      syncTokenUI();
      showToast('🔑 Saved key removed from this device');
    });
  }

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        sourceInput.value = text.trim();
        showToast('📋 Pasted from clipboard');
      } else {
        showToast('Clipboard is empty');
      }
    } catch {
      sourceInput.focus();
      showToast('Long-press inside the box to paste');
    }
  });

  shareSetupBtn.addEventListener('click', async () => {
    const token = getToken();
    if (!token) return;
    const magicUrl = `${window.location.origin}/#setup=${encodeURIComponent(token)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Bubs Recipes Setup Link',
          text: 'Tap this link once to unlock adding recipes in Bubs Recipes:',
          url: magicUrl
        });
        return;
      }
    } catch {
      // Fallback to clipboard copy if user cancels share sheet
    }
    try {
      await navigator.clipboard.writeText(magicUrl);
      showToast('💌 Magic Setup Link copied! Send it to your partner.');
    } catch {
      prompt('Copy this Magic Setup Link for your partner:', magicUrl);
    }
  });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sourceVal = sourceInput.value.trim();
    const notesVal = notesInput.value.trim();

    if (tokenSection.style.display !== 'none' && tokenInput.value.trim()) {
      if (!setToken(tokenInput.value.trim())) {
        setStatus(
          'error',
          'Invalid token format. Please enter a fine-grained GitHub token starting with <code>github_pat_</code>.'
        );
        return;
      }
      syncTokenUI();
    }

    const token = getToken();
    if (!token) {
      tokenSection.style.display = 'block';
      tokenInput.focus();
      setStatus('error', 'Please enter your one-time setup key first.');
      return;
    }

    if (!sourceVal) {
      sourceInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.65';
    setStatus('info', '⏳ Sending recipe to Bubs Kitchen Bot...');

    try {
      const res = await fetch(GITHUB_DISPATCH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            source: sourceVal,
            notes: notesVal
          }
        })
      });

      if (res.status === 204 || res.ok) {
        sourceInput.value = '';
        notesInput.value = '';
        setStatus(
          'success',
          '🎉 <strong>Cooking up your recipe &amp; 16:9 photo!</strong><br>' +
            'It will be live on <strong>recipes.bubs.page</strong> in about 60–90 seconds. ' +
            '<a href="https://github.com/sohrmann/bubsrecipes/actions/workflows/import-recipe.yml" target="_blank" rel="noopener" style="text-decoration:underline;font-weight:600;">View progress &rarr;</a>'
        );
        showToast('🍰 Recipe queued! Live in ~60–90 seconds.');
      } else if (res.status === 401 || res.status === 403) {
        tokenSection.style.display = 'block';
        setStatus(
          'error',
          `🔑 Key rejected (HTTP ${res.status}). Make sure your token has <strong>Actions: Read &amp; Write</strong> permission on <code>bubsrecipes</code>.`
        );
      } else {
        const errText = await res.text();
        setStatus('error', `Could not start import (HTTP ${escapeHtml(res.status)}): ${escapeHtml(errText.slice(0, 140))}`);
      }
    } catch (err) {
      setStatus('error', `Network error: ${escapeHtml(err.message || 'Check your internet connection.')}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  });

  // Inject "+ Add" button into Navbar & Mobile menu
  const navRight = document.querySelector('nav .order-3');
  if (navRight && !document.getElementById('bubs-nav-add-btn')) {
    const addBtn = document.createElement('button');
    addBtn.id = 'bubs-nav-add-btn';
    addBtn.type = 'button';
    addBtn.className = 'bubs-add-recipe-btn print:hidden';
    addBtn.setAttribute('title', 'Import a new recipe from a link or text');
    addBtn.innerHTML = '<span>＋</span> <span>Add</span>';
    addBtn.addEventListener('click', () => openImportModal());
    navRight.insertBefore(addBtn, navRight.firstChild);
  }

  const moreDropdown = document.getElementById('more-dropdown');
  if (moreDropdown && !document.getElementById('bubs-menu-add-item')) {
    const menuItem = document.createElement('button');
    menuItem.id = 'bubs-menu-add-item';
    menuItem.type = 'button';
    menuItem.className = 'menu-item w-full text-left';
    menuItem.innerHTML = '<span>✨</span> <span>Add Recipe</span>';
    menuItem.addEventListener('click', () => {
      moreDropdown.classList.add('hidden');
      openImportModal();
    });
    moreDropdown.appendChild(menuItem);
  }

  // Handle 1-Tap Magic Setup Link (#setup=github_pat_...)
  if (window.location.hash && window.location.hash.startsWith('#setup=')) {
    const rawToken = decodeURIComponent(window.location.hash.slice('#setup='.length)).trim();
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (setToken(rawToken)) {
      showToast('✨ Bubs Recipes Connected! You can now add recipes anytime.', 5500);
    } else {
      showToast('⚠️ Invalid setup link token format.', 4500);
    }
  }

  // Handle Android PWA Share Target (?share=1&url=...&text=...&title=...)
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has('share') || searchParams.has('url') || searchParams.has('text')) {
    const sharedUrl = (searchParams.get('url') || '').trim();
    const sharedText = (searchParams.get('text') || '').trim();
    const sharedTitle = (searchParams.get('title') || '').trim();
    const combined = sharedUrl || sharedText || sharedTitle;
    if (combined) {
      history.replaceState(null, '', window.location.pathname);
      openImportModal(combined, sharedUrl && sharedTitle ? sharedTitle : '');
    }
  }

  // 7. Dynamic Recipe Portion & Servings Scaler
  const servingsPill = document.querySelector('.metadata-pill.metadata-servings');
  if (servingsPill) {
    const rawServingsText = (servingsPill.textContent || '').trim();
    const servingsMatch = rawServingsText.match(/(\d+(?:\.\d+)?)/);
    const baseServings = servingsMatch ? parseFloat(servingsMatch[1]) : null;

    if (baseServings && baseServings > 0) {
      // Snapshot original sidebar quantities, step-ref quantities, and cooking-mode JSON
      const sidebarValues = Array.from(
        document.querySelectorAll('ul.ingredient-list:not(.cookware-list) li.ingredient-row .row-value')
      ).map((el) => ({
        el,
        origText: (el.textContent || '').trim()
      }));

      const stepRefSpans = Array.from(document.querySelectorAll('.step-refs span')).map((el) => ({
        el,
        origText: (el.textContent || '').trim()
      }));

      const cookingModeScript = document.getElementById('cooking-mode-data');
      let origCookingDataStr = null;
      if (cookingModeScript) {
        origCookingDataStr = cookingModeScript.textContent;
      }

      // Parse a numeric/fraction token (e.g. "200", "1.5", "1/2", "1 1/2") -> float or null
      const parseSingleNumber = (str) => {
        const s = (str || '').trim();
        if (!s) return null;
        // Mixed fraction e.g. "1 1/2"
        const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
        if (mixedMatch) {
          const den = parseFloat(mixedMatch[3]);
          return den ? parseFloat(mixedMatch[1]) + parseFloat(mixedMatch[2]) / den : null;
        }
        // Simple fraction e.g. "1/2"
        const fracMatch = s.match(/^(\d+)\/(\d+)$/);
        if (fracMatch) {
          const den = parseFloat(fracMatch[2]);
          return den ? parseFloat(fracMatch[1]) / den : null;
        }
        // Decimal or integer
        if (/^\d+(?:\.\d+)?$/.test(s)) {
          return parseFloat(s);
        }
        return null;
      };

      const FRACTIONS = [
        [1 / 8, '1/8'],
        [1 / 4, '1/4'],
        [1 / 3, '1/3'],
        [3 / 8, '3/8'],
        [1 / 2, '1/2'],
        [5 / 8, '5/8'],
        [2 / 3, '2/3'],
        [3 / 4, '3/4'],
        [7 / 8, '7/8']
      ];

      const formatScaledSingle = (val, wasFraction, unitHint) => {
        if (val <= 0) return '0';
        const u = (unitHint || '').trim().toLowerCase();
        const isMetricMassOrVol = u === 'g' || u === 'ml';
        const isSpoonOrCup =
          wasFraction || ['tsp', 'tbsp', 'cup', 'cups', 'pinch', 'pinches', 'shot', 'shots'].includes(u);

        if (isMetricMassOrVol) {
          if (val >= 25) {
            return String(Math.round(val));
          }
          const rounded1 = Math.round(val * 10) / 10;
          return String(rounded1);
        }

        if (isSpoonOrCup) {
          const whole = Math.floor(val + 0.04);
          const rem = val - whole;
          if (rem < 0.06) {
            return whole > 0 ? String(whole) : '1/8';
          }
          let bestFrac = null;
          let bestDiff = 999;
          for (const [fVal, fStr] of FRACTIONS) {
            const diff = Math.abs(rem - fVal);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestFrac = fStr;
            }
          }
          if (bestDiff <= 0.05 && bestFrac) {
            return whole > 0 ? `${whole} ${bestFrac}` : bestFrac;
          }
        }

        // General number formatting (at most 2 decimals, strip trailing zeros)
        const rounded2 = Math.round(val * 100) / 100;
        return Number(rounded2.toFixed(2)).toString();
      };

      // Scale a quantity string like "200", "1/2", "375-400" with unitHint
      const scaleNumericPart = (numStr, factor, unitHint) => {
        const s = (numStr || '').trim();
        if (!s) return s;

        // Check range e.g. "375-400" or "2-3"
        const rangeMatch = s.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*([–-])\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)$/);
        if (rangeMatch) {
          const n1 = parseSingleNumber(rangeMatch[1]);
          const sep = rangeMatch[2];
          const n2 = parseSingleNumber(rangeMatch[3]);
          if (n1 !== null && n2 !== null) {
            const wf = s.includes('/');
            return `${formatScaledSingle(n1 * factor, wf, unitHint)}${sep}${formatScaledSingle(n2 * factor, wf, unitHint)}`;
          }
        }

        const n = parseSingleNumber(s);
        if (n !== null) {
          return formatScaledSingle(n * factor, s.includes('/'), unitHint);
        }
        return s;
      };

      // Scale combined "<qty> <unit>" string (e.g. "200 g", "1/2 tsp", "375-400 ml", "4")
      const scaleQtyAndUnit = (rawQtyUnit, factor) => {
        const trimmed = (rawQtyUnit || '').trim();
        if (!trimmed) return '';
        const match = trimmed.match(
          /^(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)?)(?:\s+(.*))?$/
        );
        if (!match) return trimmed;
        const numPart = match[1];
        const unitPart = (match[2] || '').trim();
        const scaledNum = scaleNumericPart(numPart, factor, unitPart);
        return unitPart ? `${scaledNum} ${unitPart}` : scaledNum;
      };

      let currentServings = baseServings;

      // Build interactive stepper UI + preset multiplier buttons
      const wrapper = document.createElement('div');
      wrapper.className = 'bubs-scaler-wrap';

      servingsPill.classList.add('bubs-servings-interactive');
      servingsPill.innerHTML = `
        <button type="button" class="bubs-step-btn print:hidden" data-dir="-1" aria-label="Decrease servings" title="Fewer servings">&minus;</button>
        <span class="bubs-servings-label">👥 ${baseServings} ${baseServings === 1 ? 'serving' : 'servings'}</span>
        <button type="button" class="bubs-step-btn print:hidden" data-dir="1" aria-label="Increase servings" title="More servings">&#43;</button>
      `;

      const presetsEl = document.createElement('div');
      presetsEl.className = 'bubs-scale-presets print:hidden';
      presetsEl.innerHTML = `
        <button type="button" class="bubs-preset-btn" data-mult="0.5" title="Half batch (½×)">&frac12;&times;</button>
        <button type="button" class="bubs-preset-btn active" data-mult="1" title="Original recipe (1×)">1&times;</button>
        <button type="button" class="bubs-preset-btn" data-mult="2" title="Double batch (2×)">2&times;</button>
      `;

      servingsPill.parentNode.insertBefore(wrapper, servingsPill);
      wrapper.appendChild(servingsPill);
      wrapper.appendChild(presetsEl);

      const labelEl = servingsPill.querySelector('.bubs-servings-label');
      const minusBtn = servingsPill.querySelector('button[data-dir="-1"]');
      const presetBtns = Array.from(presetsEl.querySelectorAll('.bubs-preset-btn'));

      const applyServings = (targetServings) => {
        currentServings = Math.max(0.5, Math.round(targetServings * 100) / 100);
        const factor = currentServings / baseServings;
        const isDefault = Math.abs(factor - 1) < 0.001;

        const dispServings = Number(currentServings.toFixed(1)).toString();
        labelEl.textContent = `👥 ${dispServings} ${currentServings === 1 ? 'serving' : 'servings'}`;
        servingsPill.classList.toggle('is-scaled', !isDefault);
        if (minusBtn) minusBtn.disabled = currentServings <= 0.5;

        presetBtns.forEach((btn) => {
          const m = parseFloat(btn.getAttribute('data-mult'));
          btn.classList.toggle('active', Math.abs(factor - m) < 0.01);
        });

        // 1. Update Sidebar Ingredients
        sidebarValues.forEach(({ el, origText }) => {
          if (!origText) return;
          if (isDefault) {
            el.textContent = origText;
            el.classList.remove('bubs-qty-scaled');
          } else {
            el.textContent = scaleQtyAndUnit(origText, factor);
            el.classList.add('bubs-qty-scaled');
          }
        });

        // 2. Update Step Reference Spans
        stepRefSpans.forEach(({ el, origText }) => {
          const colonIdx = origText.indexOf(':');
          if (colonIdx === -1) return;
          if (isDefault) {
            el.textContent = origText;
            el.classList.remove('bubs-qty-scaled');
            return;
          }
          const prefix = origText.slice(0, colonIdx + 1);
          const afterColon = origText.slice(colonIdx + 1).trim();
          const hasComma = afterColon.endsWith(',');
          const rawVal = hasComma ? afterColon.slice(0, -1).trim() : afterColon;
          const scaledVal = scaleQtyAndUnit(rawVal, factor);
          el.textContent = `${prefix} ${scaledVal}${hasComma ? ',' : ''}`;
          el.classList.add('bubs-qty-scaled');
        });

        // 3. Update Cooking Mode JSON Data
        if (cookingModeScript && origCookingDataStr) {
          if (isDefault) {
            cookingModeScript.textContent = origCookingDataStr;
          } else {
            try {
              const data = JSON.parse(origCookingDataStr);
              data.scale = Math.round(factor * 100) / 100;
              (data.sections || []).forEach((sec) => {
                (sec.ingredients || []).forEach((ing) => {
                  if (ing.quantity) {
                    ing.quantity = scaleNumericPart(String(ing.quantity), factor, ing.unit || '');
                  }
                });
                (sec.steps || []).forEach((st) => {
                  (st.ingredients || []).forEach((ing) => {
                    if (ing.quantity) {
                      ing.quantity = scaleNumericPart(String(ing.quantity), factor, ing.unit || '');
                    }
                  });
                });
              });
              cookingModeScript.textContent = JSON.stringify(data);
            } catch (err) {
              console.warn('Could not update cooking-mode-data for scaling:', err);
            }
          }
        }
      };

      servingsPill.addEventListener('click', (e) => {
        const btn = e.target.closest('.bubs-step-btn');
        if (!btn || btn.disabled) return;
        const dir = parseInt(btn.getAttribute('data-dir'), 10);
        // If currentServings is fractional (e.g. 0.5 or 1.5), snap to nearest integer in direction
        let next;
        if (!Number.isInteger(currentServings)) {
          next = dir > 0 ? Math.ceil(currentServings) : Math.floor(currentServings);
          if (next < 1) next = 0.5;
        } else {
          next = currentServings + dir;
          if (next < 1) next = 0.5;
        }
        applyServings(next);
      });

      presetsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.bubs-preset-btn');
        if (!btn) return;
        const mult = parseFloat(btn.getAttribute('data-mult'));
        if (mult > 0) {
          applyServings(baseServings * mult);
        }
      });

      // Support ?scale= or ?servings= in URL query string
      if (searchParams.has('servings')) {
        const qServ = parseFloat(searchParams.get('servings'));
        if (qServ > 0) applyServings(qServ);
      } else if (searchParams.has('scale')) {
        const qScale = parseFloat(searchParams.get('scale'));
        if (qScale > 0) applyServings(baseServings * qScale);
      }
    }
  }
});
