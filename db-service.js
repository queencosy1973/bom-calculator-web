/**
 * Supabase Database & Realtime Sync Service for QueenCosy BOM & Cost Calculator
 * Isolated Namespace: bom_calc_*
 * Features: Central Database, Live Realtime Sync across users, Offline LocalStorage Fallback
 */

window.DbService = (function () {
  'use strict';

  const SUPABASE_URL = 'https://yercmidyvfetvbbrewlf.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmNtaWR5dmZldHZiYnJld2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTA4MzUsImV4cCI6MjEwNDE4NjgzNX0.7tGbXNoogdLh6UQOJBJe9MABmY7W5J1aixPLJSXGSGk';

  const TABLE_PRICES = 'bom_calc_material_prices';
  const TABLE_PLANS = 'bom_calc_saved_plans';
  const TABLE_RECIPES = 'bom_calc_custom_recipes';

  let client = null;
  let isOnline = false;
  let isInitialized = false;
  const statusListeners = [];
  const realtimeListeners = {
    onPriceChange: [],
    onPlanChange: [],
    onRecipeChange: []
  };

  /**
   * Initialize Supabase Client & test connection
   */
  async function init() {
    if (isInitialized) return isOnline;

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false },
          realtime: { params: { eventsPerSecond: 10 } }
        });

        // Test connection by reading 1 row from prices table
        const { data, error } = await client.from(TABLE_PRICES).select('material_name').limit(1);

        if (error) {
          console.warn('[DbService] Supabase query notice (tables may not be created yet):', error.message);
          isOnline = false;
          notifyStatus('offline', 'ยังไม่พบตารางใน Supabase (ใช้ระบบออฟไลน์)');
        } else {
          isOnline = true;
          notifyStatus('online', 'เชื่อมต่อคลาวด์สำเร็จ (แชร์ข้อมูลกลาง)');
          setupRealtimeSubscriptions();
        }
      } catch (err) {
        console.warn('[DbService] Failed to connect to Supabase:', err);
        isOnline = false;
        notifyStatus('offline', 'ออฟไลน์ (ใช้งานจาก LocalStorage)');
      }
    } else {
      console.warn('[DbService] Supabase JS SDK not found. Running in offline mode.');
      isOnline = false;
      notifyStatus('offline', 'SDK ไม่พร้อมใช้งาน (ทำงานแบบออฟไลน์)');
    }

    isInitialized = true;
    return isOnline;
  }

  function notifyStatus(status, message) {
    statusListeners.forEach(cb => {
      try { cb(status, message); } catch (e) { console.error(e); }
    });
  }

  function onStatusChange(callback) {
    if (typeof callback === 'function') {
      statusListeners.push(callback);
      // Fire immediately with current status if initialized
      if (isInitialized) {
        callback(isOnline ? 'online' : 'offline', isOnline ? 'เชื่อมต่อคลาวด์สำเร็จ' : 'ออฟไลน์');
      }
    }
  }

  /**
   * Setup Realtime Subscriptions for live collaboration
   */
  function setupRealtimeSubscriptions() {
    if (!client || !isOnline) return;

    try {
      const channel = client.channel('bom-calc-shared-channel');

      // Listen for material price & stock changes
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: TABLE_PRICES
      }, payload => {
        console.log('[DbService Realtime] Price/Stock updated:', payload);
        realtimeListeners.onPriceChange.forEach(cb => {
          try { cb(payload); } catch (e) { console.error(e); }
        });
      });

      // Listen for saved plan changes
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: TABLE_PLANS
      }, payload => {
        console.log('[DbService Realtime] Saved Plan updated:', payload);
        realtimeListeners.onPlanChange.forEach(cb => {
          try { cb(payload); } catch (e) { console.error(e); }
        });
      });

      // Listen for custom recipe changes
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: TABLE_RECIPES
      }, payload => {
        console.log('[DbService Realtime] Recipe updated:', payload);
        realtimeListeners.onRecipeChange.forEach(cb => {
          try { cb(payload); } catch (e) { console.error(e); }
        });
      });

      channel.subscribe((status) => {
        console.log('[DbService Realtime] Channel status:', status);
      });
    } catch (err) {
      console.warn('[DbService Realtime] Setup error:', err);
    }
  }

  function subscribeRealtime(event, callback) {
    if (realtimeListeners[event] && typeof callback === 'function') {
      realtimeListeners[event].push(callback);
    }
  }

  // =========================================================================
  // 1. MATERIAL PRICES & STOCK ON HAND
  // =========================================================================

  /**
   * Fetch all material prices and stock from Supabase
   * Returns: { [materialName]: { unitPrice, currentStock, wastePercent, category, unit, updatedAt } }
   */
  async function fetchMaterialPrices() {
    if (!client || !isOnline) return null;

    try {
      const { data, error } = await client
        .from(TABLE_PRICES)
        .select('*');

      if (error) {
        console.warn('[DbService] fetchMaterialPrices error:', error);
        return null;
      }

      const map = {};
      (data || []).forEach(row => {
        map[row.material_name] = {
          unitPrice: Number(row.unit_price) || 0,
          currentStock: Number(row.current_stock) || 0,
          wastePercent: Number(row.waste_percent) || 0,
          category: row.category,
          unit: row.unit,
          updatedAt: row.updated_at,
          updatedBy: row.updated_by
        };
      });

      return map;
    } catch (err) {
      console.error('[DbService] fetchMaterialPrices exception:', err);
      return null;
    }
  }

  /**
   * Save / Upsert a single material's price or stock
   */
  async function saveMaterialPrice(materialName, data = {}) {
    if (!client || !isOnline) return false;

    try {
      const record = {
        material_name: materialName,
        updated_at: new Date().toISOString()
      };

      if (data.unitPrice !== undefined) record.unit_price = Number(data.unitPrice);
      if (data.currentStock !== undefined) record.current_stock = Number(data.currentStock);
      if (data.wastePercent !== undefined) record.waste_percent = Number(data.wastePercent);
      if (data.category) record.category = data.category;
      if (data.unit) record.unit = data.unit;
      if (data.updatedBy) record.updated_by = data.updatedBy;

      const { error } = await client
        .from(TABLE_PRICES)
        .upsert(record, { onConflict: 'material_name' });

      if (error) {
        console.error('[DbService] saveMaterialPrice error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[DbService] saveMaterialPrice exception:', err);
      return false;
    }
  }

  /**
   * Batch save all material prices and stocks
   */
  async function batchSaveMaterialPrices(materialsList) {
    if (!client || !isOnline || !Array.isArray(materialsList)) return false;

    try {
      const records = materialsList.map(m => ({
        material_name: m.name,
        category: m.category || 'other',
        unit: m.unit || 'ชิ้น',
        unit_price: Number(m.unitPrice) || 0,
        current_stock: Number(m.currentStock) || 0,
        waste_percent: Number(m.wastePercent) || 0,
        updated_at: new Date().toISOString(),
        updated_by: m.updatedBy || 'Admin'
      }));

      const { error } = await client
        .from(TABLE_PRICES)
        .upsert(records, { onConflict: 'material_name' });

      if (error) {
        console.error('[DbService] batchSaveMaterialPrices error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[DbService] batchSaveMaterialPrices exception:', err);
      return false;
    }
  }

  // =========================================================================
  // 2. SAVED CALCULATION PLANS (SHARED BETWEEN STAFF)
  // =========================================================================

  /**
   * Fetch all saved calculation plans
   */
  async function fetchSavedPlans() {
    if (!client || !isOnline) {
      // Offline fallback: load from localStorage
      try {
        const local = localStorage.getItem('qc_saved_plans_backup');
        return local ? JSON.parse(local) : [];
      } catch (e) {
        return [];
      }
    }

    try {
      const { data, error } = await client
        .from(TABLE_PLANS)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[DbService] fetchSavedPlans error:', error);
        const local = localStorage.getItem('qc_saved_plans_backup');
        return local ? JSON.parse(local) : [];
      }

      // Cache locally
      try {
        localStorage.setItem('qc_saved_plans_backup', JSON.stringify(data || []));
      } catch (e) {}

      return data || [];
    } catch (err) {
      console.error('[DbService] fetchSavedPlans exception:', err);
      return [];
    }
  }

  /**
   * Save / Create a new calculation plan
   * planData: { planName, items, summary, createdBy, notes }
   */
  async function savePlan(planData) {
    const timestamp = new Date();
    const dateStr = timestamp.getFullYear().toString().slice(-2) +
      String(timestamp.getMonth() + 1).padStart(2, '0') +
      String(timestamp.getDate()).padStart(2, '0');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const planId = planData.planId || ('CALC-' + dateStr + '-' + randomSuffix);

    const record = {
      plan_id: planId,
      plan_name: planData.planName || ('แผนคำนวณ ' + dateStr),
      total_skus: Number(planData.totalSkus) || (planData.items ? planData.items.length : 0),
      total_units: Number(planData.totalUnits) || 0,
      total_material_cost: Number(planData.totalMaterialCost) || 0,
      total_po_cost: Number(planData.totalPoCost) || 0,
      items_json: planData.items || [],
      summary_json: planData.summary || {},
      created_at: planData.createdAt || timestamp.toISOString(),
      updated_at: timestamp.toISOString(),
      created_by: planData.createdBy || 'Admin',
      notes: planData.notes || ''
    };

    if (!client || !isOnline) {
      // Save locally
      try {
        const local = await fetchSavedPlans();
        const existingIdx = local.findIndex(p => p.plan_id === planId);
        if (existingIdx >= 0) {
          local[existingIdx] = record;
        } else {
          local.unshift(record);
        }
        localStorage.setItem('qc_saved_plans_backup', JSON.stringify(local));
        return { success: true, planId, offline: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    try {
      const { error } = await client
        .from(TABLE_PLANS)
        .upsert(record, { onConflict: 'plan_id' });

      if (error) {
        console.error('[DbService] savePlan error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, planId, offline: false };
    } catch (err) {
      console.error('[DbService] savePlan exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Delete a saved plan
   */
  async function deletePlan(planId) {
    if (!planId) return false;

    // Delete from local backup cache
    try {
      const local = await fetchSavedPlans();
      const filtered = local.filter(p => p.plan_id !== planId);
      localStorage.setItem('qc_saved_plans_backup', JSON.stringify(filtered));
    } catch (e) {}

    if (!client || !isOnline) return true;

    try {
      const { error } = await client
        .from(TABLE_PLANS)
        .delete()
        .eq('plan_id', planId);

      if (error) {
        console.error('[DbService] deletePlan error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[DbService] deletePlan exception:', err);
      return false;
    }
  }

  // =========================================================================
  // 3. CUSTOM BOM RECIPES (RECIPES SYNCED ACROSS STAFF)
  // =========================================================================

  /**
   * Fetch all custom recipes from Supabase
   * Returns: { [sku]: { [matName]: qty } }
   */
  async function fetchCustomRecipes() {
    if (!client || !isOnline) return null;

    try {
      const { data, error } = await client
        .from(TABLE_RECIPES)
        .select('*');

      if (error) {
        console.warn('[DbService] fetchCustomRecipes error:', error);
        return null;
      }

      const map = {};
      (data || []).forEach(row => {
        map[row.sku] = row.materials_json || {};
      });

      return map;
    } catch (err) {
      console.error('[DbService] fetchCustomRecipes exception:', err);
      return null;
    }
  }

  /**
   * Save a single custom recipe
   */
  async function saveCustomRecipe(sku, materialsJson, updatedBy = 'Admin') {
    if (!client || !isOnline) return false;

    try {
      const record = {
        sku,
        materials_json: materialsJson,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy
      };

      const { error } = await client
        .from(TABLE_RECIPES)
        .upsert(record, { onConflict: 'sku' });

      if (error) {
        console.error('[DbService] saveCustomRecipe error:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[DbService] saveCustomRecipe exception:', err);
      return false;
    }
  }

  return {
    init,
    get isOnline() { return isOnline; },
    onStatusChange,
    subscribeRealtime,
    fetchMaterialPrices,
    saveMaterialPrice,
    batchSaveMaterialPrices,
    fetchSavedPlans,
    savePlan,
    deletePlan,
    fetchCustomRecipes,
    saveCustomRecipe
  };
})();
