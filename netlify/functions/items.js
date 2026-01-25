/**
 * Items API endpoint
 * Handles CRUD operations for newsletter items
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Get the Monday of the current week
 */
function getCurrentWeekMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

/**
 * Create JSON response
 */
function jsonResponse(data, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

/**
 * Handle GET request - fetch items
 */
async function getItems() {
  const weekOf = getCurrentWeekMonday();

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'active')
    .eq('week_of', weekOf)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching items:', error);
    return jsonResponse({ error: 'Failed to fetch items' }, 500);
  }

  return jsonResponse(data);
}

/**
 * Handle POST request - create item
 */
async function createItem(body) {
  const { url, title, notes, category } = body;

  if (!url && !notes) {
    return jsonResponse({ error: 'URL or notes required' }, 400);
  }

  const weekOf = getCurrentWeekMonday();

  const { data, error } = await supabase
    .from('items')
    .insert([{
      url: url || null,
      title: title || null,
      notes: notes || null,
      category: category || null,
      status: 'active',
      week_of: weekOf
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating item:', error);
    return jsonResponse({ error: 'Failed to create item' }, 500);
  }

  return jsonResponse(data, 201);
}

/**
 * Handle PUT request - update item
 */
async function updateItem(id, body) {
  const { url, title, notes, category, status } = body;

  const updateData = {
    updated_at: new Date().toISOString()
  };

  if (url !== undefined) updateData.url = url;
  if (title !== undefined) updateData.title = title;
  if (notes !== undefined) updateData.notes = notes;
  if (category !== undefined) updateData.category = category;
  if (status !== undefined) updateData.status = status;

  const { data, error } = await supabase
    .from('items')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating item:', error);
    return jsonResponse({ error: 'Failed to update item' }, 500);
  }

  if (!data) {
    return jsonResponse({ error: 'Item not found' }, 404);
  }

  return jsonResponse(data);
}

/**
 * Handle DELETE request - soft delete item
 */
async function deleteItem(id) {
  const { data, error } = await supabase
    .from('items')
    .update({
      status: 'deleted',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error deleting item:', error);
    return jsonResponse({ error: 'Failed to delete item' }, 500);
  }

  if (!data) {
    return jsonResponse({ error: 'Item not found' }, 404);
  }

  return jsonResponse({ success: true });
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  const { httpMethod, path } = event;

  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return jsonResponse({});
  }

  // Extract item ID from path if present
  const pathParts = path.split('/').filter(Boolean);
  const itemId = pathParts.length > 2 ? pathParts[pathParts.length - 1] : null;

  try {
    switch (httpMethod) {
      case 'GET':
        return await getItems();

      case 'POST':
        const createBody = JSON.parse(event.body || '{}');
        return await createItem(createBody);

      case 'PUT':
        if (!itemId) {
          return jsonResponse({ error: 'Item ID required' }, 400);
        }
        const updateBody = JSON.parse(event.body || '{}');
        return await updateItem(itemId, updateBody);

      case 'DELETE':
        if (!itemId) {
          return jsonResponse({ error: 'Item ID required' }, 400);
        }
        return await deleteItem(itemId);

      default:
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }
  } catch (error) {
    console.error('Handler error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};
