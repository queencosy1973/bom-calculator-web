/**
 * Main Application Controller for BOM & Production Material Planner
 * With Dynamic Master BOM Recipe Editing, LocalStorage Persistence & Excel Import/Export
 */

(function () {
  'use strict';

  const STORAGE_BOM_KEY = 'qc_master_bom_custom_v2';
  const STORAGE_STOCK_KEY = 'qc_stock_on_hand_v2';
  const STORAGE_PRICES_KEY = 'qc_material_prices_v2';

  // Baseline Default Material Prices (THB per Unit)
  const DEFAULT_MATERIAL_PRICES = {
    // โครงสร้างไม้ (wood)
    'ไม้ 1 นิ้ว 1 เมตร (ท่อน)': 12,
    'ไม้ 2 นิ้ว 1 เมตร (ท่อน)': 18,
    'ไม้ 2 นิ้ว 1.5 เมตร (ท่อน)': 26,
    'ไม้อัด (แผ่น)': 180,
    'ไม้หน้า 4 (ท่อน)': 45,

    // ฟองน้ำ (foam)
    'ฟองน้ำ 2 นิ้ว ที่นั่ง (PM7)': 280,
    'ฟองน้ำ 2 นิ้ว แขน (PM7)': 240,
    'ฟองน้ำ 1 นิ้ว เนื้อพิง': 160,
    'ฟองน้ำ 2 นิ้ว ตัวแอล': 350,
    'ฟองน้ำ 2 นิ้ว หลังพิง (PM103)': 260,

    // หนัง / ผ้า (fabric/leather)
    'ดำ-PQ002C-17': 70,
    'ขาว-PQ002C-1': 70,
    'เทา-PQ002C-46': 70,
    'น้ำตาล-PQ002C-12': 70,
    'ชา-PQ002C-19': 70,
    'ครีม-PQ002C-6': 70,
    'มอคค่า-PQ002C-48': 70,
    'สีน้ำตาล-MJ337-7': 85,
    'สีเขียว-MJ337-14': 85,
    'สีแดงมะเหมี่ยว-MJ337-23': 85,
    'สีเทา-MJ337-29': 85,
    'สีน้ำเงิน-MJ337-31': 85,
    'สีโรสโกลด์-MJ337-22': 85,
    'สีน้ำตาล-MJ350-13': 85,
    'สีเขียว-MJ350-6': 85,
    'สีฟ้าเข้มMJ350-9': 85,
    'สีครีมทอง-MJ350-4': 85,
    'สีเทาอ่อน-MJ350-18': 85,
    'สีเทาเข้ม-MJ350-20': 85,
    'สีครีม-MJ350-1': 85,
    'สีน้ำตาลอ่อน-MJ350-11': 85,
    'น้ำตาลเข้ม-MJ350-14': 85,
    'สีครีม-MJ356-1a': 90,
    'สีเขียว-MJ356-2a': 90,
    'สีเทา-MJ356-3a': 90,
    'สีน้ำตาล-MJ356-4a': 90,
    'สีน้ำตาลทอง-736b-01': 90,
    'สีฟ้าเทา-736b-04': 90,
    'สีเทาเข้ม-736b-02': 90,

    // บรรจุภัณฑ์ (packaging)
    'กระดาษลูกฟูกแผ่น (แผ่น)': 15,
    'กระดาษลูกฟูกม้วน (cm.)': 0.08,
    'บับเบิ้ล (cm.)': 0.04,
    'ฟิล์มหด/ซีลพลาสติก (cm.)': 0.03
  };

  // Application State
  const state = {
    masterBomData: null, // Active BOM (loaded from localStorage or baseline)
    plannedItems: [], // Array of { sku, quantity, date, orderCount, unitCost, totalCost }
    stockOnHandMap: {}, // { [matName]: { currentStock, wastePercent } }
    materialPriceMap: {}, // { [matName]: number }
    calculationResult: null,
    activeCategory: 'all',
    priceActiveCategory: 'all',
    planSearchQuery: '',
    catalogSearchQuery: '',
    priceSearchQuery: '',
    unmatchedList: []
  };

  // Editing state for Modal
  let editingBom = {
    isNew: false,
    originalSku: '',
    sku: '',
    materials: {} // { [matName]: number }
  };

  // Helper: DOM Selectors
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // Initialize Application
  function init() {
    if (typeof MASTER_BOM_DATA === 'undefined') {
      console.error('Master BOM Data not loaded!');
      return;
    }

    // 1. Load Master BOM from localStorage if available
    loadMasterBom();

    // 2. Initialize stockOnHandMap with 0 or saved stock
    initStockOnHand();

    // 3. Initialize materialPriceMap with saved prices or defaults
    initMaterialPrices();

    // 4. Initialize SKU Index in Mapper
    window.SkuMapper.initSkuIndex(state.masterBomData);

    // 5. Setup material select dropdown for editing modal
    populateMaterialSelect();

    // 6. Setup event listeners
    setupEventListeners();

    // 7. Initial render
    renderCatalog();
    renderPricesTable();
    recalculate();
  }

  // Load Master BOM (Local Storage or Baseline)
  function loadMasterBom() {
    const saved = localStorage.getItem(STORAGE_BOM_KEY);
    if (saved) {
      try {
        state.masterBomData = JSON.parse(saved);
        updateBomStatusTag(true);
      } catch (e) {
        console.error('Failed to parse saved BOM:', e);
        state.masterBomData = JSON.parse(JSON.stringify(MASTER_BOM_DATA));
        updateBomStatusTag(false);
      }
    } else {
      state.masterBomData = JSON.parse(JSON.stringify(MASTER_BOM_DATA));
      updateBomStatusTag(false);
    }
  }

  // Save Master BOM to localStorage
  function saveMasterBom(showNotification = true) {
    localStorage.setItem(STORAGE_BOM_KEY, JSON.stringify(state.masterBomData));
    window.SkuMapper.initSkuIndex(state.masterBomData);
    updateBomStatusTag(true);

    if (showNotification) {
      showToast('บันทึกสูตร BOM สำเร็จ และบันทึกลงในเครื่องถาวรแล้ว');
    }

    renderCatalog();
    recalculate();
  }

  // Update Status Tag in Tab 4 Header
  function updateBomStatusTag(isCustom) {
    const tag = $('bom-status-tag');
    if (!tag) return;
    if (isCustom) {
      tag.textContent = '✏️ มีการแก้ไขสูตร (บันทึกลงเครื่องแล้ว)';
      tag.className = 'px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-50 text-amber-800 border border-amber-200';
    } else {
      tag.textContent = '● ข้อมูลมาตรฐานโรงงาน (423 รุ่น)';
      tag.className = 'px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
  }

  // Initialize Stock On Hand
  function initStockOnHand() {
    const savedStock = localStorage.getItem(STORAGE_STOCK_KEY);
    let parsedStock = {};
    if (savedStock) {
      try { parsedStock = JSON.parse(savedStock); } catch (e) {}
    }

    state.masterBomData.materials.forEach(m => {
      const savedItem = parsedStock[m.name];
      state.stockOnHandMap[m.name] = {
        currentStock: savedItem ? savedItem.currentStock : 0,
        wastePercent: savedItem ? savedItem.wastePercent : 0
      };
    });
  }

  // Save Stock On Hand to localStorage
  function saveStockOnHand() {
    localStorage.setItem(STORAGE_STOCK_KEY, JSON.stringify(state.stockOnHandMap));
  }

  // Initialize Material Prices (from LocalStorage or Default Benchmark)
  function initMaterialPrices() {
    const saved = localStorage.getItem(STORAGE_PRICES_KEY);
    let parsed = {};
    if (saved) {
      try { parsed = JSON.parse(saved); } catch (e) {}
    }

    state.materialPriceMap = {};
    state.masterBomData.materials.forEach(m => {
      if (parsed[m.name] !== undefined && parsed[m.name] !== null && parsed[m.name] !== '') {
        state.materialPriceMap[m.name] = Number(parsed[m.name]) || 0;
      } else if (DEFAULT_MATERIAL_PRICES[m.name] !== undefined) {
        state.materialPriceMap[m.name] = DEFAULT_MATERIAL_PRICES[m.name];
      } else {
        state.materialPriceMap[m.name] = 0;
      }
    });

    updatePricesStatusTag(!!saved);
  }

  // Save Material Prices to localStorage
  function saveMaterialPrices(showNotification = false) {
    localStorage.setItem(STORAGE_PRICES_KEY, JSON.stringify(state.materialPriceMap));
    updatePricesStatusTag(true);
    if (showNotification) {
      showToast('บันทึกราคาต้นทุนวัสดุเรียบร้อยแล้ว');
    }
    recalculate();
    renderPricesTable();
  }

  // Reset Material Prices to Defaults
  function resetMaterialPrices() {
    if (confirm('คุณต้องการคืนค่าราคาต้นทุนทั้งหมดกลับเป็นราคาเริ่มต้นมาตรฐาน ใช่หรือไม่?')) {
      localStorage.removeItem(STORAGE_PRICES_KEY);
      initMaterialPrices();
      saveMaterialPrices(false);
      showToast('คืนค่าราคาต้นทุนเริ่มต้นสำเร็จ', '🔄');
    }
  }

  // Update Status Tag in Tab 4 Header
  function updatePricesStatusTag(isCustom) {
    const tag = $('prices-status-tag');
    if (!tag) return;
    if (isCustom) {
      tag.textContent = '✏️ มีการแก้ไขราคา (บันทึกแล้ว)';
      tag.className = 'px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-50 text-amber-800 border border-amber-200';
    } else {
      tag.textContent = '● ราคามาตรฐานอ้างอิงโรงงาน';
      tag.className = 'px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
  }

  // Populate Add Material Select Dropdown in Modal
  function populateMaterialSelect() {
    const select = $('modal-edit-add-mat-select');
    if (!select) return;

    select.innerHTML = state.masterBomData.materials.map(m => `
      <option value="${m.name}">${m.name} (${m.unit})</option>
    `).join('');
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // 1. Download Template Button
    $('btn-download-template').addEventListener('click', () => {
      window.TemplateExport.downloadProductionTemplate(state.masterBomData);
    });

    // 2. Export Buttons
    $('btn-export-picking').addEventListener('click', () => {
      if (!state.calculationResult) return;
      window.TemplateExport.exportPickingList(state.calculationResult);
    });

    $('btn-export-po').addEventListener('click', () => {
      if (!state.calculationResult) return;
      window.TemplateExport.exportPurchaseOrder(state.calculationResult);
    });

    // Price Master Export & Import
    const btnExportPrices = $('btn-export-prices-excel');
    if (btnExportPrices) {
      btnExportPrices.addEventListener('click', () => {
        window.TemplateExport.exportMaterialPricesExcel(state.masterBomData, state.materialPriceMap);
      });
    }

    const fileImportPrices = $('file-import-prices');
    const btnImportPrices = $('btn-import-prices-excel');
    if (btnImportPrices && fileImportPrices) {
      btnImportPrices.addEventListener('click', () => fileImportPrices.click());
      fileImportPrices.addEventListener('change', handleImportPricesExcel);
    }

    const btnResetPrices = $('btn-reset-prices');
    if (btnResetPrices) {
      btnResetPrices.addEventListener('click', resetMaterialPrices);
    }

    // 3. Demo Data Button
    $('btn-load-demo').addEventListener('click', loadDemoData);

    // 4. Clear All Button
    $('btn-clear-all').addEventListener('click', () => {
      if (confirm('คุณต้องการล้างข้อมูลแผนการผลิตทั้งหมดใช่หรือไม่?')) {
        state.plannedItems = [];
        state.unmatchedList = [];
        $('file-status-banner').classList.add('hidden');
        recalculate();
      }
    });

    // 4.1 Export Full Calculation & Print Summary
    const btnExportFull = $('btn-export-full-calc');
    if (btnExportFull) {
      btnExportFull.addEventListener('click', () => {
        if (!state.calculationResult) {
          alert('⚠️ ยังไม่มีข้อมูลการคำนวณ กรุณาอัปโหลดหรือระบุจำนวนสินค้าก่อนครับ');
          return;
        }
        window.TemplateExport.exportFullCalculationExcel(state.calculationResult, state.plannedItems, state.materialPriceMap);
      });
    }

    const btnPrintSummary = $('btn-print-cost-summary');
    if (btnPrintSummary) {
      btnPrintSummary.addEventListener('click', () => {
        if (!state.calculationResult) {
          alert('⚠️ ยังไม่มีข้อมูลการคำนวณ กรุณาอัปโหลดหรือระบุจำนวนสินค้าก่อนครับ');
          return;
        }
        window.print();
      });
    }

    // 5. Dropzone 1 (Template)
    setupDropzone('dropzone-template', 'file-template');

    // 6. Dropzone 2 (E-Commerce Order All)
    setupDropzone('dropzone-order', 'file-order');

    // 7. Manual Add & Autocomplete
    setupManualAdd();

    // 8. Tab Switching
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });

    // 9. Material Category Filter Buttons
    $$('.mat-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.mat-filter-btn').forEach(b => {
          b.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
          b.classList.add('bg-slate-100', 'text-slate-700');
        });
        btn.classList.remove('bg-slate-100', 'text-slate-700');
        btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');

        state.activeCategory = btn.getAttribute('data-category');
        renderMaterialsTable();
      });
    });

    // Price Category Filter Buttons (Tab 4)
    $$('.price-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.price-filter-btn').forEach(b => {
          b.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
          b.classList.add('bg-slate-100', 'text-slate-700');
        });
        btn.classList.remove('bg-slate-100', 'text-slate-700');
        btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');

        state.priceActiveCategory = btn.getAttribute('data-category');
        renderPricesTable();
      });
    });

    // 10. Search inputs
    $('filter-plan-search').addEventListener('input', e => {
      state.planSearchQuery = e.target.value.toLowerCase().trim();
      renderPlanTable();
    });

    const pricesSearch = $('prices-search');
    if (pricesSearch) {
      pricesSearch.addEventListener('input', e => {
        state.priceSearchQuery = e.target.value.toLowerCase().trim();
        renderPricesTable();
      });
    }

    $('catalog-search').addEventListener('input', e => {
      state.catalogSearchQuery = e.target.value.toLowerCase().trim();
      renderCatalog();
    });

    // 11. Modal Consuming Close
    $('modal-mat-close').addEventListener('click', closeConsumingModal);
    $('modal-mat-close-btn').addEventListener('click', closeConsumingModal);
    $('modal-consuming').addEventListener('click', e => {
      if (e.target === $('modal-consuming')) closeConsumingModal();
    });

    // 12. BOM Catalog Management Toolbar Events
    $('btn-add-new-sku').addEventListener('click', () => openEditBomModal('', true));

    $('btn-export-bom-excel').addEventListener('click', () => {
      window.TemplateExport.exportMasterBomExcel(state.masterBomData);
    });

    const fileImport = $('file-import-bom');
    $('btn-import-bom-excel').addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', handleImportBomExcel);

    $('btn-reset-bom').addEventListener('click', () => {
      if (confirm('คุณต้องการรีเซ็ตสูตรทั้งหมดกลับเป็นค่าเริ่มต้นมาตรฐานโรงงาน (423 รุ่น) ใช่หรือไม่?')) {
        localStorage.removeItem(STORAGE_BOM_KEY);
        state.masterBomData = JSON.parse(JSON.stringify(MASTER_BOM_DATA));
        saveMasterBom(false);
        showToast('คืนค่าสูตรมาตรฐานโรงงานสำเร็จ', '🔄');
      }
    });

    // 13. Edit BOM Modal Events
    $('modal-edit-bom-close').addEventListener('click', closeEditBomModal);
    $('btn-modal-edit-cancel').addEventListener('click', closeEditBomModal);
    $('btn-modal-edit-add-mat').addEventListener('click', handleModalAddMaterial);
    $('btn-modal-edit-save').addEventListener('click', handleModalSaveBom);
    $('modal-edit-bom').addEventListener('click', e => {
      if (e.target === $('modal-edit-bom')) closeEditBomModal();
    });
  }

  // Switch Active Tab
  function switchTab(targetTabId) {
    $$('.tab-btn').forEach(b => {
      if (b.getAttribute('data-tab') === targetTabId) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    $$('.tab-pane').forEach(p => {
      if (p.id === targetTabId) {
        p.classList.remove('hidden');
      } else {
        p.classList.add('hidden');
      }
    });
  }

  // Setup Dropzone helper
  function setupDropzone(dropzoneId, inputId) {
    const dropzone = $(dropzoneId);
    const input = $(inputId);

    dropzone.addEventListener('click', () => input.click());

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFile(files[0]);
    });

    input.addEventListener('change', e => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  // Handle uploaded file (Production Template or Order All)
  async function handleFile(file) {
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const parseResult = window.SkuMapper.parseProductionOrOrderRows(rows);
      if (!parseResult.success) {
        alert('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + parseResult.error);
        return;
      }

      state.plannedItems = parseResult.plannedItems;
      state.unmatchedList = parseResult.unmatched;

      // Update banner
      $('file-status-banner').classList.remove('hidden');
      $('banner-file-name').textContent = file.name;
      $('banner-file-type').textContent = parseResult.fileType;
      $('banner-file-stats').textContent = `นำเข้าสำเร็จ ${parseResult.totalUnits} ชิ้น (${parseResult.matchedSkusCount} รุ่น) | ออเดอร์ทั้งหมด ${parseResult.totalInputRows} แถว (คัดกรองยกเลิกออก ${parseResult.cancelledCount} รายการ)`;

      if (parseResult.unmatchedCount > 0) {
        $('banner-unmatched-wrapper').classList.remove('hidden');
        $('banner-unmatched-count').textContent = parseResult.unmatchedCount;
        $('btn-show-unmatched').onclick = () => showUnmatchedModal(parseResult.unmatched);
      } else {
        $('banner-unmatched-wrapper').classList.add('hidden');
      }

      recalculate();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการประมวลผลไฟล์: ' + err.message);
    }
  }

  // Handle Import Master BOM from Excel
  async function handleImportBomExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      const res = window.TemplateExport.parseMasterBomExcel(rows, state.masterBomData.materials);
      if (!res.success) {
        alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์สูตร: ' + res.error);
        return;
      }

      state.masterBomData.skus = res.skus;
      saveMasterBom(true);
      showToast(`นำเข้าสูตรสำเร็จ ${res.count} รุ่น และบันทึกลงระบบแล้ว`, '📥');
      e.target.value = '';
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถอ่านไฟล์ Excel ได้: ' + err.message);
    }
  }

  // Handle Import Material Prices from Excel
  async function handleImportPricesExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(data), { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

      const res = window.TemplateExport.parseMaterialPricesExcel(rows);
      if (!res.success) {
        alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์ราคา: ' + res.error);
        return;
      }

      Object.assign(state.materialPriceMap, res.prices);
      saveMaterialPrices(false);
      showToast(`นำเข้าราคาสำเร็จ ${res.count} รายการ และบันทึกลงระบบแล้ว`, '📥');
      e.target.value = '';
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถอ่านไฟล์ Excel ได้: ' + err.message);
    }
  }

  // Setup Manual Add with Autocomplete
  function setupManualAdd() {
    const input = $('manual-sku-input');
    const autoList = $('sku-autocomplete-list');
    const btnAdd = $('btn-add-manual');
    const qtyInput = $('manual-qty-input');

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        autoList.classList.add('hidden');
        return;
      }

      const matches = state.masterBomData.skus
        .filter(s => s.sku.toLowerCase().includes(q))
        .slice(0, 20);

      if (matches.length === 0) {
        autoList.innerHTML = '<div class="p-2 text-xs text-slate-400">ไม่พบรุ่นที่ค้นหา</div>';
        autoList.classList.remove('hidden');
        return;
      }

      autoList.innerHTML = matches.map(m => `
        <div class="autocomplete-item" data-sku="${m.sku}">${m.sku}</div>
      `).join('');
      autoList.classList.remove('hidden');

      autoList.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          input.value = item.getAttribute('data-sku');
          autoList.classList.add('hidden');
        });
      });
    });

    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !autoList.contains(e.target)) {
        autoList.classList.add('hidden');
      }
    });

    btnAdd.addEventListener('click', () => {
      const skuVal = input.value.trim();
      const qtyVal = parseInt(qtyInput.value, 10);

      if (!skuVal) {
        alert('กรุณาเลือกรุ่นสินค้า');
        return;
      }
      if (isNaN(qtyVal) || qtyVal <= 0) {
        alert('กรุณาระบุจำนวนที่มากกว่า 0');
        return;
      }

      // Check if already in plan
      const existing = state.plannedItems.find(p => p.sku === skuVal);
      if (existing) {
        existing.quantity += qtyVal;
      } else {
        state.plannedItems.push({
          sku: skuVal,
          quantity: qtyVal,
          orderCount: 1,
          date: new Date().toISOString().slice(0, 10)
        });
      }

      input.value = '';
      qtyInput.value = 1;
      autoList.classList.add('hidden');
      recalculate();
    });
  }

  // Load Demo Data
  function loadDemoData() {
    state.plannedItems = [
      { sku: 'Qs-โซฟา3ที่นั่งเรียบเบาะใหญ่-cs3-ขาว-PQ002C-1', quantity: 10, date: '2026-09-05', orderCount: 10 },
      { sku: 'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-เขียว-337-14', quantity: 5, date: '2026-09-05', orderCount: 5 },
      { sku: 'Qs-โซฟา3ที่นั่งเรียบมีแขน-bs3s-ดำ-PQ002C-17', quantity: 8, date: '2026-09-05', orderCount: 8 },
      { sku: 'Qs-โซฟา3ที่นั่งเรียบมีแขน-bs3s-น้ำเงิน-337-31', quantity: 4, date: '2026-09-05', orderCount: 4 },
      { sku: 'Qs-โซฟาเบดปรับนอน-rc-ดำ-PQ002C-17', quantity: 6, date: '2026-09-05', orderCount: 6 },
      { sku: 'Qs-ตัวแอลมินิมอล-Mnn(L)-ฟ้าเทา-736b-04', quantity: 3, date: '2026-09-05', orderCount: 3 },
      { sku: 'Qs-เก้าอี้สตูล-cu-เทา-PQ002C-46', quantity: 12, date: '2026-09-05', orderCount: 12 }
    ];

    // Seed some current stock values for demo
    if (state.stockOnHandMap['ไม้ 2 นิ้ว 1 เมตร (ท่อน)']) state.stockOnHandMap['ไม้ 2 นิ้ว 1 เมตร (ท่อน)'].currentStock = 500;
    if (state.stockOnHandMap['ไม้ 2 นิ้ว 1.5 เมตร (ท่อน)']) state.stockOnHandMap['ไม้ 2 นิ้ว 1.5 เมตร (ท่อน)'].currentStock = 120;
    if (state.stockOnHandMap['ไม้อัด (แผ่น)']) state.stockOnHandMap['ไม้อัด (แผ่น)'].currentStock = 25;
    if (state.stockOnHandMap['ฟองน้ำ 2 นิ้ว ที่นั่ง (PM7)']) state.stockOnHandMap['ฟองน้ำ 2 นิ้ว ที่นั่ง (PM7)'].currentStock = 15;
    if (state.stockOnHandMap['ดำ-PQ002C-17']) state.stockOnHandMap['ดำ-PQ002C-17'].currentStock = 150;
    if (state.stockOnHandMap['ขาว-PQ002C-1']) state.stockOnHandMap['ขาว-PQ002C-1'].currentStock = 30;
    if (state.stockOnHandMap['สีเขียว-MJ337-14']) state.stockOnHandMap['สีเขียว-MJ337-14'].currentStock = 0;

    saveStockOnHand();

    $('file-status-banner').classList.remove('hidden');
    $('banner-file-name').textContent = 'ตัวอย่างข้อมูลจำลองคำสั่งผลิต (Demo Batch)';
    $('banner-file-type').textContent = 'Demo Dataset';
    $('banner-file-stats').textContent = 'คำสั่งผลิต 7 รุ่น รวมทั้งสิ้น 48 ชิ้น จำลองสถานะสต็อกครบถ้วน';
    $('banner-unmatched-wrapper').classList.add('hidden');

    recalculate();
  }

  // Recalculate everything
  function recalculate() {
    state.calculationResult = window.BomCalculator.calculateRequirements(
      state.plannedItems,
      state.masterBomData,
      state.stockOnHandMap,
      state.materialPriceMap
    );

    renderKPIs();
    renderPlanTable();
    renderMaterialsTable();
    renderStockTable();
    renderPricesTable();
  }

  // Render KPIs
  function renderKPIs() {
    const res = state.calculationResult;
    if (!res) return;

    $('kpi-total-units').textContent = window.BomCalculator.formatNum(res.totalItemsPlanned, 0);
    $('kpi-unique-skus').textContent = res.uniqueSkusCount;
    $('kpi-active-materials').textContent = res.activeMaterialsCount;
    $('kpi-shortage-count').textContent = res.shortageCount;

    // Financial KPIs
    if ($('kpi-total-mat-cost')) {
      $('kpi-total-mat-cost').textContent = window.BomCalculator.formatMoney(res.totalMaterialCost);
    }
    if ($('kpi-avg-cost-unit')) {
      const avg = res.totalItemsPlanned > 0 ? (res.totalMaterialCost / res.totalItemsPlanned) : 0;
      $('kpi-avg-cost-unit').textContent = `เฉลี่ย ${window.BomCalculator.formatMoney(avg)} ฿/ตัว`;
    }
    if ($('kpi-total-po-cost')) {
      $('kpi-total-po-cost').textContent = window.BomCalculator.formatMoney(res.totalShortageCost);
    }
    if ($('kpi-po-status-sub')) {
      if (res.totalShortageCost > 0) {
        $('kpi-po-status-sub').textContent = `⚠️ ต้องสั่งซื้อด่วน (${res.shortageCount} รายการ)`;
        $('kpi-po-status-sub').className = 'text-[11px] text-rose-600 font-bold mt-0.5 block';
      } else {
        $('kpi-po-status-sub').textContent = '✅ สต็อกเพียงพอทุกรายการ';
        $('kpi-po-status-sub').className = 'text-[11px] text-emerald-600 font-medium mt-0.5 block';
      }
    }

    $('badge-tab-plan-count').textContent = res.uniqueSkusCount;
    $('badge-tab-mat-count').textContent = res.activeMaterialsCount;

    if (res.shortageCount > 0) {
      $('badge-tab-stock-alert').textContent = `${res.shortageCount} รายการขาด`;
      $('badge-tab-stock-alert').classList.remove('hidden');
      $('kpi-shortage-sub').textContent = '⚠️ ต้องสั่งซื้อวัตถุดิบด่วน';
      $('kpi-shortage-sub').className = 'text-[11px] text-rose-600 font-semibold mt-0.5 block';
    } else {
      $('badge-tab-stock-alert').classList.add('hidden');
      $('kpi-shortage-sub').textContent = '✅ สต็อกเพียงพอทุกรายการ';
      $('kpi-shortage-sub').className = 'text-[11px] text-emerald-600 font-medium mt-0.5 block';
    }

    // Category counts for filter
    $('filter-count-all').textContent = res.activeMaterialsCount;
    $('filter-count-wood').textContent = res.categories.wood.filter(x => x.totalUsed > 0).length;
    $('filter-count-foam').textContent = res.categories.foam.filter(x => x.totalUsed > 0).length;
    $('filter-count-fabric').textContent = res.categories.fabric.filter(x => x.totalUsed > 0).length;
    $('filter-count-packaging').textContent = res.categories.packaging.filter(x => x.totalUsed > 0).length;
  }

  // Render Tab 1: Plan Table
  function renderPlanTable() {
    const tbody = $('table-plan-body');
    const tfoot = $('table-plan-tfoot');
    if (!state.plannedItems || state.plannedItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-12 text-center text-slate-400">
            <svg class="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
            ยังไม่มีข้อมูลแผนผลิต กรุณาอัปโหลดไฟล์ หรือกดปุ่ม "โหลดข้อมูลจำลองทดสอบ" ด้านบน
          </td>
        </tr>
      `;
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    const filtered = state.plannedItems.filter(item => {
      if (!state.planSearchQuery) return true;
      return item.sku.toLowerCase().includes(state.planSearchQuery);
    });

    tbody.innerHTML = filtered.map((item, idx) => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-4 text-center text-slate-400 font-mono">${idx + 1}</td>
        <td class="py-3 px-4 font-semibold text-slate-900">${item.sku}</td>
        <td class="py-3 px-4 text-center">
          <input type="number" min="1" value="${item.quantity}" data-sku="${item.sku}" class="plan-qty-input w-20 py-1 px-2 text-center text-xs font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
        </td>
        <td class="py-3 px-4 text-right text-slate-700 font-medium">${window.BomCalculator.formatMoney(item.unitCost)} ฿</td>
        <td class="py-3 px-4 text-right font-bold text-slate-900">${window.BomCalculator.formatMoney(item.totalCost)} ฿</td>
        <td class="py-3 px-4 text-slate-500 font-mono text-[11px]">${item.date || '-'}</td>
        <td class="py-3 px-4 text-center">
          <button data-sku="${item.sku}" class="btn-delete-plan-item text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors" title="ลบรายการ">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </td>
      </tr>
    `).join('');

    // Plan table footer
    if (tfoot) {
      const totalUnits = state.plannedItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
      const totalCost = state.plannedItems.reduce((acc, i) => acc + (Number(i.totalCost) || 0), 0);
      tfoot.innerHTML = `
        <tr class="bg-slate-100/80 text-slate-800">
          <td colspan="2" class="py-3 px-4 font-bold text-slate-900">รวมทั้งหมด (${state.plannedItems.length} รุ่น)</td>
          <td class="py-3 px-4 text-center font-black text-blue-700">${window.BomCalculator.formatNum(totalUnits, 0)} ตัว</td>
          <td class="py-3 px-4 text-right text-slate-500">-</td>
          <td class="py-3 px-4 text-right font-black text-blue-700 text-sm">${window.BomCalculator.formatMoney(totalCost)} ฿</td>
          <td colspan="2"></td>
        </tr>
      `;
    }

    tbody.querySelectorAll('.plan-qty-input').forEach(input => {
      input.addEventListener('change', () => {
        const targetSku = input.getAttribute('data-sku');
        const val = parseInt(input.value, 10);
        if (!isNaN(val) && val > 0) {
          const item = state.plannedItems.find(p => p.sku === targetSku);
          if (item) {
            item.quantity = val;
            recalculate();
          }
        }
      });
    });

    tbody.querySelectorAll('.btn-delete-plan-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetSku = btn.getAttribute('data-sku');
        state.plannedItems = state.plannedItems.filter(p => p.sku !== targetSku);
        recalculate();
      });
    });
  }

  // Render Tab 2: Materials Table
  function renderMaterialsTable() {
    const tbody = $('table-materials-body');
    const tfoot = $('table-materials-tfoot');
    const res = state.calculationResult;
    if (!res) return;

    let list = res.allMaterials;
    if (state.activeCategory !== 'all') {
      list = res.categories[state.activeCategory] || [];
    }

    const activeList = list.filter(m => m.totalUsed > 0);

    if (activeList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="py-12 text-center text-slate-400">
            ไม่มีการใช้วัตถุดิบในหมวดหมู่นี้ในแผนการผลิตปัจจุบัน
          </td>
        </tr>
      `;
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    const catBadge = {
      wood: '<span class="px-2 py-0.5 text-[11px] rounded bg-amber-50 text-amber-800 border border-amber-200">🪵 โครงไม้</span>',
      foam: '<span class="px-2 py-0.5 text-[11px] rounded bg-sky-50 text-sky-800 border border-sky-200">🧽 ฟองน้ำ</span>',
      fabric: '<span class="px-2 py-0.5 text-[11px] rounded bg-purple-50 text-purple-800 border border-purple-200">🧵 หนัง/ผ้า</span>',
      packaging: '<span class="px-2 py-0.5 text-[11px] rounded bg-slate-100 text-slate-700 border border-slate-200">📦 บรรจุภัณฑ์</span>',
      other: '<span class="px-2 py-0.5 text-[11px] rounded bg-slate-50 text-slate-600">🔹 อื่นๆ</span>'
    };

    tbody.innerHTML = activeList.map((m, idx) => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="py-3 px-4 text-center text-slate-400 font-mono">${idx + 1}</td>
        <td class="py-3 px-4">${catBadge[m.category] || m.category}</td>
        <td class="py-3 px-4 font-semibold text-slate-900">${m.name}</td>
        <td class="py-3 px-4 text-right font-black text-slate-900 text-sm">${window.BomCalculator.formatNum(m.totalUsed)}</td>
        <td class="py-3 px-4 text-center text-slate-500 font-medium">${m.unit}</td>
        <td class="py-3 px-4 text-right text-slate-700 font-medium">${window.BomCalculator.formatMoney(m.unitPrice)} ฿</td>
        <td class="py-3 px-4 text-right font-bold text-blue-700">${window.BomCalculator.formatMoney(m.totalCost)} ฿</td>
        <td class="py-3 px-4 text-center">
          <button data-mat="${m.name}" class="btn-show-consuming text-blue-600 hover:text-blue-800 font-medium text-xs flex items-center justify-center gap-1 mx-auto hover:underline">
            <span>${m.consumingProducts.length} รุ่น</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>
        </td>
      </tr>
    `).join('');

    // Materials table footer
    if (tfoot) {
      const catTotal = activeList.reduce((acc, m) => acc + (m.totalCost || 0), 0);
      tfoot.innerHTML = `
        <tr class="bg-slate-100 text-slate-800">
          <td colspan="6" class="py-3 px-4 font-bold text-slate-900">รวมมูลค่าวัตถุดิบที่ใช้ (${activeList.length} ชนิด)</td>
          <td class="py-3 px-4 text-right font-black text-blue-700 text-sm">${window.BomCalculator.formatMoney(catTotal)} ฿</td>
          <td></td>
        </tr>
      `;
    }

    tbody.querySelectorAll('.btn-show-consuming').forEach(btn => {
      btn.addEventListener('click', () => {
        const matName = btn.getAttribute('data-mat');
        openConsumingModal(matName);
      });
    });
  }

  // Render Tab 3: Stock Table (with Inline Unit Price Editing and PO Budget)
  function renderStockTable() {
    const tbody = $('table-stock-body');
    const tfoot = $('table-stock-tfoot');
    const res = state.calculationResult;
    if (!res) return;

    const sorted = [...res.allMaterials].sort((a, b) => {
      if (a.shortage > 0 && b.shortage <= 0) return -1;
      if (b.shortage > 0 && a.shortage <= 0) return 1;
      if (a.totalUsed > 0 && b.totalUsed <= 0) return -1;
      if (b.totalUsed > 0 && a.totalUsed <= 0) return 1;
      return 0;
    });

    tbody.innerHTML = sorted.map((m, idx) => `
      <tr class="${m.shortage > 0 ? 'bg-rose-50/50' : 'hover:bg-slate-50/80'} transition-colors">
        <td class="py-3 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
        <td class="py-3 px-3">
          <div class="font-semibold text-slate-900">${m.name}</div>
          <div class="text-[11px] text-slate-400">${m.category}</div>
        </td>
        <td class="py-3 px-3 text-right font-medium text-slate-700">${window.BomCalculator.formatNum(m.totalUsed)}</td>
        <td class="py-3 px-3 text-right">
          <input type="number" step="any" min="0" value="${m.currentStock}" data-mat="${m.name}" class="stock-input w-20 py-1 px-2 text-right text-xs font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
        </td>
        <td class="py-3 px-3 text-right font-bold ${m.remaining < 0 ? 'text-rose-600' : 'text-slate-800'}">
          ${window.BomCalculator.formatNum(m.remaining)}
        </td>
        <td class="py-3 px-3 text-center text-slate-500 font-medium">${m.unit}</td>
        <td class="py-3 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.statusBadge.class}">${m.statusBadge.text}</span>
        </td>
        <td class="py-3 px-3 text-right font-black ${m.shortage > 0 ? 'text-rose-600 text-sm' : 'text-slate-400'}">
          ${m.shortage > 0 ? window.BomCalculator.formatNum(m.shortage) : '-'}
        </td>
        <td class="py-3 px-3 text-right">
          <input type="number" step="any" min="0" value="${m.unitPrice}" data-mat="${m.name}" class="stock-price-input w-24 py-1 px-2 text-right text-xs font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white" title="คลิกเพื่อแก้ไขราคาต่อหน่วย">
        </td>
        <td class="py-3 px-3 text-right font-black ${m.shortageCost > 0 ? 'text-rose-600 text-sm' : 'text-slate-400'}">
          ${m.shortageCost > 0 ? window.BomCalculator.formatMoney(m.shortageCost) + ' ฿' : '-'}
        </td>
      </tr>
    `).join('');

    // Stock table footer (PO Total Budget)
    if (tfoot) {
      tfoot.innerHTML = `
        <tr class="bg-rose-50/70 border-t-2 border-rose-200">
          <td colspan="7" class="py-3 px-4 font-bold text-slate-800 text-xs">
            🛒 สรุปงบประมาณที่ต้องสั่งซื้อวัตถุดิบที่ขาด (PO Purchasing Budget)
          </td>
          <td class="py-3 px-3 text-right font-black text-rose-600">${res.shortageCount} รายการ</td>
          <td class="py-3 px-3 text-right text-slate-400 font-medium">งบรวม:</td>
          <td class="py-3 px-3 text-right font-black text-rose-700 text-sm">
            ${window.BomCalculator.formatMoney(res.totalShortageCost)} ฿
          </td>
        </tr>
      `;
    }

    tbody.querySelectorAll('.stock-input').forEach(input => {
      input.addEventListener('change', () => {
        const matName = input.getAttribute('data-mat');
        const val = parseFloat(input.value);
        if (!state.stockOnHandMap[matName]) {
          state.stockOnHandMap[matName] = { currentStock: 0, wastePercent: 0 };
        }
        state.stockOnHandMap[matName].currentStock = isNaN(val) ? 0 : val;
        saveStockOnHand();
        recalculate();
      });
    });

    tbody.querySelectorAll('.stock-price-input').forEach(input => {
      input.addEventListener('change', () => {
        const matName = input.getAttribute('data-mat');
        const val = parseFloat(input.value);
        state.materialPriceMap[matName] = isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100;
        saveMaterialPrices(false);
      });
    });
  }

  // Render Tab 4: Material Prices Table
  function renderPricesTable() {
    const tbody = $('table-prices-body');
    if (!tbody || !state.masterBomData) return;

    let list = state.masterBomData.materials;
    if (state.priceActiveCategory !== 'all') {
      list = list.filter(m => m.category === state.priceActiveCategory);
    }
    if (state.priceSearchQuery) {
      list = list.filter(m => m.name.toLowerCase().includes(state.priceSearchQuery));
    }

    const catBadge = {
      wood: '<span class="px-2 py-0.5 text-[11px] rounded bg-amber-50 text-amber-800 border border-amber-200">🪵 โครงไม้</span>',
      foam: '<span class="px-2 py-0.5 text-[11px] rounded bg-sky-50 text-sky-800 border border-sky-200">🧽 ฟองน้ำ</span>',
      fabric: '<span class="px-2 py-0.5 text-[11px] rounded bg-purple-50 text-purple-800 border border-purple-200">🧵 หนัง/ผ้า</span>',
      packaging: '<span class="px-2 py-0.5 text-[11px] rounded bg-slate-100 text-slate-700 border border-slate-200">📦 บรรจุภัณฑ์</span>',
      other: '<span class="px-2 py-0.5 text-[11px] rounded bg-slate-50 text-slate-600">🔹 อื่นๆ</span>'
    };

    // Update counts on filter buttons
    const allMats = state.masterBomData.materials;
    if ($('price-filter-count-all')) $('price-filter-count-all').textContent = allMats.length;
    if ($('price-filter-count-wood')) $('price-filter-count-wood').textContent = allMats.filter(m => m.category === 'wood').length;
    if ($('price-filter-count-foam')) $('price-filter-count-foam').textContent = allMats.filter(m => m.category === 'foam').length;
    if ($('price-filter-count-fabric')) $('price-filter-count-fabric').textContent = allMats.filter(m => m.category === 'fabric').length;
    if ($('price-filter-count-packaging')) $('price-filter-count-packaging').textContent = allMats.filter(m => m.category === 'packaging').length;

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="py-12 text-center text-slate-400">
            ไม่พบวัตถุดิบที่ค้นหา
          </td>
        </tr>
      `;
      return;
    }

    // Check usage in current calculation
    const usedMap = new Map();
    if (state.calculationResult && state.calculationResult.allMaterials) {
      state.calculationResult.allMaterials.forEach(m => {
        if (m.totalUsed > 0) usedMap.set(m.name, m);
      });
    }

    tbody.innerHTML = list.map((m, idx) => {
      const currentPrice = state.materialPriceMap[m.name] !== undefined ? state.materialPriceMap[m.name] : 0;
      const usedItem = usedMap.get(m.name);
      const usageHtml = usedItem
        ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">ใช้ ${window.BomCalculator.formatNum(usedItem.totalUsed)} ${m.unit} (${window.BomCalculator.formatMoney(usedItem.totalCost)} ฿)</span>`
        : `<span class="text-slate-400 text-[11px]">ไม่ได้ใช้ในรอบนี้</span>`;

      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          <td class="py-3 px-4 text-center text-slate-400 font-mono">${idx + 1}</td>
          <td class="py-3 px-4">${catBadge[m.category] || m.category}</td>
          <td class="py-3 px-4 font-semibold text-slate-900">${m.name}</td>
          <td class="py-3 px-4 text-center text-slate-500 font-medium">${m.unit}</td>
          <td class="py-3 px-4 text-right">
            <div class="inline-flex items-center gap-1.5 justify-end">
              <input type="number" step="any" min="0" value="${currentPrice}" data-mat="${m.name}" class="price-tab-input w-28 py-1.5 px-2.5 text-right text-xs font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white">
              <span class="text-xs text-slate-400 font-medium">฿</span>
            </div>
          </td>
          <td class="py-3 px-4 text-center">${usageHtml}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.price-tab-input').forEach(input => {
      input.addEventListener('change', () => {
        const matName = input.getAttribute('data-mat');
        const val = parseFloat(input.value);
        state.materialPriceMap[matName] = isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100;
        saveMaterialPrices(true);
      });
    });
  }

  // Render Tab 4: Catalog with Edit Buttons
  function renderCatalog() {
    const tbody = $('table-catalog-body');
    const q = state.catalogSearchQuery;

    const filtered = state.masterBomData.skus.filter(s => {
      if (!q) return true;
      return s.sku.toLowerCase().includes(q);
    }).slice(0, 100);

    tbody.innerHTML = filtered.map((s, idx) => {
      const matEntries = Object.entries(s.materials);
      const badges = matEntries.map(([mName, val]) => `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
          <span>${mName}:</span>
          <strong class="font-bold text-blue-700">${val}</strong>
        </span>
      `).join(' ');

      return `
        <tr class="hover:bg-slate-50/80 transition-colors">
          <td class="py-2.5 px-4 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
          <td class="py-2.5 px-4 font-semibold text-slate-900 text-xs">${s.sku}</td>
          <td class="py-2.5 px-4">
            <div class="flex flex-wrap gap-1.5">${badges || '<span class="text-slate-400 italic text-xs">ยังไม่ได้ระบุสูตร</span>'}</div>
          </td>
          <td class="py-2.5 px-4 text-center whitespace-nowrap">
            <button data-sku="${s.sku}" class="btn-edit-recipe px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors mr-1">
              ✏️ แก้ไข
            </button>
            <button data-sku="${s.sku}" class="btn-delete-recipe p-1 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors" title="ลบรุ่นนี้ออกจากคลัง">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach edit and delete handlers
    tbody.querySelectorAll('.btn-edit-recipe').forEach(btn => {
      btn.addEventListener('click', () => {
        const sku = btn.getAttribute('data-sku');
        openEditBomModal(sku, false);
      });
    });

    tbody.querySelectorAll('.btn-delete-recipe').forEach(btn => {
      btn.addEventListener('click', () => {
        const sku = btn.getAttribute('data-sku');
        if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรุ่น "${sku}" ออกจากฐานข้อมูล BOM?`)) {
          state.masterBomData.skus = state.masterBomData.skus.filter(s => s.sku !== sku);
          saveMasterBom(true);
          showToast(`ลบรุ่น "${sku}" ออกจากคลังแล้ว`);
        }
      });
    });
  }

  // Open Edit/Add BOM Modal
  function openEditBomModal(skuName, isNew = false) {
    editingBom.isNew = isNew;
    editingBom.originalSku = skuName;
    editingBom.sku = skuName;
    editingBom.materials = {};

    if (!isNew && skuName) {
      const existing = state.masterBomData.skus.find(s => s.sku === skuName);
      if (existing && existing.materials) {
        editingBom.materials = JSON.parse(JSON.stringify(existing.materials));
      }
    }

    $('modal-edit-bom-title').textContent = isNew ? '➕ เพิ่มรุ่นสินค้าใหม่ลงในคลังสูตร' : `✏️ แก้ไขสูตร: ${skuName}`;
    $('modal-edit-sku-name').value = skuName;
    $('modal-edit-sku-name').disabled = !isNew; // Only allow editing name if creating new

    renderModalIngredientsTable();
    $('modal-edit-bom').classList.remove('hidden');
  }

  // Render Ingredients Table inside Edit Modal
  function renderModalIngredientsTable() {
    const tbody = $('modal-edit-mat-tbody');
    const matNames = Object.keys(editingBom.materials);
    $('modal-edit-mat-count').textContent = matNames.length;

    if (matNames.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="py-6 text-center text-slate-400">
            ยังไม่มีรายการวัสดุในสูตรนี้ (เลือกเพิ่มวัสดุจากเมนูด้านบน)
          </td>
        </tr>
      `;
      return;
    }

    // Material unit lookup
    const unitMap = {};
    state.masterBomData.materials.forEach(m => unitMap[m.name] = m.unit);

    tbody.innerHTML = matNames.map(mName => `
      <tr class="hover:bg-slate-50">
        <td class="py-2.5 px-3 font-semibold text-slate-800">${mName}</td>
        <td class="py-2.5 px-3 text-center">
          <input type="number" step="any" min="0" value="${editingBom.materials[mName]}" data-mat="${mName}" class="modal-mat-qty-input w-28 py-1 px-2 text-center text-xs font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none">
        </td>
        <td class="py-2.5 px-3 text-center text-slate-500">${unitMap[mName] || 'หน่วย'}</td>
        <td class="py-2.5 px-3 text-center">
          <button data-mat="${mName}" class="btn-modal-remove-mat text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50">✕</button>
        </td>
      </tr>
    `).join('');

    // Attach row listeners
    tbody.querySelectorAll('.modal-mat-qty-input').forEach(input => {
      input.addEventListener('change', () => {
        const mat = input.getAttribute('data-mat');
        const val = parseFloat(input.value);
        if (!isNaN(val) && val >= 0) {
          editingBom.materials[mat] = val;
        }
      });
    });

    tbody.querySelectorAll('.btn-modal-remove-mat').forEach(btn => {
      btn.addEventListener('click', () => {
        const mat = btn.getAttribute('data-mat');
        delete editingBom.materials[mat];
        renderModalIngredientsTable();
      });
    });
  }

  // Handle Add Material Button in Modal
  function handleModalAddMaterial() {
    const select = $('modal-edit-add-mat-select');
    const qtyInput = $('modal-edit-add-mat-qty');
    const matName = select.value;
    const qty = parseFloat(qtyInput.value);

    if (!matName) return;
    if (isNaN(qty) || qty <= 0) {
      alert('กรุณาระบุปริมาณการใช้ที่มากกว่า 0');
      return;
    }

    editingBom.materials[matName] = qty;
    qtyInput.value = '';
    renderModalIngredientsTable();
  }

  // Handle Save BOM in Modal
  function handleModalSaveBom() {
    const skuName = $('modal-edit-sku-name').value.trim();
    if (!skuName) {
      alert('กรุณาระบุชื่อรุ่นสินค้า (Master SKU)');
      return;
    }

    // Clean up 0 values
    const cleanMaterials = {};
    Object.keys(editingBom.materials).forEach(m => {
      const val = parseFloat(editingBom.materials[m]);
      if (!isNaN(val) && val > 0) {
        cleanMaterials[m] = Math.round(val * 10000) / 10000;
      }
    });

    if (editingBom.isNew) {
      // Check if duplicate
      const exists = state.masterBomData.skus.some(s => s.sku.toLowerCase() === skuName.toLowerCase());
      if (exists) {
        alert(`มีรุ่น "${skuName}" อยู่ในคลังแล้ว กรุณาใช้ชื่ออื่นหรือกดแก้ไขที่แถวของรุ่นเดิม`);
        return;
      }

      state.masterBomData.skus.unshift({
        sku: skuName,
        materials: cleanMaterials
      });
    } else {
      // Update existing
      const existing = state.masterBomData.skus.find(s => s.sku === editingBom.originalSku);
      if (existing) {
        existing.materials = cleanMaterials;
      }
    }

    saveMasterBom(true);
    closeEditBomModal();
  }

  function closeEditBomModal() {
    $('modal-edit-bom').classList.add('hidden');
  }

  // Open/Close Consuming Modal
  function openConsumingModal(matName) {
    const res = state.calculationResult;
    if (!res) return;

    const mat = res.allMaterials.find(m => m.name === matName);
    if (!mat) return;

    $('modal-mat-title').textContent = mat.name;
    $('modal-mat-sub').textContent = `รวมการใช้ทั้งสิ้น: ${window.BomCalculator.formatNum(mat.totalUsed)} ${mat.unit} (${mat.consumingProducts.length} รุ่นสินค้า)`;

    const tbody = $('modal-mat-table-body');
    tbody.innerHTML = mat.consumingProducts.map(p => `
      <tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-semibold text-slate-800">${p.sku}</td>
        <td class="py-2 px-3 text-center font-medium">${p.quantity}</td>
        <td class="py-2 px-3 text-right text-slate-600">${p.perUnit}</td>
        <td class="py-2 px-3 text-right font-bold text-blue-600">${window.BomCalculator.formatNum(p.subTotal)}</td>
      </tr>
    `).join('');

    $('modal-consuming').classList.remove('hidden');
  }

  function closeConsumingModal() {
    $('modal-consuming').classList.add('hidden');
  }

  function showUnmatchedModal(unmatched) {
    alert(`มีรายการคำสั่งซื้อที่ไม่สามารถจับคู่กับ Master SKU ได้ ${unmatched.length} รายการ:\n\n` +
      unmatched.slice(0, 10).map((u, i) => `${i + 1}. แถว ${u.rowNumber}: ${u.productName || u.rawSku || 'ไม่ระบุชื่อ'} (${u.variation})`).join('\n') +
      (unmatched.length > 10 ? `\n... และอีก ${unmatched.length - 10} รายการ` : '')
    );
  }

  // ==========================================
  // Toast Notification
  // ==========================================

  // Toast Notification
  function showToast(message, icon = '💾') {
    const toast = $('toast');
    if (!toast) return;

    $('toast-icon').textContent = icon;
    $('toast-message').textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  // Export state to window for testability
  window.App = {
    state,
    saveMasterBom,
    openEditBomModal,
    recalculate
  };

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
