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
  let pushInFlight = false;
  let pendingPush = false;

  function isRemoteNewer(remotePayload, remoteUpdatedAt) {
    const localTs = Store.db?.meta?.lastUpdated || '';
    const remoteTs = (remotePayload && remotePayload.meta && remotePayload.meta.lastUpdated)
      || remoteUpdatedAt
      || '';
    if (!remoteTs) return false;
    if (!localTs) return true;
    return remoteTs > localTs;
  }

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
        const { error } = await sb.from('users').upsert(userRows, { onConflict: 'id' });
        if (error) console.warn('users upsert:', error.message);
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
        const { error: evErr } = await sb.from('events').upsert(eventRows, { onConflict: 'id' });
        if (evErr) console.warn('events upsert:', evErr.message);

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
        if (prizeRows.length) {
          const { error } = await sb.from('prizes').upsert(prizeRows, { onConflict: 'prize_id' });
          if (error) console.warn('prizes upsert:', error.message);
        }
        if (slotRows.length) {
          const { error } = await sb.from('slots').upsert(slotRows, { onConflict: 'event_id,slot_number' });
          if (error) console.warn('slots upsert:', error.message);
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
        const { error } = await sb.from('proposals').upsert(propRows, { onConflict: 'id' });
        if (error) console.warn('proposals upsert:', error.message);
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
        const { error } = await sb.from('transactions').upsert(txRows, { onConflict: 'id' });
        if (error) console.warn('transactions upsert:', error.message);
      }
    } catch (err) {
      console.warn('Relational table background sync warning:', err.message);
    }
  }

  async function pushStateToSupabase() {
    if (isApplyingRemoteUpdate || !Store.db) return;
    if (pushInFlight) {
      pendingPush = true;
      return;
    }
    pushInFlight = true;
    pendingPush = false;

    try {
      const nowIso = new Date().toISOString();
      Store.db.meta = Store.db.meta || {};
      Store.db.meta.lastUpdated = nowIso;

      // Keep localStorage in sync with the timestamp we are about to write
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.db));
      } catch (_) {}

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
        console.error('Supabase state save error:', error.message, error);
        if (window.UI && UI.notify) {
          UI.notify('Cloud save failed: ' + error.message, 'error');
        }
        return;
      }

      // Mirror into relational tables for dashboard inspection
      syncRelationalTables(Store.db);
    } catch (err) {
      console.error('Failed to push state to Supabase:', err);
      if (window.UI && UI.notify) {
        UI.notify('Cloud save failed. Check console.', 'error');
      }
    } finally {
      pushInFlight = false;
      if (pendingPush) {
        pendingPush = false;
        pushStateToSupabase();
      }
    }
  }

  async function pullStateFromSupabase() {
    try {
      const { data, error } = await sb
        .from('app_state')
        .select('payload, updated_at')
        .eq('id', STATE_ROW_ID)
        .maybeSingle();

      if (error) {
        console.warn('Supabase initial fetch notice:', error.message);
        // Local is already loaded; try to push it so cloud is not empty
        await pushStateToSupabase();
        return;
      }

      if (data && data.payload && Array.isArray(data.payload.events)) {
        if (isRemoteNewer(data.payload, data.updated_at)) {
          isApplyingRemoteUpdate = true;
          Store.db = data.payload;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.db));
          } catch (_) {}
          if (window.UI) {
            UI.syncHeaderIndicators();
            if (!Store.uiState.isDrawInProgress) {
              UI.renderCurrentTab();
            }
          }
          isApplyingRemoteUpdate = false;
          console.log('Applied newer cloud state. lastUpdated=', Store.db.meta?.lastUpdated);
        } else {
          // Local is same or newer — push local so cloud catches up
          console.log('Local state is current; pushing to cloud if needed.');
          await pushStateToSupabase();
        }
      } else {
        // First time: seed Supabase from current Store.db
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

  // Realtime: only apply if the incoming payload is strictly newer
  sb.channel('quickdraw-live-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state', filter: `id=eq.${STATE_ROW_ID}` },
      (change) => {
        if (!change.new || !change.new.payload) return;
        const incoming = change.new.payload;
        if (!isRemoteNewer(incoming, change.new.updated_at)) return;

        isApplyingRemoteUpdate = true;
        Store.db = incoming;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.db));
        } catch (_) {}
        if (window.UI) {
          UI.syncHeaderIndicators();
          if (!Store.uiState.isDrawInProgress) {
            UI.renderCurrentTab();
          }
        }
        isApplyingRemoteUpdate = false;
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime channel subscribed for app_state');
      }
    });

  // Run after Store.init() has finished (onload + small delay)
  window.addEventListener('load', () => {
    setTimeout(pullStateFromSupabase, 200);
  });
})();