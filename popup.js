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
    chrome.storage.sync.get(['categories'], (result) => {
      if (result.categories && result.categories.length > 0) {
        categories = result.categories;
      } else {
        categories = [...DEFAULT_CATEGORIES];
        chrome.storage.sync.set({ categories });
      }
      resolve(categories);
    });
  });
}

// Save categories to storage
function saveCategories() {
  chrome.storage.sync.set({ categories });
}

// Get category label by id
function getCategoryLabel(id) {
  const cat = categories.find(c => c.id === id);
  return cat ? cat.label : '';
}

// Get all category labels for a block (supports both old and new format)
function getCategoryLabels(block) {
  const cats = block.categories || (block.category ? [block.category] : []);
  return cats.map(id => getCategoryLabel(id)).filter(Boolean);
}

// Load and display blocks
function loadBlocks() {
  chrome.storage.sync.get(['blocks'], (result) => {
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
    const categoryLabels = getCategoryLabels(block);
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
          <div class="block-item-actions">
            ${categoryLabels.map(label => `<span class="block-category">${label}</span>`).join('')}
            <button class="edit-btn" data-username="${key}">Edit</button>
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
      if (e.target.classList.contains('delete-btn') || e.target.classList.contains('edit-btn')) return;
      const username = item.dataset.username;
      chrome.tabs.create({ url: `https://twitter.com/${username}` });
    });
  });

  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const username = btn.dataset.username;
      showEditModal(username, allBlocks[username]);
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
  chrome.storage.sync.get(['blocks'], (result) => {
    const blocks = result.blocks || {};
    delete blocks[username];
    chrome.storage.sync.set({ blocks }, () => {
      loadBlocks();
    });
  });
}

// Show edit modal for a block entry
function showEditModal(username, block) {
  // Remove existing modal if any
  const existing = document.getElementById('edit-modal-overlay');
  if (existing) existing.remove();

  // Get current categories (support both old and new format)
  const currentCats = block.categories || (block.category ? [block.category] : []);

  const overlay = document.createElement('div');
  overlay.id = 'edit-modal-overlay';
  overlay.innerHTML = `
    <div class="edit-modal">
      <div class="edit-modal-header">
        <h2>Edit @${block.username}</h2>
        <button class="edit-close-btn">&times;</button>
      </div>
      <div class="edit-modal-body">
        <label class="edit-label">Categories</label>
        <div class="edit-categories">
          ${categories.map(cat => `
            <label class="edit-category">
              <input type="checkbox" name="edit-category" value="${cat.id}" ${currentCats.includes(cat.id) ? 'checked' : ''}>
              <span>${cat.label}</span>
            </label>
          `).join('')}
        </div>
        <label class="edit-label">Notes</label>
        <textarea class="edit-reason-input" rows="2">${escapeHtml(block.reason || '')}</textarea>
      </div>
      <div class="edit-modal-footer">
        <button class="edit-cancel-btn">Cancel</button>
        <button class="edit-save-btn">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  overlay.querySelector('.edit-close-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.edit-cancel-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.edit-save-btn').addEventListener('click', () => {
    const checkedBoxes = overlay.querySelectorAll('input[name="edit-category"]:checked');
    const newCategories = Array.from(checkedBoxes).map(cb => cb.value);
    const newReason = overlay.querySelector('.edit-reason-input').value.trim();

    saveEditedBlock(username, newCategories, newReason);
    overlay.remove();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Save edited block
function saveEditedBlock(username, categories, reason) {
  chrome.storage.sync.get(['blocks'], (result) => {
    const blocks = result.blocks || {};
    if (blocks[username]) {
      blocks[username].categories = categories;
      blocks[username].category = categories.length > 0 ? categories[0] : null;
      blocks[username].reason = reason;
      chrome.storage.sync.set({ blocks }, () => {
        loadBlocks();
      });
    }
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

// Render stats dashboard
function renderStats() {
  const container = document.getElementById('stats-content');
  const entries = Object.entries(allBlocks);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="stats-empty">
        <p>No data yet. Block someone on Twitter to see stats!</p>
      </div>
    `;
    return;
  }

  // Count by category
  const categoryCounts = {};
  categories.forEach(cat => {
    categoryCounts[cat.id] = { label: cat.label, count: 0 };
  });

  entries.forEach(([_, block]) => {
    const cats = block.categories || (block.category ? [block.category] : []);
    cats.forEach(catId => {
      if (categoryCounts[catId]) {
        categoryCounts[catId].count++;
      }
    });
  });

  // Sort categories by count
  const sortedCategories = Object.entries(categoryCounts)
    .filter(([_, data]) => data.count > 0)
    .sort((a, b) => b[1].count - a[1].count);

  // Blocks by month
  const monthCounts = {};
  entries.forEach(([_, block]) => {
    const date = new Date(block.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    if (!monthCounts[monthKey]) {
      monthCounts[monthKey] = { label: monthLabel, count: 0 };
    }
    monthCounts[monthKey].count++;
  });

  // Sort months newest first
  const sortedMonths = Object.entries(monthCounts)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6);  // Show last 6 months

  // Find max for bar scaling
  const maxCatCount = Math.max(...sortedCategories.map(([_, d]) => d.count), 1);
  const maxMonthCount = Math.max(...sortedMonths.map(([_, d]) => d.count), 1);

  container.innerHTML = `
    <div class="stats-section">
      <div class="stats-total">
        <span class="stats-total-number">${entries.length}</span>
        <span class="stats-total-label">Total Blocked</span>
      </div>
    </div>

    <div class="stats-section">
      <h3>By Category</h3>
      <div class="stats-bars">
        ${sortedCategories.length > 0 ? sortedCategories.map(([_, data]) => `
          <div class="stats-bar-row">
            <span class="stats-bar-label">${data.label}</span>
            <div class="stats-bar-container">
              <div class="stats-bar" style="width: ${(data.count / maxCatCount) * 100}%"></div>
            </div>
            <span class="stats-bar-count">${data.count}</span>
          </div>
        `).join('') : '<p class="stats-none">No categories assigned yet</p>'}
      </div>
    </div>

    <div class="stats-section">
      <h3>Recent Activity</h3>
      <div class="stats-bars">
        ${sortedMonths.map(([_, data]) => `
          <div class="stats-bar-row">
            <span class="stats-bar-label">${data.label}</span>
            <div class="stats-bar-container">
              <div class="stats-bar stats-bar-month" style="width: ${(data.count / maxMonthCount) * 100}%"></div>
            </div>
            <span class="stats-bar-count">${data.count}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
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

      // Render content when tabs are opened
      if (tabName === 'settings') {
        renderCategories();
      } else if (tabName === 'stats') {
        renderStats();
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
