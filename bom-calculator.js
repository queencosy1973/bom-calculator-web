/**
 * BOM Calculation Engine
 * Multiplies planned production quantities by Master BOM usage formulas
 */

(function (window) {
  'use strict';

  // Format numbers nicely
  function formatNum(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    return Number(val).toLocaleString('th-TH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  // Format currency nicely (2 decimals with commas)
  function formatMoney(val) {
    if (val === null || val === undefined || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Calculate material requirements & financial costs
  function calculateRequirements(plannedItems, masterBomData, stockOnHandMap = {}, materialPriceMap = {}) {
    if (!masterBomData || !masterBomData.skus || !masterBomData.materials) {
      return null;
    }

    // Build SKU -> materials map and calculate per-SKU material unit cost
    const skuBomMap = new Map();
    const skuUnitCostMap = new Map();

    masterBomData.skus.forEach(item => {
      const skuKey = item.sku.trim().toLowerCase();
      skuBomMap.set(skuKey, item.materials || {});

      let costPerUnit = 0;
      if (item.materials) {
        for (const [mName, mQty] of Object.entries(item.materials)) {
          const price = Number(materialPriceMap[mName]) || 0;
          costPerUnit += (Number(mQty) || 0) * price;
        }
      }
      skuUnitCostMap.set(skuKey, Math.round(costPerUnit * 100) / 100);
    });

    const categories = {
      wood: [],
      foam: [],
      fabric: [],
      packaging: [],
      other: []
    };

    const allMaterials = [];
    let totalItemsPlanned = 0;
    let shortageCount = 0;
    let activeMaterialsCount = 0;

    // Sum planned units and attach financial costs to each planned item
    plannedItems.forEach(item => {
      const qty = Number(item.quantity) || 0;
      totalItemsPlanned += qty;
      const skuKey = item.sku.trim().toLowerCase();
      const unitCost = skuUnitCostMap.get(skuKey) || 0;
      item.unitCost = unitCost;
      item.totalCost = Math.round(unitCost * qty * 100) / 100;
    });

    // Process each master material
    masterBomData.materials.forEach(mat => {
      const matName = mat.name;
      const unit = mat.unit;
      const category = mat.category || 'other';
      const unitPrice = Number(materialPriceMap[matName]) || 0;

      let totalUsed = 0;
      const consumingProducts = [];

      plannedItems.forEach(item => {
        const skuKey = item.sku.trim().toLowerCase();
        const materials = skuBomMap.get(skuKey);
        if (materials && materials[matName] !== undefined && materials[matName] > 0) {
          const perUnit = Number(materials[matName]) || 0;
          const qty = Number(item.quantity) || 0;
          const subTotal = qty * perUnit;
          totalUsed += subTotal;

          consumingProducts.push({
            sku: item.sku,
            quantity: qty,
            perUnit,
            subTotal: Math.round(subTotal * 1000) / 1000
          });
        }
      });

      totalUsed = Math.round(totalUsed * 1000) / 1000;
      if (totalUsed > 0) activeMaterialsCount++;

      // Stock check logic
      const stockInfo = stockOnHandMap[matName] || {};
      const currentStock = Number(stockInfo.currentStock) || 0;
      const wastePercent = Number(stockInfo.wastePercent) || 0;
      const wasteQty = Math.round(totalUsed * (wastePercent / 100) * 100) / 100;
      const netDemand = Math.round((totalUsed + wasteQty) * 100) / 100;
      const remaining = Math.round((currentStock - netDemand) * 100) / 100;
      const shortage = remaining < 0 ? Math.abs(remaining) : 0;

      // Cost calculations
      const totalCost = Math.round(totalUsed * unitPrice * 100) / 100;
      const shortageCost = Math.round(shortage * unitPrice * 100) / 100;
      const currentStockCost = Math.round(currentStock * unitPrice * 100) / 100;

      let status = 'NORMAL';
      let statusBadge = { text: '✅ พอผลิต', class: 'badge-success' };

      if (netDemand > 0) {
        if (currentStock <= 0) {
          status = 'OUT_OF_STOCK';
          statusBadge = { text: '❌ ขาดสต็อก', class: 'badge-danger' };
          shortageCount++;
        } else if (remaining < 0) {
          status = 'SHORTAGE';
          statusBadge = { text: `❌ ขาด ${formatNum(shortage)} ${unit}`, class: 'badge-danger' };
          shortageCount++;
        } else if (remaining < netDemand * 0.25 || remaining === 0) {
          status = 'LOW_STOCK';
          statusBadge = { text: '⚠️ ใกล้หมด', class: 'badge-warning' };
        }
      } else {
        statusBadge = { text: '⚪ ไม่ได้ใช้ในรอบนี้', class: 'badge-secondary' };
      }

      const matRecord = {
        name: matName,
        unit,
        category,
        unitPrice,
        totalUsed,
        totalCost,
        wastePercent,
        wasteQty,
        netDemand,
        currentStock,
        currentStockCost,
        remaining,
        shortage,
        shortageCost,
        status,
        statusBadge,
        consumingProducts
      };

      allMaterials.push(matRecord);
      if (categories[category]) {
        categories[category].push(matRecord);
      } else {
        categories.other.push(matRecord);
      }
    });

    // Grand financial totals
    const totalMaterialCost = Math.round(allMaterials.reduce((acc, m) => acc + m.totalCost, 0) * 100) / 100;
    const totalShortageCost = Math.round(allMaterials.reduce((acc, m) => acc + m.shortageCost, 0) * 100) / 100;
    const totalStockValue = Math.round(allMaterials.reduce((acc, m) => acc + m.currentStockCost, 0) * 100) / 100;

    return {
      totalItemsPlanned,
      uniqueSkusCount: plannedItems.length,
      activeMaterialsCount,
      shortageCount,
      totalMaterialCost,
      totalShortageCost,
      totalStockValue,
      categories,
      allMaterials
    };
  }

  window.BomCalculator = {
    calculateRequirements,
    formatNum,
    formatMoney
  };

})(window);
