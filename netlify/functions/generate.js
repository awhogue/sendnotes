/**
 * Generate Newsletter API endpoint
 * Creates HTML and plain text versions of the newsletter
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
 * Escape HTML characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate HTML newsletter
 */
function generateHtml(items, intro) {
  const introHtml = intro
    ? `<p style="margin-bottom: 24px;">${escapeHtml(intro)}</p>`
    : '';

  const itemsHtml = items.map(item => {
    let html = '<div style="margin-bottom: 24px;">';

    if (item.category) {
      html += `<div style="font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 4px;">${escapeHtml(item.category)}</div>`;
    }

    if (item.url) {
      html += `<div style="font-weight: 600; font-size: 16px;"><a href="${escapeHtml(item.url)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(item.title || item.url)}</a></div>`;
    } else if (item.title) {
      html += `<div style="font-weight: 600; font-size: 16px;">${escapeHtml(item.title)}</div>`;
    }

    if (item.notes) {
      html += `<div style="margin-top: 8px; color: #555;">${escapeHtml(item.notes).replace(/\n/g, '<br>')}</div>`;
    }

    html += '</div>';
    return html;
  }).join('\n');

  return `<!DOCTYPE html>
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
}

/**
 * Generate plain text newsletter
 */
function generatePlainText(items, intro) {
  let text = intro ? intro + '\n\n---\n\n' : '';

  text += items.map(item => {
    let itemText = '';

    if (item.category) {
      itemText += `[${item.category}] `;
    }

    itemText += item.title || item.url || 'Note';
    itemText += '\n';

    if (item.url) {
      itemText += item.url + '\n';
    }

    if (item.notes) {
      itemText += '\n' + item.notes;
    }

    return itemText;
  }).join('\n\n---\n\n');

  return text;
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
    const body = JSON.parse(event.body || '{}');
    const intro = body.intro || '';

    // Fetch active items for current week
    const weekOf = getCurrentWeekMonday();

    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .eq('status', 'active')
      .eq('week_of', weekOf)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching items:', error);
      return jsonResponse({ error: 'Failed to fetch items' }, 500);
    }

    if (!items || items.length === 0) {
      return jsonResponse({ error: 'No items to include in newsletter' }, 400);
    }

    const html = generateHtml(items, intro);
    const plain = generatePlainText(items, intro);

    return jsonResponse({ html, plain });
  } catch (error) {
    console.error('Handler error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
};
