require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const ws = require('ws');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rtvxjluabyrsqwafyzri.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

// Pass 'ws' explicitly so Node 20 can open Realtime WebSocket channels without native WS errors
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { transport: ws }
    })
  : null;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  if (!supabase) {
    return res.json({ ok: true, supabaseConnected: false, mode: 'client_sdk_only' });
  }

  try {
    const { error } = await supabase.from('app_state').select('id').limit(1);
    const reachable = !error || error.code === 'PGRST116';
    return res.json({
      ok: reachable,
      supabaseConnected: reachable,
      endpoint: SUPABASE_URL,
      status: error ? error.message : 'Connected to Supabase'
    });
  } catch (err) {
    return res.status(500).json({ ok: false, supabaseConnected: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Quickdraw dev server running on port ${PORT}`);
});