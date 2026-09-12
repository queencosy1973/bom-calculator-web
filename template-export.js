/**
 * Template Generator and Excel Exporter for BOM Planner
 */

(function (window) {
  'use strict';

  // 1. Generate & Download Production Plan Template
  function downloadProductionTemplate(masterBomData) {
    if (typeof XLSX === 'undefined') {
      alert('ไลบรารี XLSX ยังโหลดไม่เสร็จ กรุณารอสักครู่');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Template Data
    const templateData = [
      ['วันที่', 'ชื่อรุ่น (SKU)', 'จำนวนที่ผลิต', 'หมายเหตุ'],
      ['2026-09-05', 'Qs-โซฟา3ที่นั่งเรียบเบาะใหญ่-cs3-ขาว-PQ002C-1', 5, 'ตัวอย่าง'],
      ['2026-09-05', 'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-เขียว-337-14', 3, 'ตัวอย่าง'],
      ['2026-09-05', 'Qs-โซฟาเบดปรับนอน-rc-ดำ-PQ002C-17', 2, 'ตัวอย่าง'],
      ['2026-09-05', 'Qs-ตัวแอลมินิมอล-Mnn(L)-ฟ้าเทา-736b-04', 1, 'ตัวอย่าง'],
      ['', '', '', '']
    ];

    const wsTemplate = XLSX.utils.aoa_to_sheet(templateData);
    wsTemplate['!cols'] = [
      { wch: 15 },
      { wch: 48 },
      { wch: 15 },
      { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'แผนการผลิต');

    // Sheet 2: Reference SKUs (1,064 items)
    if (masterBomData && masterBomData.skus) {
      const refData = [['ลำดับ', 'ชื่อรุ่นมาตรฐาน (Master SKU)']];
      masterBomData.skus.forEach((s, idx) => {
        refData.push([idx + 1, s.sku]);
      });
      const wsRef = XLSX.utils.aoa_to_sheet(refData);
      wsRef['!cols'] = [{ wch: 8 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsRef, 'รายชื่อรุ่นอ้างอิง');
    }

    // Write file
    XLSX.writeFile(wb, 'แบบฟอร์มแผนการผลิต_BOM_Template.xlsx');
  }

  // 2. Export Material Picking List (ใบเบิกวัตถุดิบฝ่ายผลิต)
  function exportPickingList(calcResult) {
    if (!calcResult || typeof XLSX === 'undefined') return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary by Material
    const summaryData = [
      ['ลำดับ', 'หมวดหมู่วัสดุ', 'รายการวัสดุ', 'จำนวนที่ต้องใช้', 'หน่วย', 'ราคาต่อหน่วย (บาท)', 'มูลค่าต้นทุนรวม (บาท)', 'สถานะการเบิก']
    ];

    const categoryNames = {
      wood: '🪵 โครงสร้างไม้',
      foam: '🧽 ฟองน้ำ',
      fabric: '🧵 หนังและผ้า',
      packaging: '📦 บรรจุภัณฑ์',
      other: '🔹 อื่นๆ'
    };

    let rowIdx = 1;
    let grandMaterialCost = 0;
    calcResult.allMaterials
      .filter(m => m.totalUsed > 0)
      .forEach(m => {
        grandMaterialCost += (m.totalCost || 0);
        summaryData.push([
          rowIdx++,
          categoryNames[m.category] || m.category,
          m.name,
          m.totalUsed,
          m.unit,
          m.unitPrice || 0,
          m.totalCost || 0,
          'รอดำเนินการเบิก'
        ]);
      });

    summaryData.push([
      'รวมทั้งสิ้น',
      '',
      '',
      '',
      '',
      '',
      Math.round(grandMaterialCost * 100) / 100,
      ''
    ]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 38 },
      { wch: 18 },
      { wch: 10 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปเบิกวัสดุรวม');

    // Sheet 2: Detailed by Product
    const detailData = [
      ['ลำดับ', 'ชื่อรุ่นสินค้า (SKU)', 'จำนวนผลิต (ตัว)', 'รายการวัสดุที่ใช้', 'ใช้ต่อตัว', 'รวมใช้วัสดุนี้', 'หน่วย']
    ];

    let dIdx = 1;
    calcResult.allMaterials.forEach(m => {
      if (m.consumingProducts && m.consumingProducts.length > 0) {
        m.consumingProducts.forEach(p => {
          detailData.push([
            dIdx++,
            p.sku,
            p.quantity,
            m.name,
            p.perUnit,
            p.subTotal,
            m.unit
          ]);
        });
      }
    });

    const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
    wsDetail['!cols'] = [
      { wch: 8 },
      { wch: 45 },
      { wch: 16 },
      { wch: 35 },
      { wch: 12 },
      { wch: 16 },
      { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'รายละเอียดตามรุ่น');

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ใบเบิกวัตถุดิบ_Picking_List_${todayStr}.xlsx`);
  }

  // 3. Export Purchase Order (ใบสั่งซื้อวัตถุดิบที่ขาด พร้อมคำนวณงบประมาณ)
  function exportPurchaseOrder(calcResult) {
    if (!calcResult || typeof XLSX === 'undefined') return;

    const wb = XLSX.utils.book_new();

    const poData = [
      ['ลำดับ', 'หมวดหมู่', 'รายการวัสดุ', 'หน่วย', 'ความต้องการใช้', 'สต็อกปัจจุบัน', 'คงเหลือ/ขาด', 'จำนวนที่ต้องสั่งซื้อเพิ่ม (PO Qty)', 'ราคาต่อหน่วย (บาท)', 'งบประมาณสั่งซื้อ (บาท)', 'หมายเหตุ']
    ];

    const categoryNames = {
      wood: '🪵 โครงสร้างไม้',
      foam: '🧽 ฟองน้ำ',
      fabric: '🧵 หนังและผ้า',
      packaging: '📦 บรรจุภัณฑ์',
      other: '🔹 อื่นๆ'
    };

    let idx = 1;
    let grandPoCost = 0;
    calcResult.allMaterials
      .filter(m => m.shortage > 0 || m.totalUsed > 0)
      .forEach(m => {
        const cost = m.shortageCost || 0;
        grandPoCost += cost;
        poData.push([
          idx++,
          categoryNames[m.category] || m.category,
          m.name,
          m.unit,
          m.netDemand,
          m.currentStock,
          m.remaining,
          m.shortage > 0 ? m.shortage : 0,
          m.unitPrice || 0,
          cost > 0 ? cost : 0,
          m.shortage > 0 ? '⚠️ วัตถุดิบขาดสต็อก ต้องสั่งด่วน' : '✅ สต็อกเพียงพอ'
        ]);
      });

    // Grand total row
    poData.push([
      'รวมทั้งสิ้น',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      Math.round(grandPoCost * 100) / 100,
      'งบประมาณสั่งซื้อ PO รวม'
    ]);

    const wsPO = XLSX.utils.aoa_to_sheet(poData);
    wsPO['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 38 },
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 25 },
      { wch: 18 },
      { wch: 22 },
      { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, wsPO, 'ใบสั่งซื้อวัตถุดิบ_PO');

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ใบสั่งซื้อวัตถุดิบ_PO_${todayStr}.xlsx`);
  }

  // 4. Export Master BOM Catalog as Excel
  function exportMasterBomExcel(masterBomData) {
    if (!masterBomData || !masterBomData.skus || typeof XLSX === 'undefined') return;

    const wb = XLSX.utils.book_new();

    // Headers: SKU + 43 Materials
    const headers = ['รุ่น (SKU)', ...masterBomData.materials.map(m => m.name)];
    const data = [headers];

    masterBomData.skus.forEach(s => {
      const row = [s.sku];
      masterBomData.materials.forEach(m => {
        const val = s.materials && s.materials[m.name] !== undefined ? s.materials[m.name] : '';
        row.push(val);
      });
      data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 45 }, ...masterBomData.materials.map(() => ({ wch: 16 }))];
    XLSX.utils.book_append_sheet(wb, ws, 'Master_BOM');

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `QueenCosy_Master_BOM_${todayStr}.xlsx`);
  }

  // 5. Parse imported Master BOM Excel file
  function parseMasterBomExcel(dataRows, existingMaterials) {
    if (!dataRows || dataRows.length === 0) {
      return { success: false, error: 'ไม่พบข้อมูลในไฟล์' };
    }

    const firstRow = dataRows[0];
    const keys = Object.keys(firstRow);
    const skuKey = keys.find(k => k.toLowerCase().includes('sku') || k.toLowerCase().includes('รุ่น'));
    if (!skuKey) {
      return { success: false, error: 'ไม่พบคอลัมน์ รุ่น (SKU) ในไฟล์' };
    }

    // Material columns are all keys except skuKey
    const matKeys = keys.filter(k => k !== skuKey && !k.startsWith('__EMPTY'));

    const updatedSkus = [];

    dataRows.forEach(row => {
      const skuName = String(row[skuKey] || '').trim();
      if (!skuName) return;

      const materials = {};
      matKeys.forEach(mk => {
        const val = parseFloat(row[mk]);
        if (!isNaN(val) && val > 0) {
          materials[mk.trim()] = Math.round(val * 10000) / 10000;
        }
      });

      updatedSkus.push({
        sku: skuName,
        materials
      });
    });

    return {
      success: true,
      skus: updatedSkus,
      count: updatedSkus.length
    };
  }

  // 6. Export Material Prices as Excel
  function exportMaterialPricesExcel(masterBomData, materialPriceMap) {
    if (!masterBomData || !masterBomData.materials || typeof XLSX === 'undefined') return;

    const wb = XLSX.utils.book_new();

    const categoryNames = {
      wood: 'โครงสร้างไม้',
      foam: 'ฟองน้ำ',
      fabric: 'หนังและผ้า',
      packaging: 'บรรจุภัณฑ์',
      other: 'อื่นๆ'
    };

    const data = [
      ['ลำดับ', 'หมวดหมู่', 'รายการวัสดุ', 'หน่วย', 'ราคาต้นทุนต่อหน่วย (บาท)']
    ];

    masterBomData.materials.forEach((m, idx) => {
      const price = materialPriceMap && materialPriceMap[m.name] !== undefined ? materialPriceMap[m.name] : 0;
      data.push([
        idx + 1,
        categoryNames[m.category] || m.category,
        m.name,
        m.unit,
        price
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 8 },
      { wch: 18 },
      { wch: 40 },
      { wch: 12 },
      { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'ราคาต้นทุนวัสดุ');

    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ตารางราคาต้นทุนวัตถุดิบ_BOM_Prices_${todayStr}.xlsx`);
  }

  // 7. Parse Imported Material Prices Excel
  function parseMaterialPricesExcel(dataRows) {
    if (!dataRows || dataRows.length === 0) {
      return { success: false, error: 'ไม่พบข้อมูลในไฟล์ Excel' };
    }

    const firstRow = dataRows[0];
    const keys = Object.keys(firstRow);

    const nameKey = keys.find(k => {
      const lk = k.toLowerCase();
      return lk.includes('รายการวัสดุ') || lk.includes('ชื่อวัสดุ') || lk.includes('วัสดุ') || lk.includes('name') || lk.includes('material');
    });

    const priceKey = keys.find(k => {
      const lk = k.toLowerCase();
      return lk.includes('ราคา') || lk.includes('price') || lk.includes('cost') || lk.includes('ต้นทุน');
    });

    if (!nameKey || !priceKey) {
      return { success: false, error: 'รูปแบบไฟล์ไม่ถูกต้อง ต้องมีคอลัมน์ "รายการวัสดุ" และ "ราคาต้นทุนต่อหน่วย (บาท)"' };
    }

    const prices = {};
    let count = 0;

    dataRows.forEach(row => {
      const matName = String(row[nameKey] || '').trim();
      if (!matName) return;

      const priceVal = parseFloat(row[priceKey]);
      if (!isNaN(priceVal) && priceVal >= 0) {
        prices[matName] = Math.round(priceVal * 100) / 100;
        count++;
      }
    });

    if (count === 0) {
      return { success: false, error: 'ไม่พบข้อมูลราคาที่ถูกต้องในไฟล์' };
    }

  // 4. Export Full Procurement & BOM Calculation Excel
  function exportFullCalculationExcel(calcResult, plannedItems, priceMap) {
    if (!calcResult || typeof XLSX === 'undefined') {
      alert('ยังไม่มีข้อมูลการคำนวณ หรือไลบรารี XLSX ยังไม่พร้อม');
      return;
    }

    const wb = XLSX.utils.book_new();
    const todayStr = new Date().toISOString().slice(0, 10);
    const categoryNames = {
      wood: '🪵 โครงสร้างไม้',
      foam: '🧽 ฟองน้ำ',
      fabric: '🧵 หนังและผ้า',
      packaging: '📦 บรรจุภัณฑ์',
      other: '🔹 อื่นๆ'
    };

    // Sheet 1: สรุปการสั่งซื้อวัตถุดิบ (PO Purchase List)
    const poData = [
      ['ลำดับ', 'หมวดหมู่วัสดุ', 'รายการวัตถุดิบ', 'หน่วย', 'ยอดที่ต้องใช้สุทธิ', 'สต็อกปัจจุบัน', 'คงเหลือ/ขาด', 'จำนวนที่ต้องสั่งซื้อ (PO Qty)', 'ราคาต่อหน่วย (บาท)', 'งบประมาณสั่งซื้อ (บาท)', 'สถานะ']
    ];

    let idx = 1;
    let grandPoCost = 0;
    (calcResult.allMaterials || [])
      .filter(m => m.shortage > 0 || m.totalUsed > 0)
      .forEach(m => {
        const cost = m.shortageCost || 0;
        grandPoCost += cost;
        poData.push([
          idx++,
          categoryNames[m.category] || m.category,
          m.name,
          m.unit,
          m.netDemand || m.totalUsed,
          m.currentStock || 0,
          m.remaining || 0,
          m.shortage > 0 ? m.shortage : 0,
          m.unitPrice || 0,
          cost > 0 ? cost : 0,
          m.shortage > 0 ? '⚠️ วัตถุดิบขาดสต็อก ต้องสั่งเพิ่ม' : '✅ สต็อกเพียงพอ'
        ]);
      });

    poData.push([
      'รวมงบประมาณสั่งซื้อทั้งสิ้น', '', '', '', '', '', '', '', '',
      Math.round(grandPoCost * 100) / 100, ''
    ]);

    const wsPo = XLSX.utils.aoa_to_sheet(poData);
    wsPo['!cols'] = [
      { wch: 8 }, { wch: 18 }, { wch: 38 }, { wch: 10 },
      { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
      { wch: 18 }, { wch: 22 }, { wch: 25 }
    ];
    XLSX.utils.book_append_sheet(wb, wsPo, 'สรุปสั่งซื้อวัตถุดิบ (PO)');

    // Sheet 2: รายการสินค้าและต้นทุน (Product Plan & Unit Cost)
    const planData = [
      ['ลำดับ', 'ชื่อรุ่นมาตรฐาน (Master SKU)', 'จำนวนที่ต้องการ (ชิ้น)', 'ต้นทุนวัสดุต่อชิ้น (บาท)', 'ต้นทุนรวม (บาท)', 'หมายเหตุ']
    ];

    let planIdx = 1;
    let grandPlanCost = 0;
    let grandPlanUnits = 0;

    (plannedItems || []).forEach(p => {
      const uCost = p.unitCost || 0;
      const tCost = p.totalCost || (uCost * p.quantity);
      grandPlanCost += tCost;
      grandPlanUnits += (p.quantity || 0);

      planData.push([
        planIdx++,
        p.sku,
        p.quantity || 0,
        Math.round(uCost * 100) / 100,
        Math.round(tCost * 100) / 100,
        p.notes || ''
      ]);
    });

    planData.push([
      'รวมทั้งสิ้น', '', grandPlanUnits,
      grandPlanUnits > 0 ? Math.round((grandPlanCost / grandPlanUnits) * 100) / 100 : 0,
      Math.round(grandPlanCost * 100) / 100, ''
    ]);

    const wsPlan = XLSX.utils.aoa_to_sheet(planData);
    wsPlan['!cols'] = [
      { wch: 8 }, { wch: 45 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, wsPlan, 'แผนสินค้าและต้นทุน');

    // Sheet 3: รายการเบิกใช้วัตถุดิบสุทธิ (Net Material BOM)
    const bomData = [
      ['ลำดับ', 'หมวดหมู่', 'รายการวัสดุ', 'ยอดใช้สุทธิ', 'หน่วย', 'ราคาต่อหน่วย (บาท)', 'มูลค่าต้นทุนรวม (บาท)']
    ];
    let bomIdx = 1;
    let grandBomCost = 0;
    (calcResult.allMaterials || [])
      .filter(m => m.totalUsed > 0)
      .forEach(m => {
        grandBomCost += (m.totalCost || 0);
        bomData.push([
          bomIdx++,
          categoryNames[m.category] || m.category,
          m.name,
          m.totalUsed,
          m.unit,
          m.unitPrice || 0,
          m.totalCost || 0
        ]);
      });
    bomData.push([
      'รวมมูลค่าวัสดุสุทธิ', '', '', '', '', '', Math.round(grandBomCost * 100) / 100
    ]);
    const wsBom = XLSX.utils.aoa_to_sheet(bomData);
    wsBom['!cols'] = [
      { wch: 8 }, { wch: 18 }, { wch: 38 }, { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, wsBom, 'เบิกใช้วัตถุดิบสุทธิ');

    // Download File
    XLSX.writeFile(wb, `รายงานคำนวณวัตถุดิบและงบสั่งซื้อ_${todayStr}.xlsx`);
  }

  window.TemplateExport = {
    downloadProductionTemplate,
    exportPickingList,
    exportPurchaseOrder,
    exportMasterBomExcel,
    parseMasterBomExcel,
    exportMaterialPricesExcel,
    parseMaterialPricesExcel,
    exportFullCalculationExcel
  };

})(window);
