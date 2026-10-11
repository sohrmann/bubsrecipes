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
});
