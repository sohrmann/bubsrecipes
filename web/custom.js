// ========================================================
// Bubs Recipes - Client Polish & Interactions
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Interactive Ingredient Checklist (tap to cross off during cooking)
  const ingredientRows = document.querySelectorAll('.ingredient-row');
  ingredientRows.forEach((row) => {
    row.setAttribute('title', 'Tap to check off ingredient');
    row.addEventListener('click', (e) => {
      // Don't toggle if clicking on an interactive link inside if any
      if (e.target.tagName && e.target.tagName.toLowerCase() === 'a') return;
      row.classList.toggle('checked');
    });
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
