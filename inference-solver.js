(() => {
  const qualities = ["白品", "绿品", "蓝品", "紫品", "橙品", "红品"];
  const focusQualities = ["红品", "橙品", "紫品"];
  const MAX_COUNT = 20;
  const MAX_SOLUTIONS = 2000;
  const MAX_NODES = 300000;
  const EPSILON = 1e-9;

  const toNumber = (value) => {
    const text = String(value ?? "").trim().toLowerCase().replace(/,/g, "");
    const match = text.match(/^(\d+(?:\.\d+)?)(w|万)?$/);
    return match ? Number(match[1]) * (match[2] ? 10000 : 1) : Number.NaN;
  };
  const normalizeShape = (shape) => {
    const match = String(shape ?? "").match(/(\d+)\s*[×x]\s*(\d+)/i);
    return match ? `${Number(match[1])}×${Number(match[2])}` : "";
  };
  const slotCount = (shape) => {
    const match = normalizeShape(shape).match(/(\d+)×(\d+)/);
    return match ? Number(match[1]) * Number(match[2]) : Number.NaN;
  };
  const money = (value) => new Intl.NumberFormat("zh-CN").format(Math.round(value));
  const sameNumber = (left, right) => Math.abs(left - right) < EPSILON;
  const byTemplate = (records, id) => records.filter((record) => record.templateId === id);
  const qualityRecords = (records, id, quality) => byTemplate(records, id).filter((record) => record.params.quality === quality);

  function countValues(values) {
    const result = new Map();
    values.forEach((value) => result.set(value, (result.get(value) ?? 0) + 1));
    return result;
  }

  function formatCountMap(map, formatter = String) {
    return [...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([value, count]) => `${formatter(value)}×${count}`).join(" + ");
  }

  function readExactNumber(records, templateId, quality, label, conflicts) {
    const values = qualityRecords(records, templateId, quality)
      .map((record) => toNumber(record.results[0])).filter(Number.isFinite);
    const distinct = [...new Set(values)];
    if (distinct.length > 1) conflicts.push(`${quality}${label}存在互相矛盾的重复记录：${distinct.join("、")}。`);
    return values[0] ?? Number.NaN;
  }

  function exactQualityCountsFromAll(records) {
    const record = byTemplate(records, "quality-all")[0];
    return record ? countValues(record.results.filter((value) => qualities.includes(value))) : new Map();
  }

  function minimumQualityCountsFromRandom(records) {
    return countValues(byTemplate(records, "quality-random").flatMap((record) => record.results)
      .filter((value) => qualities.includes(value)));
  }

  function knownFullItems(records, catalogByName) {
    return ["full-random", "full-highest-random", "full-largest-random"]
      .flatMap((id) => byTemplate(records, id).flatMap((record) => record.results))
      .map((name) => catalogByName.get(name)).filter(Boolean);
  }

  function buildFacts(quality, records, catalogByName, conflicts) {
    const allQualityCounts = exactQualityCountsFromAll(records);
    const randomQualityCounts = minimumQualityCountsFromRandom(records);
    const totalValue = readExactNumber(records, "value-quality-total", quality, "总价值", conflicts);
    const totalSlots = readExactNumber(records, "slots-quality-total", quality, "总格数", conflicts);
    const averageSlots = readExactNumber(records, "slots-quality-average", quality, "平均格数", conflicts);
    const directCount = readExactNumber(records, "count-quality-total", quality, "总数量", conflicts);
    const allShapeRecords = qualityRecords(records, "outline-quality-all", quality);
    const allShapes = allShapeRecords[0]?.results.map(normalizeShape).filter(Boolean) ?? null;
    const shapeSets = [...new Set(allShapeRecords.map((record) => record.results.map(normalizeShape).filter(Boolean).sort().join("|")))];
    if (shapeSets.length > 1) conflicts.push(`${quality}全部轮廓存在互相矛盾的重复记录。`);

    const exactCounts = [directCount, allQualityCounts.get(quality), allShapes?.length].filter(Number.isFinite);
    if (new Set(exactCounts).size > 1) conflicts.push(`${quality}总数量与所有品质/所有轮廓推导出的数量不一致。`);
    const oneValues = qualityRecords(records, "value-quality-one", quality).flatMap((record) => record.results.map(toNumber)).filter(Number.isFinite);
    const oneSlots = qualityRecords(records, "slots-quality-one", quality).flatMap((record) => record.results.map(toNumber)).filter(Number.isFinite);
    const oneShapes = qualityRecords(records, "outline-quality-one", quality).flatMap((record) => record.results.map(normalizeShape)).filter(Boolean);
    const fullItems = knownFullItems(records, catalogByName).filter((item) => item.品质 === quality);
    const minimumCount = Math.max(
      randomQualityCounts.get(quality) ?? 0,
      oneValues.length,
      oneSlots.length,
      oneShapes.length,
      fullItems.length,
      totalValue > 0 || totalSlots > 0 || averageSlots > 0 ? 1 : 0,
    );
    return { quality, totalValue, totalSlots, averageSlots, exactCount: exactCounts[0] ?? Number.NaN, minimumCount, allShapes, oneValues, oneSlots, oneShapes, fullItems };
  }

  function resolveDerivedFacts(facts, conflicts) {
    const exactCounts = Number.isFinite(facts.exactCount) ? [facts.exactCount] : [];
    let targetSlots = facts.totalSlots;
    if (facts.allShapes) {
      const slots = facts.allShapes.map(slotCount);
      if (slots.some((value) => !Number.isFinite(value))) conflicts.push(`${facts.quality}全部轮廓中存在无法识别的轮廓。`);
      else {
        const sum = slots.reduce((total, value) => total + value, 0);
        if (Number.isFinite(targetSlots) && !sameNumber(targetSlots, sum)) conflicts.push(`${facts.quality}全部轮廓合计 ${sum} 格，与总格数 ${targetSlots} 不一致。`);
        targetSlots = sum;
      }
    }
    if (Number.isFinite(facts.averageSlots) && facts.averageSlots <= 0) conflicts.push(`${facts.quality}平均格数必须大于 0。`);
    if (Number.isFinite(facts.totalSlots) && Number.isFinite(facts.averageSlots) && facts.averageSlots > 0) {
      const count = facts.totalSlots / facts.averageSlots;
      if (!Number.isInteger(count)) conflicts.push(`${facts.quality}总格数 ÷ 平均格数不能得到整数数量。`);
      else exactCounts.push(count);
    }
    if (Number.isFinite(facts.exactCount) && Number.isFinite(facts.averageSlots)) {
      const slots = facts.exactCount * facts.averageSlots;
      if (!Number.isInteger(slots)) conflicts.push(`${facts.quality}数量 × 平均格数不能得到整数总格数。`);
      else if (Number.isFinite(targetSlots) && !sameNumber(targetSlots, slots)) conflicts.push(`${facts.quality}数量与平均格数推导出 ${slots} 格，与总格数不一致。`);
      else targetSlots = slots;
    }
    if (new Set(exactCounts).size > 1) conflicts.push(`${facts.quality}现有条件推导出了不同的藏品数量。`);
    const exactCount = exactCounts[0] ?? Number.NaN;
    if (Number.isFinite(exactCount) && (!Number.isInteger(exactCount) || exactCount < 0)) conflicts.push(`${facts.quality}数量必须是非负整数。`);
    if (Number.isFinite(exactCount) && exactCount < facts.minimumCount) conflicts.push(`${facts.quality}至少已揭示 ${facts.minimumCount} 件不同实例，但总数量只有 ${exactCount}。`);
    let averageSlots = facts.averageSlots;
    if (Number.isFinite(exactCount) && exactCount > 0 && Number.isFinite(targetSlots)) {
      const derivedAverage = targetSlots / exactCount;
      if (Number.isFinite(averageSlots) && !sameNumber(averageSlots, derivedAverage)) conflicts.push(`${facts.quality}总格数与数量推导出的平均格数为 ${derivedAverage}，与已知平均格数不一致。`);
      else averageSlots = derivedAverage;
    }
    return { ...facts, exactCount, targetSlots, averageSlots };
  }

  const itemLabel = (item) => `${item.名称}（${item.品质}、${item.shape}、${money(item.value)}）`;

  function directValueInference(items, records, lines) {
    const clues = [];
    byTemplate(records, "value-quality-one").forEach((record) => {
      record.results.map(toNumber).filter(Number.isFinite).forEach((value) => clues.push({ value, quality: record.params.quality }));
    });
    ["value-highest-random", "value-largest-random"].forEach((templateId) => {
      byTemplate(records, templateId).forEach((record) => record.results.map(toNumber).filter(Number.isFinite)
        .forEach((value) => clues.push({ value, quality: null })));
    });
    clues.forEach(({ value, quality }) => {
      const highMatches = items.filter((item) => focusQualities.includes(item.品质) && sameNumber(item.value, value));
      const matches = quality ? highMatches.filter((item) => item.品质 === quality) : highMatches;
      const prefix = quality ? `${quality}单件价值 ${money(value)}` : `单件价值 ${money(value)}`;
      if (matches.length === 1) lines.push(`[确定] ${prefix}：${itemLabel(matches[0])}`);
      else if (matches.length > 1) lines.push(`[候选] ${prefix} 可能是：${matches.map((item) => item.名称).join("、")}。`);
      else if (highMatches.length) {
        lines.push(`[数据库差异] ${prefix} 在当前图鉴中对应：${highMatches.map(itemLabel).join("、")}；本局实际情报仍然保留。`);
      } else lines.push(`[未命中] ${prefix} 在红、橙、紫藏品中没有相同价值。`);
    });
  }

  function makeBuckets(items, facts) {
    const needsValue = Number.isFinite(facts.totalValue) || facts.oneValues.length > 0;
    const needsShape = Boolean(facts.allShapes) || facts.oneShapes.length > 0;
    const needsSlots = needsShape || Number.isFinite(facts.targetSlots) || Number.isFinite(facts.averageSlots) || facts.oneSlots.length > 0;
    const grouped = new Map();
    items.forEach((item) => {
      const key = [needsValue ? item.value : "*", needsSlots ? item.slots : "*", needsShape ? item.shape : "*"].join("|");
      if (!grouped.has(key)) grouped.set(key, { key, value: item.value, slots: item.slots, shape: item.shape, items: [] });
      grouped.get(key).items.push(item);
    });
    const buckets = [...grouped.values()];
    buckets.sort(needsValue ? (a, b) => a.value - b.value : needsSlots ? (a, b) => a.slots - b.slots : (a, b) => a.key.localeCompare(b.key));
    return { buckets, needsValue, needsSlots, needsShape };
  }

  function buildRequirements(facts, bucketMeta) {
    const requiredBucketCounts = new Map();
    facts.fullItems.forEach((item) => {
      const index = bucketMeta.buckets.findIndex((bucket) => (
        (!bucketMeta.needsValue || bucket.value === item.value)
        && (!bucketMeta.needsSlots || bucket.slots === item.slots)
        && (!bucketMeta.needsShape || bucket.shape === item.shape)
      ));
      if (index >= 0) requiredBucketCounts.set(index, (requiredBucketCounts.get(index) ?? 0) + 1);
    });
    return {
      values: countValues(facts.oneValues),
      slots: countValues(facts.oneSlots),
      shapes: countValues(facts.oneShapes),
      buckets: requiredBucketCounts,
    };
  }

  function profileSatisfies(profile, bucketMeta, requirements, exactShapes) {
    const countFor = (predicate) => profile.reduce((sum, count, index) => sum + (predicate(bucketMeta.buckets[index]) ? count : 0), 0);
    for (const [value, count] of requirements.values) if (countFor((bucket) => sameNumber(bucket.value, value)) < count) return false;
    for (const [slots, count] of requirements.slots) if (countFor((bucket) => bucket.slots === slots) < count) return false;
    for (const [shape, count] of requirements.shapes) if (countFor((bucket) => bucket.shape === shape) < count) return false;
    for (const [index, count] of requirements.buckets) if (profile[index] < count) return false;
    if (exactShapes) {
      const actual = new Map();
      profile.forEach((count, index) => { if (count) actual.set(bucketMeta.buckets[index].shape, (actual.get(bucketMeta.buckets[index].shape) ?? 0) + count); });
      if (actual.size !== exactShapes.size) return false;
      for (const [shape, count] of exactShapes) if (actual.get(shape) !== count) return false;
    }
    return true;
  }

  function enumerateSolutions(bucketMeta, facts) {
    const { buckets } = bucketMeta;
    const requirements = buildRequirements(facts, bucketMeta);
    const exactShapes = facts.allShapes ? countValues(facts.allShapes) : null;
    const minimumValue = Math.min(...buckets.map((bucket) => bucket.value));
    const minimumSlots = Math.min(...buckets.map((bucket) => bucket.slots));
    let maximumCount = MAX_COUNT;
    if (Number.isFinite(facts.totalValue)) maximumCount = Math.min(maximumCount, Math.floor(facts.totalValue / minimumValue));
    if (Number.isFinite(facts.targetSlots)) maximumCount = Math.min(maximumCount, Math.floor(facts.targetSlots / minimumSlots));
    const countOptions = Number.isFinite(facts.exactCount)
      ? [facts.exactCount]
      : Array.from({ length: Math.max(0, maximumCount - facts.minimumCount + 1) }, (_, index) => facts.minimumCount + index);
    const suffix = Array(buckets.length + 1).fill(null).map(() => ({}));
    for (let index = buckets.length - 1; index >= 0; index -= 1) {
      suffix[index] = {
        minValue: Math.min(buckets[index].value, suffix[index + 1].minValue ?? Infinity),
        maxValue: Math.max(buckets[index].value, suffix[index + 1].maxValue ?? -Infinity),
        minSlots: Math.min(buckets[index].slots, suffix[index + 1].minSlots ?? Infinity),
        maxSlots: Math.max(buckets[index].slots, suffix[index + 1].maxSlots ?? -Infinity),
      };
    }
    const solutions = [];
    const profile = Array(buckets.length).fill(0);
    let nodes = 0;
    let truncated = false;

    for (const count of countOptions) {
      if (!Number.isInteger(count) || count < 0) continue;
      const targetSlots = Number.isFinite(facts.targetSlots) ? facts.targetSlots : Number.isFinite(facts.averageSlots) ? facts.averageSlots * count : Number.NaN;
      if (Number.isFinite(targetSlots) && !Number.isInteger(targetSlots)) continue;
      const search = (start, remainingCount, remainingSlots, remainingValue) => {
        nodes += 1;
        if (nodes > MAX_NODES || solutions.length >= MAX_SOLUTIONS) { truncated = true; return; }
        if (remainingCount === 0) {
          if (Number.isFinite(remainingSlots) && remainingSlots !== 0) return;
          if (Number.isFinite(remainingValue) && !sameNumber(remainingValue, 0)) return;
          if (profileSatisfies(profile, bucketMeta, requirements, exactShapes)) solutions.push([...profile]);
          return;
        }
        if (start >= buckets.length) return;
        if (Number.isFinite(remainingSlots) && (remainingSlots < remainingCount * suffix[start].minSlots || remainingSlots > remainingCount * suffix[start].maxSlots)) return;
        if (Number.isFinite(remainingValue) && (remainingValue < remainingCount * suffix[start].minValue || remainingValue > remainingCount * suffix[start].maxValue)) return;
        for (let index = start; index < buckets.length; index += 1) {
          const bucket = buckets[index];
          if (Number.isFinite(remainingSlots) && bucket.slots > remainingSlots) continue;
          if (Number.isFinite(remainingValue) && bucket.value > remainingValue) continue;
          if (exactShapes) {
            const used = profile.reduce((sum, value, profileIndex) => sum + (bucketMeta.buckets[profileIndex].shape === bucket.shape ? value : 0), 0);
            if (used >= (exactShapes.get(bucket.shape) ?? 0)) continue;
          }
          profile[index] += 1;
          search(index, remainingCount - 1, Number.isFinite(remainingSlots) ? remainingSlots - bucket.slots : Number.NaN, Number.isFinite(remainingValue) ? remainingValue - bucket.value : Number.NaN);
          profile[index] -= 1;
          if (truncated) return;
        }
      };
      search(0, count, targetSlots, facts.totalValue);
      if (truncated) break;
    }
    return { solutions, truncated, bucketMeta };
  }

  function describeSolution(solution, bucketMeta) {
    return solution.map((count, index) => {
      if (!count) return null;
      const bucket = bucketMeta.buckets[index];
      const attributes = [];
      if (bucketMeta.needsValue) attributes.push(money(bucket.value));
      if (bucketMeta.needsShape) attributes.push(bucket.shape);
      else if (bucketMeta.needsSlots) attributes.push(`${bucket.slots}格`);
      const names = bucket.items.map((item) => item.名称);
      return `${attributes.join("/")}×${count}（${names.length === 1 ? names[0] : `${names.length}件藏品可选`}）`;
    }).filter(Boolean).join(" + ");
  }

  function guaranteedSlots(solutions, bucketMeta) {
    const profiles = solutions.map((solution) => {
      const map = new Map();
      solution.forEach((count, index) => { if (count) map.set(bucketMeta.buckets[index].slots, (map.get(bucketMeta.buckets[index].slots) ?? 0) + count); });
      return map;
    });
    const result = new Map();
    const slots = [...new Set(profiles.flatMap((map) => [...map.keys()]))];
    slots.forEach((value) => {
      const minimum = Math.min(...profiles.map((map) => map.get(value) ?? 0));
      if (minimum > 0) result.set(value, minimum);
    });
    return result;
  }

  const hasAggregate = (facts) => Number.isFinite(facts.totalValue) || Number.isFinite(facts.targetSlots)
    || Number.isFinite(facts.averageSlots) || Number.isFinite(facts.exactCount) || Boolean(facts.allShapes);

  function knownAttributeSummary(facts) {
    const parts = [];
    if (facts.oneSlots.length) parts.push(`格数 ${formatCountMap(countValues(facts.oneSlots), (slots) => `${slots}格`)}`);
    if (facts.oneValues.length) parts.push(`价值 ${formatCountMap(countValues(facts.oneValues), money)}`);
    if (facts.oneShapes.length) parts.push(`轮廓 ${formatCountMap(countValues(facts.oneShapes))}`);
    return parts;
  }

  function catalogCoverageNote(scoped, facts) {
    if (!Number.isFinite(facts.totalValue) || !facts.oneSlots.length) return "";
    const minimumKnownSlotsValue = [...countValues(facts.oneSlots)].reduce((total, [slots, count]) => {
      const values = scoped.filter((item) => item.slots === slots).map((item) => item.value);
      return total + (values.length ? Math.min(...values) * count : 0);
    }, 0);
    if (minimumKnownSlotsValue > facts.totalValue) {
      return `按当前图鉴，已知格数对应藏品的最低合计价值为 ${money(minimumKnownSlotsValue)}，高于情报总价值 ${money(facts.totalValue)}`;
    }
    return "";
  }

  function inferQuality(items, rawFacts, lines, conflicts) {
    const facts = resolveDerivedFacts(rawFacts, conflicts);
    const scoped = items.filter((item) => item.品质 === facts.quality);
    if (!scoped.length) return;
    const knownAttributes = knownAttributeSummary(facts);
    if (knownAttributes.length) lines.push(`[已知下限] ${facts.quality}至少 ${facts.minimumCount} 件不同藏品；${knownAttributes.join("；")}。`);
    if (!hasAggregate(facts)) return;
    const summary = [];
    if (Number.isFinite(facts.exactCount)) summary.push(`${facts.exactCount}件`);
    else if (facts.minimumCount) summary.push(`至少${facts.minimumCount}件`);
    if (Number.isFinite(facts.targetSlots)) summary.push(`共${facts.targetSlots}格`);
    if (Number.isFinite(facts.averageSlots)) summary.push(`平均${facts.averageSlots}格`);
    if (Number.isFinite(facts.totalValue)) summary.push(`总价值${money(facts.totalValue)}`);
    lines.push(`[${facts.quality}] 已联立：${summary.join("，")}。`);
    if (Number.isFinite(facts.totalValue) && Number.isFinite(facts.exactCount) && facts.exactCount > 0) {
      lines.push(`[推导] ${facts.quality}平均价值为 ${money(facts.totalValue / facts.exactCount)}。`);
    }
    const bucketMeta = makeBuckets(scoped, facts);
    if (!bucketMeta.needsValue && !bucketMeta.needsSlots && !bucketMeta.needsShape) return;
    const result = enumerateSolutions(bucketMeta, facts);
    if (!result.solutions.length) {
      const coverageNote = catalogCoverageNote(scoped, facts);
      lines.push(`[数据库未覆盖] ${coverageNote ? `${coverageNote}；` : "当前图鉴无法组成满足全部情报的组合；"}本局实际情报仍然保留，不判定为互相冲突。`);
      return;
    }
    if (!result.truncated && !Number.isFinite(facts.exactCount)) {
      const possibleCounts = [...new Set(result.solutions.map((solution) => solution.reduce((sum, count) => sum + count, 0)))].sort((a, b) => a - b);
      if (possibleCounts.length) lines.push(`[推导] ${facts.quality}数量可能为：${possibleCounts.join("、")}。`);
    }
    if (result.solutions.length === 1 && !result.truncated) lines.push(`[唯一属性组合] ${facts.quality}：${describeSolution(result.solutions[0], result.bucketMeta)}。`);
    else {
      lines.push(`[多解] ${facts.quality}${result.truncated ? "至少" : "共"}找到 ${result.solutions.length} 种可行组合。`);
      result.solutions.slice(0, 4).forEach((solution, index) => lines.push(`候选 ${index + 1}：${describeSolution(solution, result.bucketMeta)}。`));
    }
    if (!result.truncated) {
      const guaranteed = guaranteedSlots(result.solutions, result.bucketMeta);
      if (guaranteed.size) lines.push(`[必然包含] ${facts.quality}：${formatCountMap(guaranteed, (slots) => `${slots}格`)}。`);
    } else lines.push(`[需要更多信息] 搜索空间过大；补充${Number.isFinite(facts.exactCount) ? "总价值或全部轮廓" : "数量"}可继续收紧。`);
  }

  function validateGlobalTotals(records, conflicts) {
    [["value-all-total", "value-quality-total", "总价值"], ["count-all-total", "count-quality-total", "总数量"], ["slots-all-total", "slots-quality-total", "总格数"]]
      .forEach(([allId, qualityId, label]) => {
        const all = toNumber(byTemplate(records, allId)[0]?.results[0]);
        const known = byTemplate(records, qualityId).map((record) => toNumber(record.results[0])).filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
        if (Number.isFinite(all) && known > all) conflicts.push(`各品质${label}之和大于全部藏品${label}。`);
      });
  }

  function solve(catalog, records) {
    const items = catalog.map((item) => ({ ...item, value: toNumber(item.价值), shape: normalizeShape(item.轮廓), slots: slotCount(item.轮廓) }))
      .filter((item) => Number.isFinite(item.value) && Number.isFinite(item.slots) && item.shape);
    if (!items.length) return { lines: ["藏品库正在加载，暂不能推断。"], conflicts: [] };
    const lines = [];
    const conflicts = [];
    const catalogByName = new Map(items.map((item) => [item.名称, item]));
    directValueInference(items, records, lines);
    knownFullItems(records, catalogByName).filter((item) => focusQualities.includes(item.品质))
      .forEach((item) => lines.push(`[已确认藏品] ${itemLabel(item)}。`));
    focusQualities.forEach((quality) => inferQuality(items, buildFacts(quality, records, catalogByName, conflicts), lines, conflicts));
    validateGlobalTotals(records, conflicts);
    if (!lines.length) {
      lines.push("尚无红、橙、紫品质的可推断条件。");
      lines.push("可录入单件价值，或指定品质的数量、总价值、总格数、平均格数与全部轮廓。");
    }
    return { lines, conflicts: [...new Set(conflicts)] };
  }

  const api = { solve, toNumber, normalizeShape, slotCount };
  if (typeof window !== "undefined") window.AuctionInferenceSolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
