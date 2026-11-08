/**
 * Quickdraw Supabase Cloud Bridge
 * Connects the browser Store in index.html directly to Supabase PostgreSQL
 * and Realtime channels so the platform runs 24/7 on GitHub Pages.
 */
(function () {
  const SUPABASE_URL = 'https://rtvxjluabyrsqwafyzri.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_11gaUy2989hXcGFT845GYg_r2BvQbVR';
  const STATE_ROW_ID = 'quickdraw_main';

  if (!window.supabase || !window.Store) {
    console.warn('Supabase SDK or Store not found; running on local browser storage.');
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  window.QuickdrawSupabase = sb;

  let isApplyingRemoteUpdate = false;

  // Sync structured relational tables in the background whenever state changes
  async function syncRelationalTables(db) {
    try {
      if (Array.isArray(db.users) && db.users.length > 0) {
        const userRows = db.users.map(u => ({
          id: u.id,
          username: u.username,
          password: u.password,
          role: u.role,
          display_name: u.displayName,
          bracket_name: u.bracketName,
          manager_id: u.managerId || null,
          active: u.active !== false,
          created_at: u.createdAt || new Date().toISOString()
        }));
        await sb.from('users').upsert(userRows, { onConflict: 'id' });
      }

      if (Array.isArray(db.events) && db.events.length > 0) {
        const eventRows = db.events.map(e => ({
          id: e.id,
          name: e.name,
          manager_id: e.managerId || null,
          bracket_name: e.bracketName,
          total_slots: e.totalSlots,
          price_per_slot: e.pricePerSlot,
          status: e.status,
          payment_verified: Boolean(e.paymentVerified),
          endorsed_at: e.endorsedAt || null,
          drawn_at: e.drawnAt || null,
          archived_at: e.archivedAt || null,
          created_at: e.createdAt || new Date().toISOString()
        }));
        await sb.from('events').upsert(eventRows, { onConflict: 'id' });

        // Flatten prizes and slots for relational inspection in Supabase Table Editor
        const prizeRows = [];
        const slotRows = [];

        db.events.forEach(e => {
          (e.prizes || []).forEach(p => {
            prizeRows.push({
              prize_id: p.prizeId,
              event_id: e.id,
              rank_label: p.rankLabel,
              description: p.description,
              preferred_slot: p.preferredSlot || null,
              winning_slot: p.winningSlot || null,
              release_status: p.releaseStatus || 'pending_release',
              released_by_agent_id: p.releasedByAgentId || null,
              released_at: p.releasedAt || null
            });
          });

          (e.slots || []).forEach(s => {
            slotRows.push({
              event_id: e.id,
              slot_number: s.slotNumber,
              status: s.status,
              buyer_nickname: s.buyerNickname || null,
              buyer_phone: s.buyerPhone || null,
              agent_id: s.agentId || null,
              sold_at: s.soldAt || null,
              tx_id: s.txId || null
            });
          });
        });

        if (prizeRows.length > 0) {
          await sb.from('prizes').upsert(prizeRows, { onConflict: 'prize_id' });
        }
        if (slotRows.length > 0) {
          await sb.from('slots').upsert(slotRows, { onConflict: 'event_id,slot_number' });
        }
      }

      if (Array.isArray(db.proposals) && db.proposals.length > 0) {
        const propRows = db.proposals.map(p => ({
          id: p.id,
          manager_id: p.managerId || null,
          type: p.type || 'create',
          target_event_id: p.targetEventId || null,
          proposed_name: p.proposedName,
          proposed_slots: p.proposedSlots,
          proposed_price: p.proposedPrice,
          proposed_prizes: p.proposedPrizes,
          notes: p.notes || '',
          status: p.status || 'pending',
          created_at: p.createdAt || new Date().toISOString()
        }));
        await sb.from('proposals').upsert(propRows, { onConflict: 'id' });
      }

      if (Array.isArray(db.transactions) && db.transactions.length > 0) {
        const txRows = db.transactions.map(t => ({
          id: t.id,
          event_id: t.eventId,
          event_name: t.eventName,
          agent_id: t.agentId || null,
          manager_id: t.managerId || null,
          buyer_nickname: t.buyerNickname,
          buyer_phone: t.buyerPhone,
          slots: t.slots || [],
          sale_mode: t.saleMode || 'individual',
          amount_total: t.amountTotal,
          created_at: t.createdAt || new Date().toISOString()
        }));
        await sb.from('transactions').upsert(txRows, { onConflict: 'id' });
      }
    } catch (err) {
      console.warn('Relational table background sync warning:', err.message);
    }
  }

  // Push complete application state to Supabase app_state + relational tables
  async function pushStateToSupabase() {
    if (isApplyingRemoteUpdate || !Store.db) return;

    try {
      const nowIso = new Date().toISOString();
      Store.db.meta.lastUpdated = nowIso;

      const { error } = await sb
        .from('app_state')
        .upsert(
          {
            id: STATE_ROW_ID,
            payload: Store.db,
            updated_at: nowIso
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.error('Supabase state save error:', error.message);
        return;
      }

      // Mirror changes into relational tables for Supabase dashboard auditing
      syncRelationalTables(Store.db);
    } catch (err) {
      console.error('Failed to push state to Supabase:', err);
    }
  }

  // Pull latest state from Supabase on initial boot
  async function pullStateFromSupabase() {
    try {
      const { data, error } = await sb
        .from('app_state')
        .select('payload, updated_at')
        .eq('id', STATE_ROW_ID)
        .maybeSingle();

      if (error) {
        console.warn('Supabase initial fetch notice:', error.message);
        return;
      }

      if (data && data.payload && Array.isArray(data.payload.events)) {
        isApplyingRemoteUpdate = true;
        Store.db = data.payload;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.db));
        UI.syncHeaderIndicators();
        if (!Store.uiState.isDrawInProgress) {
          UI.renderCurrentTab();
        }
        isApplyingRemoteUpdate = false;
      } else {
        // First time connecting: seed Supabase with initial Store.db
        await pushStateToSupabase();
      }
    } catch (err) {
      console.warn('Could not load cloud state; using local fallback:', err.message);
    }
  }

  // Wrap Store.save so every state change automatically persists to Supabase
  const originalSave = Store.save.bind(Store);
  Store.save = function () {
    originalSave();
    pushStateToSupabase();
  };

  // Wrap Store.resetToSeed so resetting demo data also resets Supabase
  const originalReset = Store.resetToSeed.bind(Store);
  Store.resetToSeed = function () {
    originalReset();
    pushStateToSupabase();
  };

  // Subscribe to real-time changes from other browsers/testers
  sb.channel('quickdraw-live-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state', filter: `id=eq.${STATE_ROW_ID}` },
      (change) => {
        if (!change.new || !change.new.payload) return;
        const incoming = change.new.payload;
        const currentUpdated = Store.db?.meta?.lastUpdated || '';
        const incomingUpdated = incoming?.meta?.lastUpdated || '';

        if (incomingUpdated && incomingUpdated !== currentUpdated) {
          isApplyingRemoteUpdate = true;
          Store.db = incoming;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.db));
          UI.syncHeaderIndicators();
          if (!Store.uiState.isDrawInProgress) {
            UI.renderCurrentTab();
          }
          isApplyingRemoteUpdate = false;
        }
      }
    )
    .subscribe();

  // Run initial cloud sync once the window finishes bootstrapping Store
  window.addEventListener('load', () => {
    setTimeout(pullStateFromSupabase, 150);
  });
})();