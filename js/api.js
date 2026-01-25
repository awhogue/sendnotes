/**
 * API client with offline support
 */
const API = {
  BASE_URL: '/api',

  /**
   * Check if we're online
   */
  isOnline() {
    return navigator.onLine;
  },

  /**
   * Make an API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get all active items for the current week
   */
  async getItems() {
    if (!this.isOnline()) {
      return OfflineStore.getActiveItems();
    }

    try {
      const items = await this.request('/items');
      // Update local store with server data
      await OfflineStore.replaceAllItems(items);
      return items;
    } catch (error) {
      console.warn('Failed to fetch items, using local data:', error);
      return OfflineStore.getActiveItems();
    }
  },

  /**
   * Create a new item
   */
  async createItem(data) {
    const tempId = OfflineStore.generateTempId();
    const localItem = {
      id: tempId,
      ...data,
      status: 'active',
      week_of: OfflineStore.getCurrentWeekMonday(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      synced: false
    };

    // Save locally first (optimistic update)
    await OfflineStore.saveItem(localItem);

    if (!this.isOnline()) {
      // Queue the operation for later
      await OfflineStore.queueOperation({
        type: 'create',
        tempId,
        data
      });
      return localItem;
    }

    try {
      const serverItem = await this.request('/items', {
        method: 'POST',
        body: data
      });
      // Update local with server data
      await OfflineStore.markSynced(tempId, serverItem);
      return serverItem;
    } catch (error) {
      console.warn('Failed to create item on server, queued for later:', error);
      await OfflineStore.queueOperation({
        type: 'create',
        tempId,
        data
      });
      return localItem;
    }
  },

  /**
   * Update an item
   */
  async updateItem(id, data) {
    // Check if this is a temp item
    const isTemp = id.startsWith('temp_');

    // Update locally first
    const existingItem = await OfflineStore.getItem(id);
    if (existingItem) {
      const updatedItem = {
        ...existingItem,
        ...data,
        updated_at: new Date().toISOString(),
        synced: isTemp ? false : existingItem.synced
      };
      await OfflineStore.saveItem(updatedItem);

      if (!this.isOnline() || isTemp) {
        if (!isTemp) {
          await OfflineStore.queueOperation({
            type: 'update',
            id,
            data
          });
        }
        return updatedItem;
      }

      try {
        const serverItem = await this.request(`/items/${id}`, {
          method: 'PUT',
          body: data
        });
        await OfflineStore.markSynced(id, serverItem);
        return serverItem;
      } catch (error) {
        console.warn('Failed to update item on server, queued for later:', error);
        await OfflineStore.queueOperation({
          type: 'update',
          id,
          data
        });
        return updatedItem;
      }
    }

    throw new Error('Item not found');
  },

  /**
   * Delete an item (soft delete)
   */
  async deleteItem(id) {
    const isTemp = id.startsWith('temp_');

    // Update locally first
    const existingItem = await OfflineStore.getItem(id);
    if (existingItem) {
      // Mark as deleted locally
      await OfflineStore.saveItem({
        ...existingItem,
        status: 'deleted',
        synced: false
      });

      if (!this.isOnline() || isTemp) {
        if (!isTemp) {
          await OfflineStore.queueOperation({
            type: 'delete',
            id
          });
        } else {
          // For temp items, just remove from local store
          await OfflineStore.deleteItem(id);
        }
        return;
      }

      try {
        await this.request(`/items/${id}`, { method: 'DELETE' });
        // Remove from local store after server confirms
        await OfflineStore.deleteItem(id);
      } catch (error) {
        console.warn('Failed to delete item on server, queued for later:', error);
        await OfflineStore.queueOperation({
          type: 'delete',
          id
        });
      }
    }
  },

  /**
   * Generate newsletter
   */
  async generateNewsletter(intro = '') {
    // Get items from local store (they should be synced)
    const items = await OfflineStore.getActiveItems();

    if (!this.isOnline()) {
      // Generate locally if offline
      return this.generateNewsletterLocally(items, intro);
    }

    try {
      return await this.request('/generate', {
        method: 'POST',
        body: { intro }
      });
    } catch (error) {
      console.warn('Failed to generate on server, generating locally:', error);
      return this.generateNewsletterLocally(items, intro);
    }
  },

  /**
   * Generate newsletter HTML locally (fallback)
   */
  generateNewsletterLocally(items, intro) {
    const itemsHtml = items.map(item => {
      let html = '<div class="item">';
      if (item.category) {
        html += `<div class="category">${this.escapeHtml(item.category)}</div>`;
      }
      if (item.url) {
        html += `<div class="item-title"><a href="${this.escapeHtml(item.url)}">${this.escapeHtml(item.title || item.url)}</a></div>`;
      } else if (item.title) {
        html += `<div class="item-title">${this.escapeHtml(item.title)}</div>`;
      }
      if (item.notes) {
        html += `<div class="item-notes">${this.escapeHtml(item.notes)}</div>`;
      }
      html += '</div>';
      return html;
    }).join('\n  ');

    const introHtml = intro ? `<p>${this.escapeHtml(intro)}</p>\n  ` : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; max-width: 600px; }
    a { color: #2563eb; }
    .item { margin-bottom: 24px; }
    .item-title { font-weight: 600; font-size: 16px; }
    .item-notes { margin-top: 8px; color: #555; }
    .category { font-size: 12px; color: #888; text-transform: uppercase; }
  </style>
</head>
<body>
  ${introHtml}${itemsHtml}
</body>
</html>`;

    const plain = (intro ? intro + '\n\n' : '') + items.map(item => {
      let text = '';
      if (item.category) text += `[${item.category}] `;
      text += item.title || item.url || 'Note';
      if (item.url) text += `\n${item.url}`;
      if (item.notes) text += `\n${item.notes}`;
      return text;
    }).join('\n\n');

    return { html, plain };
  },

  /**
   * Escape HTML characters
   */
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Archive all active items
   */
  async archiveItems() {
    if (!this.isOnline()) {
      // Archive locally and queue
      await OfflineStore.archiveActiveItems();
      await OfflineStore.queueOperation({ type: 'archive' });
      return;
    }

    try {
      await this.request('/archive', { method: 'POST' });
      await OfflineStore.archiveActiveItems();
    } catch (error) {
      console.warn('Failed to archive on server, queued for later:', error);
      await OfflineStore.archiveActiveItems();
      await OfflineStore.queueOperation({ type: 'archive' });
    }
  },

  /**
   * Sync queued operations
   */
  async syncQueue() {
    if (!this.isOnline()) return { synced: 0, failed: 0 };

    const operations = await OfflineStore.getQueuedOperations();
    let synced = 0;
    let failed = 0;

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'create': {
            const serverItem = await this.request('/items', {
              method: 'POST',
              body: op.data
            });
            await OfflineStore.markSynced(op.tempId, serverItem);
            break;
          }
          case 'update': {
            const serverItem = await this.request(`/items/${op.id}`, {
              method: 'PUT',
              body: op.data
            });
            await OfflineStore.markSynced(op.id, serverItem);
            break;
          }
          case 'delete': {
            await this.request(`/items/${op.id}`, { method: 'DELETE' });
            await OfflineStore.deleteItem(op.id);
            break;
          }
          case 'archive': {
            await this.request('/archive', { method: 'POST' });
            break;
          }
        }
        await OfflineStore.removeFromQueue(op.queueId);
        synced++;
      } catch (error) {
        console.error('Failed to sync operation:', op, error);
        failed++;
      }
    }

    return { synced, failed };
  },

  /**
   * Full sync - fetch all items from server and merge with local
   */
  async fullSync() {
    if (!this.isOnline()) return false;

    try {
      // First sync any queued operations
      await this.syncQueue();

      // Then fetch fresh data from server
      const serverItems = await this.request('/items');
      await OfflineStore.replaceAllItems(serverItems);

      return true;
    } catch (error) {
      console.error('Full sync failed:', error);
      return false;
    }
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
