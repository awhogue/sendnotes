/**
 * API client using Supabase directly with offline support
 */
const API = {
  supabase: null,

  /**
   * Initialize Supabase client
   */
  init() {
    if (!this.supabase) {
      this.supabase = window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY
      );
    }
    return this.supabase;
  },

  /**
   * Check if we're online
   */
  isOnline() {
    return navigator.onLine;
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
   * Get all active items for the current week
   */
  async getItems() {
    if (!this.isOnline()) {
      return OfflineStore.getActiveItems();
    }

    try {
      this.init();
      const weekOf = this.getCurrentWeekMonday();

      const { data, error } = await this.supabase
        .from('items')
        .select('*')
        .eq('status', 'active')
        .eq('week_of', weekOf)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Update local store with server data
      await OfflineStore.replaceAllItems(data);
      return data;
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
    const weekOf = this.getCurrentWeekMonday();
    const localItem = {
      id: tempId,
      ...data,
      status: 'active',
      week_of: weekOf,
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
        data: { ...data, week_of: weekOf }
      });
      return localItem;
    }

    try {
      this.init();
      const { data: serverItem, error } = await this.supabase
        .from('items')
        .insert([{
          url: data.url || null,
          title: data.title || null,
          notes: data.notes || null,
          category: data.category || null,
          status: 'active',
          week_of: weekOf
        }])
        .select()
        .single();

      if (error) throw error;

      // Update local with server data
      await OfflineStore.markSynced(tempId, serverItem);
      return serverItem;
    } catch (error) {
      console.warn('Failed to create item on server, queued for later:', error);
      await OfflineStore.queueOperation({
        type: 'create',
        tempId,
        data: { ...data, week_of: weekOf }
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
        this.init();
        const updateData = {
          updated_at: new Date().toISOString()
        };
        if (data.url !== undefined) updateData.url = data.url;
        if (data.title !== undefined) updateData.title = data.title;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.category !== undefined) updateData.category = data.category;
        if (data.status !== undefined) updateData.status = data.status;

        const { data: serverItem, error } = await this.supabase
          .from('items')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

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
        this.init();
        const { error } = await this.supabase
          .from('items')
          .update({
            status: 'deleted',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (error) throw error;

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
   * Generate newsletter (always done locally now)
   */
  async generateNewsletter(intro = '') {
    const items = await OfflineStore.getActiveItems();
    return this.generateNewsletterLocally(items, intro);
  },

  /**
   * Generate newsletter HTML locally
   */
  generateNewsletterLocally(items, intro) {
    const itemsHtml = items.map(item => {
      let html = '<div style="margin-bottom: 24px;">';
      if (item.category) {
        html += `<div style="font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 4px;">${this.escapeHtml(item.category)}</div>`;
      }
      if (item.url) {
        html += `<div style="font-weight: 600; font-size: 16px;"><a href="${this.escapeHtml(item.url)}" style="color: #2563eb; text-decoration: none;">${this.escapeHtml(item.title || item.url)}</a></div>`;
      } else if (item.title) {
        html += `<div style="font-weight: 600; font-size: 16px;">${this.escapeHtml(item.title)}</div>`;
      }
      if (item.notes) {
        html += `<div style="margin-top: 8px; color: #555;">${this.escapeHtml(item.notes).replace(/\n/g, '<br>')}</div>`;
      }
      html += '</div>';
      return html;
    }).join('\n');

    const introHtml = intro
      ? `<p style="margin-bottom: 24px;">${this.escapeHtml(intro)}</p>`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${introHtml}
  ${itemsHtml}
</body>
</html>`;

    const plain = (intro ? intro + '\n\n---\n\n' : '') + items.map(item => {
      let text = '';
      if (item.category) text += `[${item.category}] `;
      text += item.title || item.url || 'Note';
      if (item.url) text += `\n${item.url}`;
      if (item.notes) text += `\n${item.notes}`;
      return text;
    }).join('\n\n---\n\n');

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
    const weekOf = this.getCurrentWeekMonday();

    if (!this.isOnline()) {
      // Archive locally and queue
      await OfflineStore.archiveActiveItems();
      await OfflineStore.queueOperation({ type: 'archive', weekOf });
      return;
    }

    try {
      this.init();
      const { error } = await this.supabase
        .from('items')
        .update({
          status: 'archived',
          updated_at: new Date().toISOString()
        })
        .eq('status', 'active')
        .eq('week_of', weekOf);

      if (error) throw error;

      await OfflineStore.archiveActiveItems();
    } catch (error) {
      console.warn('Failed to archive on server, queued for later:', error);
      await OfflineStore.archiveActiveItems();
      await OfflineStore.queueOperation({ type: 'archive', weekOf });
    }
  },

  /**
   * Sync queued operations
   */
  async syncQueue() {
    if (!this.isOnline()) return { synced: 0, failed: 0 };

    this.init();
    const operations = await OfflineStore.getQueuedOperations();
    let synced = 0;
    let failed = 0;

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'create': {
            const { data: serverItem, error } = await this.supabase
              .from('items')
              .insert([{
                url: op.data.url || null,
                title: op.data.title || null,
                notes: op.data.notes || null,
                category: op.data.category || null,
                status: 'active',
                week_of: op.data.week_of
              }])
              .select()
              .single();

            if (error) throw error;
            await OfflineStore.markSynced(op.tempId, serverItem);
            break;
          }
          case 'update': {
            const { data: serverItem, error } = await this.supabase
              .from('items')
              .update({
                ...op.data,
                updated_at: new Date().toISOString()
              })
              .eq('id', op.id)
              .select()
              .single();

            if (error) throw error;
            await OfflineStore.markSynced(op.id, serverItem);
            break;
          }
          case 'delete': {
            const { error } = await this.supabase
              .from('items')
              .update({
                status: 'deleted',
                updated_at: new Date().toISOString()
              })
              .eq('id', op.id);

            if (error) throw error;
            await OfflineStore.deleteItem(op.id);
            break;
          }
          case 'archive': {
            const { error } = await this.supabase
              .from('items')
              .update({
                status: 'archived',
                updated_at: new Date().toISOString()
              })
              .eq('status', 'active')
              .eq('week_of', op.weekOf);

            if (error) throw error;
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
      this.init();
      const weekOf = this.getCurrentWeekMonday();

      const { data, error } = await this.supabase
        .from('items')
        .select('*')
        .eq('status', 'active')
        .eq('week_of', weekOf)
        .order('created_at', { ascending: false });

      if (error) throw error;

      await OfflineStore.replaceAllItems(data);
      return true;
    } catch (error) {
      console.error('Full sync failed:', error);
      return false;
    }
  }
};
