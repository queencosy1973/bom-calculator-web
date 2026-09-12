/**
 * SKU Mapper Engine for BOM & Production Planner
 * Matches e-commerce order items (TikTok / Shopee) or template inputs to 1,064 Master SKUs
 */

(function (window) {
  'use strict';

  // Fast SKU Lookup Set & Map
  let skuLookupMap = new Map();
  let skuList = [];

  function initSkuIndex(masterBomData) {
    if (!masterBomData || !masterBomData.skus) return;
    skuLookupMap.clear();
    skuList = masterBomData.skus.map(s => s.sku);

    masterBomData.skus.forEach(item => {
      const clean = item.sku.trim().toLowerCase();
      skuLookupMap.set(clean, item.sku);
    });
  }

  // Helper: clean text
  function cleanStr(val) {
    return String(val || '').trim();
  }

  // Model & Fabric Code extraction matching Google Sheet MapSKU tab
  function extractModelAndCode(productName, variation) {
    const p = cleanStr(productName);
    const v = cleanStr(variation);
    const combined = (p + ' ' + v).toLowerCase();
    const vClean = v.replace(/\s+/g, '');

    // 1. Model extraction
    let rawModel = '';
    if (/หมอน/.test(p)) {
      rawModel = 'หมอน';
    } else {
      const mMatch = combined.match(/modino|ln3|rcw|rcl|rcs|rhs|rsii|rs|rc|cs[0-9]+|box[0-9]+|bs3s|bs[0-9]+|st[0-9]+|cl|md|pl|b[0-9]+/i);
      if (mMatch) rawModel = mMatch[0].toLowerCase();
    }

    let model = rawModel;
    if (rawModel === 'modino') model = 'md';
    if (rawModel === 'pl') model = 'หมอน';

    // 2. Color extraction
    const colorMatch = vClean.match(/แดงมะเหมี่ยว|น้ำตาลอ่อน|น้ำตาลทอง|น้ำตาลเข้ม|ฟ้าเทา|ฟ้าเข้ม|เทาอ่อน|เทาเข้ม|โรสโกลด์|ครีมทอง|มอคค่า|น้ำตาล|เขียว|แดง|น้ำเงิน|ครีม|ขาว|เทา|ดำ|ดํา|ชา/);
    let color = colorMatch ? colorMatch[0] : '';
    if (color === 'ดํา') color = 'ดำ';

    // 3. Fabric Code extraction
    let code = '';
    const isHolland = combined.includes('ฮอลแลนด์') || combined.includes('mj337') || combined.includes('337');
    const isPoly = combined.includes('โพลี') || combined.includes('mj350') || combined.includes('350');
    const isCorduroy = combined.includes('ลูกฟูก') || combined.includes('mj356') || combined.includes('356');
    const is736b = /736b/i.test(combined);

    if (isHolland) {
      if (color === 'น้ำตาล') code = '337-7';
      else if (color === 'เขียว') code = '337-14';
      else if (color === 'แดงมะเหมี่ยว' || color === 'แดง') code = '337-23';
      else if (color === 'เทา') code = '337-29';
      else if (color === 'น้ำเงิน') code = '337-31';
      else if (color === 'โรสโกลด์') code = '337-22';
    } else if (isPoly) {
      if (color === 'น้ำตาล') code = '350-13';
      else if (color === 'เขียว') code = '350-6';
      else if (color === 'ฟ้าเข้ม') code = '350-9';
      else if (color === 'ครีมทอง') code = '350-4';
      else if (color === 'เทาอ่อน') code = '350-18';
      else if (color === 'เทาเข้ม') code = '350-20';
      else if (color === 'ครีม') code = '350-1';
      else if (color === 'น้ำตาลอ่อน') code = '350-11';
      else if (color === 'น้ำตาลเข้ม') code = '350-14';
    } else if (isCorduroy) {
      if (color === 'ครีม') code = '356-1a';
      else if (color === 'เขียว') code = '356-2a';
      else if (color === 'เทา') code = '356-3a';
      else if (color === 'น้ำตาล') code = '356-4a';
    } else if (is736b) {
      if (color === 'น้ำตาลทอง') code = '736b-01';
      else if (color === 'ฟ้าเทา') code = '736b-04';
      else if (color === 'เทาเข้ม') code = '736b-02';
    } else {
      // Default PVC Leather (PQ002C)
      if (color === 'ดำ') code = 'PQ002C-17';
      else if (color === 'ขาว') code = 'PQ002C-1';
      else if (color === 'เทา') code = 'PQ002C-46';
      else if (color === 'น้ำตาล') code = 'PQ002C-12';
      else if (color === 'ชา') code = 'PQ002C-19';
      else if (color === 'ครีม') code = 'PQ002C-6';
      else if (color === 'มอคค่า') code = 'PQ002C-48';
    }

    return { model, color, code };
  }

  // Match an individual item to Master SKU
  function mapToMasterSku(rawSku, productName, variation) {
    const sRaw = cleanStr(rawSku);
    const sName = cleanStr(productName);
    const sVar = cleanStr(variation);

    // 1. Direct match on rawSku
    if (sRaw) {
      const lowerRaw = sRaw.toLowerCase();
      if (skuLookupMap.has(lowerRaw)) {
        return { matchedSku: skuLookupMap.get(lowerRaw), matchType: 'EXACT_RAW_SKU' };
      }
      // Substring match
      for (const masterSku of skuList) {
        if (masterSku.toLowerCase() === lowerRaw || masterSku.toLowerCase().includes(lowerRaw) || lowerRaw.includes(masterSku.toLowerCase())) {
          return { matchedSku: masterSku, matchType: 'FUZZY_RAW_SKU' };
        }
      }
    }

    // 2. Extraction using MapSKU rules
    const { model, color, code } = extractModelAndCode(sName, sVar);
    if (model && code) {
      const codeRegex = new RegExp(`${code}($|-)`, 'i');
      const modelRegex = new RegExp(model, 'i');

      for (const masterSku of skuList) {
        if (modelRegex.test(masterSku) && codeRegex.test(masterSku)) {
          return {
            matchedSku: masterSku,
            matchType: 'RULE_EXTRACTED',
            extractedModel: model,
            extractedColor: color,
            extractedCode: code
          };
        }
      }
    }

    return null;
  }

  // Helper to find column in row
  function findColVal(row, possibleHeaders) {
    for (const h of possibleHeaders) {
      if (row[h] !== undefined && row[h] !== null && String(row[h]).trim() !== '') {
        return String(row[h]).trim();
      }
      // Check lowercase / trimmed key
      for (const k of Object.keys(row)) {
        if (k.trim().toLowerCase() === h.trim().toLowerCase()) {
          return String(row[k]).trim();
        }
      }
    }
    return '';
  }

  // Detect file type and parse rows
  function parseProductionOrOrderRows(dataRows) {
    if (!dataRows || dataRows.length === 0) {
      return { success: false, error: 'ไม่พบข้อมูลในไฟล์' };
    }

    const firstRow = dataRows[0];
    const keys = Object.keys(firstRow).map(k => k.trim().toLowerCase());

    const isOrderAll = keys.some(k => k.includes('order') || k.includes('คำสั่งซื้อ') || k.includes('seller sku'));
    const isTemplate = keys.some(k => k.includes('ชื่อรุ่น') || k.includes('sku') || k.includes('จำนวนที่ผลิต') || k.includes('จำนวน'));

    const itemsMap = new Map(); // key = SKU -> { sku, quantity, dates: Set, orderCount }
    const unmatched = [];
    let totalInputRows = 0;
    let cancelledCount = 0;

    dataRows.forEach((row, idx) => {
      // Check status if ecommerce order
      const status = findColVal(row, ['Order Status', 'สถานะคำสั่งซื้อ', 'สถานะ']);
      if (/ยกเลิก|cancel/i.test(status)) {
        cancelledCount++;
        return; // Ignore cancelled
      }

      const rawSku = findColVal(row, ['ชื่อรุ่น (SKU)', 'ชื่อรุ่น', 'SKU', 'Seller SKU', 'รหัสสินค้า', 'SKU จาก stock']);
      const pName = findColVal(row, ['Product Name', 'ชื่อสินค้า', 'สินค้า']);
      const pVar = findColVal(row, ['Variation', 'ตัวเลือกสินค้า', 'ตัวเลือก', 'สี']);
      const dateVal = findColVal(row, ['วันที่', 'Date', 'Created Time', 'เวลาสร้าง']);
      const orderId = findColVal(row, ['Order ID', 'หมายเลขคำสั่งซื้อ', 'Order Number', 'เลขที่คำสั่งซื้อ', 'Order No.']);
      const trackingId = findColVal(row, ['Tracking ID', 'หมายเลขติดตามพัสดุ', 'เลขพัสดุ', 'Tracking Number', 'Tracking No']);

      let qtyStr = findColVal(row, ['จำนวนที่ผลิต', 'จำนวน', 'Quantity', 'Qty']);
      let qty = parseInt(qtyStr, 10);
      if (isNaN(qty) || qty <= 0) qty = 1;

      totalInputRows++;

      const matchRes = mapToMasterSku(rawSku, pName, pVar);
      if (matchRes && matchRes.matchedSku) {
        const skuKey = matchRes.matchedSku;
        if (!itemsMap.has(skuKey)) {
          itemsMap.set(skuKey, {
            sku: skuKey,
            quantity: 0,
            dates: new Set(),
            orderCount: 0,
            originalInputs: [],
            detailedOrders: []
          });
        }
        const cur = itemsMap.get(skuKey);
        cur.quantity += qty;
        cur.orderCount += 1;
        if (dateVal) cur.dates.add(dateVal);
        cur.detailedOrders.push({
          sku: skuKey,
          rawSku,
          productName: pName,
          variation: pVar,
          qty,
          orderId: orderId || '',
          trackingId: trackingId || '',
          date: dateVal || ''
        });
        if (cur.originalInputs.length < 5) {
          cur.originalInputs.push({ rawSku, pName, pVar, qty, orderId, trackingId });
        }
      } else {
        unmatched.push({
          rowNumber: idx + 2,
          rawSku,
          productName: pName,
          variation: pVar,
          quantity: qty,
          orderId: orderId || '',
          trackingId: trackingId || ''
        });
      }
    });

    const plannedItems = Array.from(itemsMap.values()).map(item => ({
      sku: item.sku,
      quantity: item.quantity,
      orderCount: item.orderCount,
      date: Array.from(item.dates).join(', ') || '-',
      detailedOrders: item.detailedOrders || []
    }));

    return {
      success: true,
      fileType: isOrderAll ? 'E-Commerce Order All' : 'Production Plan Template',
      totalInputRows,
      cancelledCount,
      plannedItems,
      totalUnits: plannedItems.reduce((sum, x) => sum + x.quantity, 0),
      matchedSkusCount: plannedItems.length,
      unmatchedCount: unmatched.length,
      unmatched
    };
  }

  window.SkuMapper = {
    initSkuIndex,
    extractModelAndCode,
    mapToMasterSku,
    parseProductionOrOrderRows
  };

})(window);
