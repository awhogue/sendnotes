/**
 * Archive API endpoint
 * Moves all active items to archived status
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  const { httpMethod } = event;

  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return jsonResponse({});
  }

  if (httpMethod !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const weekOf = getCurrentWeekMonday();

    // Update all active items to archived
    const { data, error, count } = await supabase
      .from('items')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'active')
      .eq('week_of', weekOf)
      .select();

    if (error) {
      console.error('Error archiving items:', error);
      return jsonResponse({ error: 'Failed to archive items' }, 500);
    }

    const archivedCount = data ? data.length : 0;

    return jsonResponse({
      success: true,
      message: `Archived ${archivedCount} item(s)`,
      count: archivedCount
    });
  } catch (error) {
    console.error('Handler error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};
