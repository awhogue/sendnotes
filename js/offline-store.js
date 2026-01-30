/**
 * IndexedDB wrapper for offline storage of items
 */
const OfflineStore = {
  DB_NAME: 'sendnotes',
  DB_VERSION: 1,
  STORE_NAME: 'items',
  QUEUE_STORE: 'sync_queue',
  db: null,

  /**
   * Initialize the database
   */
  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Items store
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('week_of', 'week_of', { unique: false });
          store.createIndex('synced', 'synced', { unique: false });
        }

        // Sync queue for offline operations
        if (!db.objectStoreNames.contains(this.QUEUE_STORE)) {
          const queueStore = db.createObjectStore(this.QUEUE_STORE, {
            keyPath: 'queueId',
            autoIncrement: true
          });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  },

  /**
   * Get a transaction and store
   */
  getStore(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },

  /**
   * Generate a temporary ID for offline items
   */
  generateTempId() {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Get the Monday of the current week
   */
  getCurrentWeekMonday() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().split('T')[0];
  },

  /**
   * Save an item locally
   */
  async saveItem(item) {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.STORE_NAME, 'readwrite');
      const request = store.put(item);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(item);
    });
  },

  /**
   * Get an item by ID
   */
  async getItem(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.STORE_NAME);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  /**
   * Get all active items (regardless of week)
   */
  async getActiveItems() {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.STORE_NAME);
      const request = store.index('status').getAll('active');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const items = request.result;
        // Sort by created_at descending (newest first)
        items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        resolve(items);
      };
    });
  },

  /**
   * Get all items (regardless of status)
   */
  async getAllItems() {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  /**
   * Delete an item locally
   */
  async deleteItem(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.STORE_NAME, 'readwrite');
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  /**
   * Get unsynced items
   */
  async getUnsyncedItems() {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.STORE_NAME);
      const request = store.index('synced').getAll(false);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  /**
   * Mark an item as synced and update with server data
   */
  async markSynced(tempId, serverItem) {
    await this.init();

    // Delete the temp item and save the server item
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);

      // Delete temp item if it exists
      if (tempId !== serverItem.id) {
        store.delete(tempId);
      }

      // Save server item as synced
      const syncedItem = { ...serverItem, synced: true };
      store.put(syncedItem);

      tx.oncomplete = () => resolve(syncedItem);
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Add an operation to the sync queue
   */
  async queueOperation(operation) {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.QUEUE_STORE, 'readwrite');
      const request = store.add({
        ...operation,
        timestamp: Date.now()
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  /**
   * Get all queued operations
   */
  async getQueuedOperations() {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.QUEUE_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Sort by timestamp
        const ops = request.result.sort((a, b) => a.timestamp - b.timestamp);
        resolve(ops);
      };
    });
  },

  /**
   * Remove an operation from the queue
   */
  async removeFromQueue(queueId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.QUEUE_STORE, 'readwrite');
      const request = store.delete(queueId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  /**
   * Clear all queued operations
   */
  async clearQueue() {
    await this.init();
    return new Promise((resolve, reject) => {
      const store = this.getStore(this.QUEUE_STORE, 'readwrite');
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  },

  /**
   * Replace all local items with server items (after full sync)
   */
  async replaceAllItems(serverItems) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);

      // Clear existing items
      store.clear();

      // Add all server items as synced
      for (const item of serverItems) {
        store.put({ ...item, synced: true });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Archive all active items locally
   */
  async archiveActiveItems() {
    await this.init();
    const items = await this.getActiveItems();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);

      for (const item of items) {
        store.put({ ...item, status: 'archived' });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineStore;
}
