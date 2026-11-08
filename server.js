require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const ws = require('ws');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Pull Supabase credentials from .env if configured.
// If not set, the server still runs so the frontend can use local browser storage.
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

// Node 20 does not enable global WebSockets by default, so we pass the 'ws'
// library as the transport for Supabase's realtime client initialization.
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: {
        transport: ws
      }
    })
  : null;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Verify server status and Supabase connectivity
app.get('/api/health', async (req, res) => {
  if (!supabase) {
    return res.json({
      ok: true,
      supabaseConnected: false,
      mode: 'local_storage',
      message: 'Running in local browser storage mode. Configure .env to enable Supabase sync.'
    });
  }

  try {
    const { error } = await supabase.from('app_state').select('id').limit(1);
    const reachable = !error || error.code === 'PGRST116' || error.code === '42P01';

    return res.json({
      ok: reachable,
      supabaseConnected: reachable,
      endpoint: SUPABASE_URL,
      status: error ? error.message : 'Connected to Supabase'
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      supabaseConnected: false,
      error: err.message
    });
  }
});

// Retrieve state snapshot from Supabase
app.get('/api/state', async (req, res) => {
  if (!supabase) {
    return res.json({ state: null, source: 'local' });
  }

  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('payload, updated_at')
      .eq('id', 'quickdraw_main')
      .single();

    if (error) {
      return res.json({ state: null, source: 'local', detail: error.message });
    }

    return res.json({ state: data.payload, updatedAt: data.updated_at, source: 'supabase' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Persist state snapshot to Supabase
app.post('/api/state', async (req, res) => {
  if (!supabase) {
    return res.json({ saved: false, source: 'local' });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Expected a valid JSON state object' });
  }

  try {
    const { error } = await supabase
      .from('app_state')
      .upsert(
        {
          id: 'quickdraw_main',
          payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

    if (error) {
      return res.status(500).json({ saved: false, error: error.message });
    }

    return res.json({ saved: true, source: 'supabase' });
  } catch (err) {
    return res.status(500).json({ saved: false, error: err.message });
  }
});

// Send public/index.html for all frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Quickdraw server listening on port ${PORT}`);
});