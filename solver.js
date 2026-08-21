(() => {
  const qualities = ["白品", "绿品", "蓝品", "紫品", "橙品", "红品"];

  const toNumber = (value) => {
    const text = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const match = text.match(/^(\d+(?:\.\d+)?)(w|万)?$/);
    if (!match) return Number.NaN;
    return Number(match[1]) * (match[2] ? 10000 : 1);
  };

  const slotCount = (shape) => {
    const match = String(shape ?? "").match(/(\d+)\s*[×x]\s*(\d+)/i);
    return match ? Number(match[1]) * Number(match[2]) : Number.NaN;
  };

  const money = (value) => new Intl.NumberFormat("zh-CN").format(Math.round(value));

  function byTemplate(records, id) {
    return records.filter((record) => record.templateId === id);
  }

  function latestNumber(records, id) {
    const record = byTemplate(records, id)[0];
    return record ? toNumber(record.results[0]) : Number.NaN;
  }

  function valuesByQuality(records) {
    const totals = new Map();
    byTemplate(records, "value-quality-total").forEach((record) => {
      const quality = record.params.quality;
      const value = toNumber(record.results[0]);
      if (quality && Number.isFinite(value)) totals.set(quality, value);
    });
    return totals;
  }

  function numbersByQuality(records, templateId) {
    const totals = new Map();
    byTemplate(records, templateId).forEach((record) => {
      const quality = record.params.quality;
      const value = toNumber(record.results[0]);
      if (quality && Number.isFinite(value)) totals.set(quality, value);
    });
    return totals;
  }

  function minForSlots(items, target) {
    if (!Number.isInteger(target) || target < 0 || target > 2500) return Number.NaN;
    const costs = items.map((item) => ({ slots: item.slots, value: item.value })).filter((item) => Number.isFinite(item.slots) && item.slots > 0 && Number.isFinite(item.value));
    const dp = Array(target + 1).fill(Infinity);
    dp[0] = 0;
    for (let slots = 1; slots <= target; slots += 1) {
      for (const item of costs) {
        if (item.slots <= slots && dp[slots - item.slots] !== Infinity) dp[slots] = Math.min(dp[slots], dp[slots - item.slots] + item.value);
      }
    }
    return Number.isFinite(dp[target]) ? dp[target] : Number.NaN;
  }

  function inventoryFromFullAll(records, catalogByName) {
    const record = byTemplate(records, "full-all")[0];
    if (!record) return null;
    const items = record.results.map((name) => catalogByName.get(name)).filter(Boolean);
    return items.length === record.results.length ? items : null;
  }

  function solve(catalog, records) {
    const items = catalog.map((item) => ({ ...item, value: toNumber(item.价值), slots: slotCount(item.轮廓) })).filter((item) => Number.isFinite(item.value) && Number.isFinite(item.slots));
    if (!items.length) return { lines: ["藏品库正在加载，暂不能计算边界。"], conflicts: [] };

    const catalogByName = new Map(items.map((item) => [item.名称, item]));
    const fullInventory = inventoryFromFullAll(records, catalogByName);
    if (fullInventory) {
      const total = fullInventory.reduce((sum, item) => sum + item.value, 0);
      return { lines: [`总价值已完全确定：${money(total)}`, `完整仓库：${fullInventory.length} 件，${fullInventory.reduce((sum, item) => sum + item.slots, 0)} 格`], conflicts: [] };
    }

    const totalValue = latestNumber(records, "value-all-total");
    const totalCount = latestNumber(records, "count-all-total");
    const totalSlots = latestNumber(records, "slots-all-total");
    const qualityValues = valuesByQuality(records);
    const qualityCounts = numbersByQuality(records, "count-quality-total");
    const qualitySlots = numbersByQuality(records, "slots-quality-total");
    const conflicts = [];
    const qualityValueSum = [...qualityValues.values()].reduce((sum, value) => sum + value, 0);
    const qualityCountSum = [...qualityCounts.values()].reduce((sum, value) => sum + value, 0);
    const qualitySlotSum = [...qualitySlots.values()].reduce((sum, value) => sum + value, 0);
    if (Number.isFinite(totalValue) && qualityValueSum > totalValue) conflicts.push("指定品质总价值之和大于所有藏品总价值。");
    if (Number.isFinite(totalCount) && qualityCountSum > totalCount) conflicts.push("指定品质数量之和大于所有藏品数量。");
    if (Number.isFinite(totalSlots) && qualitySlotSum > totalSlots) conflicts.push("指定品质格数之和大于总格数。");

    if (Number.isFinite(totalValue)) return { lines: [`总价值已确定：${money(totalValue)}`, "保守收益可直接按该总价值估计。"], conflicts };

    const lowerBounds = [];
    if (qualityValueSum) lowerBounds.push({ value: qualityValueSum, label: "已知品质总价值" });
    const fullSeen = byTemplate(records, "full-random").flatMap((record) => record.results).concat(byTemplate(records, "full-highest-random").flatMap((record) => record.results), byTemplate(records, "full-largest-random").flatMap((record) => record.results));
    const fullSeenValue = fullSeen.map((name) => catalogByName.get(name)?.value).filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
    if (fullSeenValue) lowerBounds.push({ value: fullSeenValue, label: "已揭示完整信息" });

    const globalMin = Math.min(...items.map((item) => item.value));
    if (Number.isFinite(totalCount)) lowerBounds.push({ value: totalCount * globalMin, label: "总数量" });
    if (Number.isFinite(totalSlots)) {
      const bound = minForSlots(items, totalSlots);
      if (Number.isFinite(bound)) lowerBounds.push({ value: bound, label: "总格数" });
    }
    for (const quality of qualities) {
      const scoped = items.filter((item) => item.品质 === quality);
      const count = qualityCounts.get(quality);
      const slots = qualitySlots.get(quality);
      if (Number.isFinite(count) && scoped.length) lowerBounds.push({ value: count * Math.min(...scoped.map((item) => item.value)), label: `${quality}数量` });
      if (Number.isFinite(slots)) {
        const bound = minForSlots(scoped, slots);
        if (Number.isFinite(bound)) lowerBounds.push({ value: bound, label: `${quality}总格数` });
      }
    }

    const strongest = lowerBounds.sort((a, b) => b.value - a.value)[0];
    const lines = strongest
      ? [`保守总价值下限：${money(strongest.value)}`, `下限由“${strongest.label}”约束得到；未提供总量时，上界不封顶。`, "这是一条保证成立的收益底线；后续会把多条约束联立以继续收紧。"]
      : ["尚无可量化约束。", "录入总数量、总格数、总价值或指定品质统计后，可给出保守收益下限。"];
    return { lines, conflicts };
  }

  window.ConservativeSolver = { solve };
})();
