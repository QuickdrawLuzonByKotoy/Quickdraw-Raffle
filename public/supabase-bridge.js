/**
 * Quickdraw Supabase Cloud Bridge
 * Connects the browser Store in index.html directly to Supabase PostgreSQL
 * and Realtime channels so the platform runs 24/7 on GitHub Pages.
 */
(function () {
  const SUPABASE_URL = 'https://rtvxjluabyrsqwafyzri.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_11gaUy2989hXcGFT845GYg_r2BvQbVR';
  const STATE_ROW_ID = 'quickdraw_main';

  function getSupabase() {
    return window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  }

  function getStore() {
    return window.Store || (typeof Store !== 'undefined' ? Store : null);
  }

  function getStorageKey() {
    return window.STORAGE_KEY || (typeof STORAGE_KEY !== 'undefined' ? STORAGE_KEY : 'QUICKDRAW_DB_V3');
  }

  function getUI() {
    return window.UI || (typeof UI !== 'undefined' ? UI : null);
  }

  function startBridge() {
    const supabaseLib = getSupabase();
    const storeRef = getStore();

    if (!supabaseLib || !storeRef) {
      console.warn('Supabase SDK or Store not found; retrying…', {
        hasSupabase: !!supabaseLib,
        hasStore: !!storeRef
      });
      setTimeout(startBridge, 150);
      return;
    }

    const sb = supabaseLib.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    window.QuickdrawSupabase = sb;

    let isApplyingRemoteUpdate = false;
    let pushInFlight = false;
    let pendingPush = false;

    let cloudReady = false;

    function isSeedSnapshot(db) {
      return !!(db && db.meta && db.meta.fromSeed);
    }

    function hasUsablePayload(payload) {
      return !!(payload && Array.isArray(payload.events) && Array.isArray(payload.users));
    }

    function isRemoteNewer(remotePayload, remoteUpdatedAt) {
      // Seed on this device must never beat real cloud data
      if (isSeedSnapshot(storeRef.db) && hasUsablePayload(remotePayload) && !isSeedSnapshot(remotePayload)) {
        return true;
      }
      const localTs = (storeRef.db && storeRef.db.meta && storeRef.db.meta.lastUpdated) || '';
      const remoteTs =
        (remotePayload && remotePayload.meta && remotePayload.meta.lastUpdated) ||
        remoteUpdatedAt ||
        '';
      if (!remoteTs) return false;
      if (!localTs) return true;
      return remoteTs > localTs;
    }

    async function syncRelationalTables(db) {
      try {
        if (Array.isArray(db.users) && db.users.length > 0) {
          const userRows = db.users.map(function (u) {
            return {
              id: u.id,
              username: u.username,
              password: u.password,
              role: u.role,
              display_name: u.displayName,
              bracket_name: u.bracketName,
              manager_id: u.managerId || null,
              active: u.active !== false,
              created_at: u.createdAt || new Date().toISOString()
            };
          });
          const userRes = await sb.from('users').upsert(userRows, { onConflict: 'id' });
          if (userRes.error) console.warn('users upsert:', userRes.error.message);
        }

        if (Array.isArray(db.events) && db.events.length > 0) {
          const eventRows = db.events.map(function (e) {
            return {
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
            };
          });
          const evRes = await sb.from('events').upsert(eventRows, { onConflict: 'id' });
          if (evRes.error) console.warn('events upsert:', evRes.error.message);

          const prizeRows = [];
          const slotRows = [];
          db.events.forEach(function (e) {
            (e.prizes || []).forEach(function (p) {
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
            (e.slots || []).forEach(function (s) {
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
            const pRes = await sb.from('prizes').upsert(prizeRows, { onConflict: 'prize_id' });
            if (pRes.error) console.warn('prizes upsert:', pRes.error.message);
          }
          if (slotRows.length) {
            const sRes = await sb.from('slots').upsert(slotRows, { onConflict: 'event_id,slot_number' });
            if (sRes.error) console.warn('slots upsert:', sRes.error.message);
          }
        }

        if (Array.isArray(db.proposals) && db.proposals.length > 0) {
          const propRows = db.proposals.map(function (p) {
            return {
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
            };
          });
          const propRes = await sb.from('proposals').upsert(propRows, { onConflict: 'id' });
          if (propRes.error) console.warn('proposals upsert:', propRes.error.message);
        }

        if (Array.isArray(db.transactions) && db.transactions.length > 0) {
          const txRows = db.transactions.map(function (t) {
            return {
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
            };
          });
          const txRes = await sb.from('transactions').upsert(txRows, { onConflict: 'id' });
          if (txRes.error) console.warn('transactions upsert:', txRes.error.message);
        }
      } catch (err) {
        console.warn('Relational table background sync warning:', err.message);
      }
    }

    function applyCloudPayload(payload, reason) {
      isApplyingRemoteUpdate = true;
      storeRef.db = payload;
      if (storeRef.db.meta) {
        storeRef.db.meta.fromSeed = !!storeRef.db.meta.fromSeed;
      }
      try {
        localStorage.setItem(getStorageKey(), JSON.stringify(storeRef.db));
      } catch (_) {}
      const ui = getUI();
      if (ui) {
        ui.syncHeaderIndicators();
        if (!storeRef.uiState.isDrawInProgress) ui.renderCurrentTab();
      }
      if (window.GameEngine && typeof GameEngine.onRemoteState === 'function') {
        GameEngine.onRemoteState();
      }
      isApplyingRemoteUpdate = false;
      console.log('Cloud state applied (' + reason + '). lastUpdated=', storeRef.db.meta && storeRef.db.meta.lastUpdated);
    }

    async function pushStateToSupabase() {
      if (isApplyingRemoteUpdate || !storeRef.db) return;
      // Wait until first pull finishes so a fresh seed cannot wipe the cloud
      if (!cloudReady) {
        pendingPush = true;
        return;
      }
      // Never upload pure seed over an existing cloud database
      if (isSeedSnapshot(storeRef.db)) {
        console.warn('Skipping cloud push: local data is still the demo seed.');
        return;
      }
      if (pushInFlight) {
        pendingPush = true;
        return;
      }
      pushInFlight = true;
      pendingPush = false;

      try {
        const nowIso = new Date().toISOString();
        storeRef.db.meta = storeRef.db.meta || {};
        storeRef.db.meta.fromSeed = false;
        storeRef.db.meta.lastUpdated = nowIso;

        try {
          localStorage.setItem(getStorageKey(), JSON.stringify(storeRef.db));
        } catch (_) {}

        const result = await sb
          .from('app_state')
          .upsert(
            {
              id: STATE_ROW_ID,
              payload: storeRef.db,
     async function pullStateFromSupabase() {
      // Cloud-first: Supabase app_state is the source of truth on every page load.
      try {
        const result = await sb
          .from('app_state')
          .select('payload, updated_at')
          .eq('id', STATE_ROW_ID)
          .maybeSingle();

        if (result.error) {
          console.warn('Supabase fetch error (keeping local cache):', result.error.message);
          return;
        }

        const data = result.data;
        if (data && hasUsablePayload(data.payload)) {
          // Cloud-first: every page load adopts Supabase state as the source of truth
          applyCloudPayload(data.payload, 'boot-cloud-first');
        } else {
          // Empty cloud: upload local once so the project is initialized
          console.log('Cloud empty — uploading local state as initial app_state.');
          if (storeRef.db && storeRef.db.meta) {
            storeRef.db.meta.fromSeed = false;
            storeRef.db.meta.initialSeedUpload = true;
          }
          cloudReady = true;
          await pushStateToSupabase();
          return;
        }
      } catch (err) {
        console.warn('Could not load cloud state; using local cache:', err.message);
      } finally {
        cloudReady = true;
        if (pendingPush && storeRef.db && !isSeedSnapshot(storeRef.db)) {
          pendingPush = false;
          pushStateToSupabase();
        }
      }
    }

console.log('Cloud app_state empty; uploading local state once.');
          cloudReady = true;
          if (isSeedSnapshot(storeRef.db)) {
            // First install: allow seed push by clearing flag for this one write
            storeRef.db.meta = storeRef.db.meta || {};
            storeRef.db.meta.fromSeed = false;
            storeRef.db.meta.initialSeedUpload = true;
          }
          await pushStateToSupabase();
          return;
        }
      } catch (err) {
        console.warn('Could not load cloud state; using local fallback:', err.message);
      } finally {
        cloudReady = true;
        if (pendingPush && storeRef.db && !isSeedSnapshot(storeRef.db)) {
          pendingPush = false;
          pushStateToSupabase();
        }
      }
    }

    const originalSave = storeRef.save.bind(storeRef);
    storeRef.save = function () {
      originalSave();
      pushStateToSupabase();
    };

    const originalReset = storeRef.resetToSeed.bind(storeRef);
    storeRef.resetToSeed = function () {
      originalReset();
      pushStateToSupabase();
    };

    sb.channel('quickdraw-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.' + STATE_ROW_ID },
        function (change) {
          if (!change.new || !change.new.payload) return;
          const incoming = change.new.payload;
          if (!isRemoteNewer(incoming, change.new.updated_at)) return;

          isApplyingRemoteUpdate = true;
          storeRef.db = incoming;
          try {
            localStorage.setItem(getStorageKey(), JSON.stringify(storeRef.db));
          } catch (_) {}
          const ui = getUI();
          if (ui) {
            ui.syncHeaderIndicators();
            // Always refresh tabs for event status changes unless this tab is the draw host mid-animation
            if (!storeRef.uiState.isDrawInProgress || (window.GameEngine && GameEngine.isRemoteFollower)) {
              ui.renderCurrentTab();
            }
          }
          if (window.GameEngine && typeof GameEngine.onRemoteState === 'function') {
            GameEngine.onRemoteState();
          }
          isApplyingRemoteUpdate = false;
        }
      )
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime channel subscribed for app_state');
        }
      });

    function schedulePull() {
      setTimeout(pullStateFromSupabase, 200);
    }

    if (document.readyState === 'complete') {
      schedulePull();
    } else {
      window.addEventListener('load', schedulePull);
    }

    console.log('Quickdraw Supabase bridge started');
  }

  startBridge();
})();
