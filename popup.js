// Twitter Block Reasons - Popup Script

const DEFAULT_CATEGORIES = [
  { id: 'political', label: 'Political' },
  { id: 'annoying', label: 'Annoying' },
  { id: 'misinformation', label: 'Misinformation' },
  { id: 'creepy', label: 'Creepy' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'trolling', label: 'Trolling' },
  { id: 'other', label: 'Other' }
];

let categories = [];
let allBlocks = {};

// Load categories from storage
function loadCategories() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['categories'], (result) => {
      if (result.categories && result.categories.length > 0) {
        categories = result.categories;
      } else {
        categories = [...DEFAULT_CATEGORIES];
        chrome.storage.local.set({ categories });
      }
      resolve(categories);
    });
  });
}

// Save categories to storage
function saveCategories() {
  chrome.storage.local.set({ categories });
}

// Get category label by id
function getCategoryLabel(id) {
  const cat = categories.find(c => c.id === id);
  return cat ? cat.label : '';
}

// Load and display blocks
function loadBlocks() {
  chrome.storage.local.get(['blocks'], (result) => {
    allBlocks = result.blocks || {};
    renderBlocks(allBlocks);
  });
}

// Render blocks list
function renderBlocks(blocks) {
  const container = document.getElementById('blocks-list');
  const countEl = document.getElementById('count');
  const entries = Object.entries(blocks);

  countEl.textContent = entries.length;

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No blocked users recorded yet.</p>
        <p>Block someone on Twitter to get started!</p>
      </div>
    `;
    return;
  }

  // Sort by date, most recent first
  entries.sort((a, b) => new Date(b[1].date) - new Date(a[1].date));

  container.innerHTML = entries.map(([key, block]) => {
    const categoryLabel = block.category ? getCategoryLabel(block.category) : '';
    const dateStr = new Date(block.date).toLocaleDateString();

    const tweetInfo = block.tweet || block.tweetMedia
      ? `<div class="block-tweet-container">
          ${block.tweet ? `<div class="block-tweet">"${escapeHtml(block.tweet)}"</div>` : ''}
          ${block.tweetMedia ? `<span class="block-media">${block.tweetMedia}</span>` : ''}
          ${block.tweetUrl ? `<a href="${block.tweetUrl}" target="_blank" class="block-tweet-link" onclick="event.stopPropagation()">View tweet</a>` : ''}
        </div>`
      : '';

    return `
      <div class="block-item" data-username="${key}">
        <div class="block-item-header">
          <span class="block-username">@${block.username}</span>
          <div>
            ${categoryLabel ? `<span class="block-category">${categoryLabel}</span>` : ''}
            <button class="delete-btn" data-username="${key}">Delete</button>
          </div>
        </div>
        ${tweetInfo}
        ${block.reason ? `<div class="block-reason">${escapeHtml(block.reason)}</div>` : ''}
        <div class="block-date">${dateStr}</div>
      </div>
    `;
  }).join('');

  // Add click handlers
  container.querySelectorAll('.block-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      const username = item.dataset.username;
      chrome.tabs.create({ url: `https://twitter.com/${username}` });
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const username = btn.dataset.username;
      deleteBlock(username);
    });
  });
}

// Delete a block record
function deleteBlock(username) {
  chrome.storage.local.get(['blocks'], (result) => {
    const blocks = result.blocks || {};
    delete blocks[username];
    chrome.storage.local.set({ blocks }, () => {
      loadBlocks();
    });
  });
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    if (!query) {
      renderBlocks(allBlocks);
      return;
    }

    const filtered = {};
    for (const [key, block] of Object.entries(allBlocks)) {
      const categoryLabel = getCategoryLabel(block.category);
      if (
        block.username.toLowerCase().includes(query) ||
        (block.reason && block.reason.toLowerCase().includes(query)) ||
        (categoryLabel && categoryLabel.toLowerCase().includes(query))
      ) {
        filtered[key] = block;
      }
    }
    renderBlocks(filtered);
  });
}

// Render categories in settings
function renderCategories() {
  const container = document.getElementById('category-list');

  container.innerHTML = categories.map((cat, index) => `
    <div class="category-item" data-index="${index}">
      <span class="drag-handle">☰</span>
      <input type="text" value="${escapeHtml(cat.label)}" data-index="${index}">
      <button class="delete-cat-btn" data-index="${index}">&times;</button>
    </div>
  `).join('');

  // Add edit handlers
  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      const newLabel = e.target.value.trim();
      if (newLabel) {
        categories[index].label = newLabel;
        // Update id to match label (lowercase, no spaces)
        categories[index].id = newLabel.toLowerCase().replace(/\s+/g, '-');
        saveCategories();
      }
    });
  });

  // Add delete handlers
  container.querySelectorAll('.delete-cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      if (categories.length > 1) {
        categories.splice(index, 1);
        saveCategories();
        renderCategories();
      }
    });
  });
}

// Add new category
function setupAddCategory() {
  const input = document.getElementById('new-category');
  const btn = document.getElementById('add-category-btn');

  const addCategory = () => {
    const label = input.value.trim();
    if (label) {
      const id = label.toLowerCase().replace(/\s+/g, '-');
      // Check for duplicates
      if (!categories.some(c => c.id === id)) {
        categories.push({ id, label });
        saveCategories();
        renderCategories();
        input.value = '';
      }
    }
  };

  btn.addEventListener('click', addCategory);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCategory();
  });
}

// Reset categories to defaults
function setupResetCategories() {
  document.getElementById('reset-categories').addEventListener('click', () => {
    if (confirm('Reset all categories to defaults?')) {
      categories = [...DEFAULT_CATEGORIES];
      saveCategories();
      renderCategories();
    }
  });
}

// Tab switching
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`${tabName}-tab`).classList.add('active');

      // Render categories when settings tab is opened
      if (tabName === 'settings') {
        renderCategories();
      }
    });
  });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadCategories();
  loadBlocks();
  setupSearch();
  setupTabs();
  setupAddCategory();
  setupResetCategories();
});
