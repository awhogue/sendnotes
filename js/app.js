/**
 * SendNotes - Main App Logic
 */
const App = {
  items: [],
  currentEditId: null,
  newsletterData: null,

  // DOM Elements
  elements: {},

  /**
   * Initialize the app
   */
  async init() {
    // Cache DOM elements
    this.cacheElements();

    // Set up event listeners
    this.bindEvents();

    // Initialize offline store
    await OfflineStore.init();

    // Handle share target (if coming from share intent)
    this.handleShareTarget();

    // Load items
    await this.loadItems();

    // Register service worker
    this.registerServiceWorker();

    // Set up online/offline listeners
    this.setupConnectivityListeners();
  },

  /**
   * Cache DOM element references
   */
  cacheElements() {
    this.elements = {
      // Quick add
      quickUrl: document.getElementById('quick-url'),
      quickNotes: document.getElementById('quick-notes'),
      quickCategory: document.getElementById('quick-category'),
      quickAddBtn: document.getElementById('quick-add-btn'),

      // Items
      itemsList: document.getElementById('items-list'),
      emptyState: document.getElementById('empty-state'),

      // Sync status
      syncStatus: document.getElementById('sync-status'),
      syncText: document.querySelector('.sync-text'),

      // Edit modal
      editModal: document.getElementById('edit-modal'),
      editForm: document.getElementById('edit-form'),
      editId: document.getElementById('edit-id'),
      editUrl: document.getElementById('edit-url'),
      editTitle: document.getElementById('edit-title'),
      editNotes: document.getElementById('edit-notes'),
      editCategory: document.getElementById('edit-category'),
      modalTitle: document.getElementById('modal-title'),

      // Generate modal
      generateBtn: document.getElementById('generate-btn'),
      generateModal: document.getElementById('generate-modal'),
      newsletterIntro: document.getElementById('newsletter-intro'),
      newsletterPreview: document.getElementById('newsletter-preview'),
      copyHtmlBtn: document.getElementById('copy-html-btn'),
      copyPlainBtn: document.getElementById('copy-plain-btn'),
      archiveBtn: document.getElementById('archive-btn'),

      // Toast
      toastContainer: document.getElementById('toast-container')
    };
  },

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Quick add
    this.elements.quickAddBtn.addEventListener('click', () => this.handleQuickAdd());
    this.elements.quickUrl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleQuickAdd();
    });

    // Generate button
    this.elements.generateBtn.addEventListener('click', () => this.openGenerateModal());

    // Modal close buttons and backdrop
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
      el.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.add('hidden');
      });
    });

    document.querySelectorAll('.modal-cancel').forEach(el => {
      el.addEventListener('click', () => {
        this.elements.editModal.classList.add('hidden');
      });
    });

    // Edit form submit
    this.elements.editForm.addEventListener('submit', (e) => this.handleEditSubmit(e));

    // Newsletter actions
    this.elements.newsletterIntro.addEventListener('input', () => this.updateNewsletterPreview());
    this.elements.copyHtmlBtn.addEventListener('click', () => this.copyNewsletter('html'));
    this.elements.copyPlainBtn.addEventListener('click', () => this.copyNewsletter('plain'));
    this.elements.archiveBtn.addEventListener('click', () => this.handleArchive());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
          modal.classList.add('hidden');
        });
      }
    });
  },

  /**
   * Handle share target from PWA
   */
  handleShareTarget() {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    const title = params.get('title');
    const text = params.get('text');

    if (url || title || text) {
      // Pre-fill the quick add form
      if (url) {
        this.elements.quickUrl.value = url;
      } else if (text && text.match(/^https?:\/\//)) {
        this.elements.quickUrl.value = text;
      }

      if (title) {
        this.elements.quickNotes.value = title;
      } else if (text && !text.match(/^https?:\/\//)) {
        this.elements.quickNotes.value = text;
      }

      // Clear the URL params
      window.history.replaceState({}, '', '/');

      // Focus the add button
      this.elements.quickAddBtn.focus();
    }
  },

  /**
   * Load items from API/local store
   */
  async loadItems() {
    this.showSyncStatus('Syncing...');

    try {
      this.items = await API.getItems();
      this.renderItems();
      this.hideSyncStatus();
    } catch (error) {
      console.error('Failed to load items:', error);
      this.showSyncStatus('Sync failed', 'error');
      // Try to load from local store
      this.items = await OfflineStore.getActiveItems();
      this.renderItems();
    }
  },

  /**
   * Render items list
   */
  renderItems() {
    // Filter out deleted items
    const activeItems = this.items.filter(item => item.status === 'active');

    if (activeItems.length === 0) {
      this.elements.itemsList.innerHTML = '';
      this.elements.emptyState.classList.remove('hidden');
      return;
    }

    this.elements.emptyState.classList.add('hidden');

    this.elements.itemsList.innerHTML = activeItems.map(item => `
      <div class="item-card ${!item.synced ? 'unsynced' : ''}" data-id="${item.id}">
        <div class="item-content">
          ${item.category ? `<span class="item-category">${this.escapeHtml(item.category)}</span>` : ''}
          <div class="item-title">
            ${item.url
              ? `<a href="${this.escapeHtml(item.url)}" target="_blank" rel="noopener">${this.escapeHtml(item.title || item.url)}</a>`
              : this.escapeHtml(item.title || 'Untitled Note')}
          </div>
          ${item.url ? `<div class="item-url">${this.escapeHtml(item.url)}</div>` : ''}
          ${item.notes ? `<div class="item-notes">${this.escapeHtml(item.notes)}</div>` : ''}
        </div>
        <div class="item-actions">
          <button class="btn btn-icon" onclick="App.editItem('${item.id}')" aria-label="Edit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-icon" onclick="App.deleteItem('${item.id}')" aria-label="Delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  },

  /**
   * Handle quick add
   */
  async handleQuickAdd() {
    const url = this.elements.quickUrl.value.trim();
    const notes = this.elements.quickNotes.value.trim();
    const category = this.elements.quickCategory.value.trim();

    if (!url && !notes) {
      this.showToast('Please enter a URL or notes', 'error');
      return;
    }

    const data = {
      url: url || null,
      title: url ? this.extractDomain(url) : (notes.split('\n')[0].substring(0, 100)),
      notes: notes || null,
      category: category || null
    };

    try {
      const item = await API.createItem(data);
      this.items.unshift(item);
      this.renderItems();

      // Clear form
      this.elements.quickUrl.value = '';
      this.elements.quickNotes.value = '';
      this.elements.quickCategory.value = '';

      this.showToast('Item added!', 'success');
    } catch (error) {
      console.error('Failed to add item:', error);
      this.showToast('Failed to add item', 'error');
    }
  },

  /**
   * Extract domain from URL for default title
   */
  extractDomain(url) {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch {
      return url;
    }
  },

  /**
   * Open edit modal for an item
   */
  editItem(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    this.currentEditId = id;
    this.elements.modalTitle.textContent = 'Edit Item';
    this.elements.editId.value = id;
    this.elements.editUrl.value = item.url || '';
    this.elements.editTitle.value = item.title || '';
    this.elements.editNotes.value = item.notes || '';
    this.elements.editCategory.value = item.category || '';

    this.elements.editModal.classList.remove('hidden');
    this.elements.editTitle.focus();
  },

  /**
   * Handle edit form submit
   */
  async handleEditSubmit(e) {
    e.preventDefault();

    const id = this.elements.editId.value;
    const data = {
      url: this.elements.editUrl.value.trim() || null,
      title: this.elements.editTitle.value.trim() || null,
      notes: this.elements.editNotes.value.trim() || null,
      category: this.elements.editCategory.value.trim() || null
    };

    try {
      const updatedItem = await API.updateItem(id, data);

      // Update local state
      const index = this.items.findIndex(i => i.id === id);
      if (index !== -1) {
        this.items[index] = { ...this.items[index], ...updatedItem };
      }

      this.renderItems();
      this.elements.editModal.classList.add('hidden');
      this.showToast('Item updated!', 'success');
    } catch (error) {
      console.error('Failed to update item:', error);
      this.showToast('Failed to update item', 'error');
    }
  },

  /**
   * Delete an item
   */
  async deleteItem(id) {
    if (!confirm('Delete this item?')) return;

    try {
      await API.deleteItem(id);

      // Remove from local state
      this.items = this.items.filter(i => i.id !== id);
      this.renderItems();

      this.showToast('Item deleted', 'success');
    } catch (error) {
      console.error('Failed to delete item:', error);
      this.showToast('Failed to delete item', 'error');
    }
  },

  /**
   * Open generate newsletter modal
   */
  async openGenerateModal() {
    const activeItems = this.items.filter(i => i.status === 'active');

    if (activeItems.length === 0) {
      this.showToast('No items to include in newsletter', 'error');
      return;
    }

    this.elements.newsletterIntro.value = '';
    this.elements.generateModal.classList.remove('hidden');

    await this.updateNewsletterPreview();
  },

  /**
   * Update newsletter preview
   */
  async updateNewsletterPreview() {
    const intro = this.elements.newsletterIntro.value.trim();

    try {
      this.newsletterData = await API.generateNewsletter(intro);
      this.elements.newsletterPreview.innerHTML = this.newsletterData.html;
    } catch (error) {
      console.error('Failed to generate newsletter:', error);
      this.elements.newsletterPreview.innerHTML = '<p>Failed to generate preview</p>';
    }
  },

  /**
   * Copy newsletter to clipboard
   */
  async copyNewsletter(format) {
    if (!this.newsletterData) {
      this.showToast('No newsletter data', 'error');
      return;
    }

    const content = format === 'html' ? this.newsletterData.html : this.newsletterData.plain;

    try {
      if (format === 'html') {
        // Copy as HTML (for rich paste into Gmail)
        const blob = new Blob([content], { type: 'text/html' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': blob,
            'text/plain': new Blob([this.newsletterData.plain], { type: 'text/plain' })
          })
        ]);
      } else {
        await navigator.clipboard.writeText(content);
      }

      this.showToast(`${format === 'html' ? 'HTML' : 'Plain text'} copied!`, 'success');
    } catch (error) {
      // Fallback for browsers that don't support clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      this.showToast(`${format === 'html' ? 'HTML' : 'Plain text'} copied!`, 'success');
    }
  },

  /**
   * Handle archive action
   */
  async handleArchive() {
    if (!confirm('Archive all items and start a new week? This cannot be undone.')) {
      return;
    }

    try {
      await API.archiveItems();

      // Clear local items
      this.items = [];
      this.renderItems();

      this.elements.generateModal.classList.add('hidden');
      this.showToast('Items archived! Starting fresh.', 'success');
    } catch (error) {
      console.error('Failed to archive items:', error);
      this.showToast('Failed to archive items', 'error');
    }
  },

  /**
   * Show sync status
   */
  showSyncStatus(message, type = '') {
    this.elements.syncStatus.classList.remove('hidden', 'error', 'success');
    if (type) {
      this.elements.syncStatus.classList.add(type);
    }
    this.elements.syncText.textContent = message;
  },

  /**
   * Hide sync status
   */
  hideSyncStatus() {
    this.elements.syncStatus.classList.add('hidden');
  },

  /**
   * Show toast notification
   */
  showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    this.elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  },

  /**
   * Escape HTML characters
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service worker registered:', registration.scope);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showToast('App updated! Refresh to see changes.');
            }
          });
        });
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    }
  },

  /**
   * Set up online/offline listeners
   */
  setupConnectivityListeners() {
    window.addEventListener('online', async () => {
      this.showSyncStatus('Back online, syncing...', 'success');

      // Sync queued operations
      const result = await API.syncQueue();
      if (result.synced > 0) {
        this.showToast(`Synced ${result.synced} item(s)`, 'success');
      }

      // Reload items
      await this.loadItems();
    });

    window.addEventListener('offline', () => {
      this.showSyncStatus('Offline - changes will sync when online', 'error');
    });

    // Initial offline check
    if (!navigator.onLine) {
      this.showSyncStatus('Offline - changes will sync when online', 'error');
    }
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
