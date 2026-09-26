const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];
const damageOptions = ["完好", "轻微划痕", "齿孔破损", "接片松动", "需跳过"];
const repairResults = ["未完成", "修复中", "已修复待复检", "复检通过"];

function createRepair() {
  return { assignee: "", dueDate: "", result: "未完成", updatedAt: null };
}

function normalizeSegment(segment) {
  const damage = segment.damage || "完好";
  const repair = segment.repair || (damage !== "完好" ? createRepair() : null);
  const normalized = {
    thumb: "",
    note: "",
    ...segment,
    damage,
    repair: repair ? { ...createRepair(), ...repair } : null,
    pass: segment.pass || null,
    passArchive: Array.isArray(segment.passArchive) ? segment.passArchive : [],
    useBackup: Boolean(segment.useBackup)
  };
  if (normalized.repair && !repairResults.includes(normalized.repair.result)) {
    normalized.repair.result = "未完成";
  }
  return normalized;
}

const defaultState = {
  reelTitle: "春日试映A卷",
  segments: [
    normalizeSegment({
      id: crypto.randomUUID(),
      code: "A-001",
      duration: 18,
      shift: "正常",
      damage: "完好",
      note: "开场街景，节奏平稳，适合保留原顺序。"
    }),
    normalizeSegment({
      id: crypto.randomUUID(),
      code: "A-006",
      duration: 9,
      shift: "偏红",
      damage: "轻微划痕",
      note: "人物近景左侧有划痕，试映时留意是否明显。",
      repair: { assignee: "林师傅", dueDate: "2026-09-24", result: "修复中", updatedAt: null }
    }),
    normalizeSegment({
      id: crypto.randomUUID(),
      code: "A-012",
      duration: 14,
      shift: "褪色",
      damage: "接片松动",
      note: "接片位置靠近段尾，放映前建议重新压平。"
    })
  ]
};

let state = loadState();
let draggedId = null;

const els = {
  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  codeInput: document.querySelector("#codeInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentGroups: document.querySelector("#segmentGroups"),
  screenableList: document.querySelector("#screenableList"),
  pendingList: document.querySelector("#pendingList"),
  screenableMeta: document.querySelector("#screenableMeta"),
  pendingMeta: document.querySelector("#pendingMeta"),
  repairList: document.querySelector("#repairList"),
  repairMeta: document.querySelector("#repairMeta"),
  warningList: document.querySelector("#warningList"),
  totalDuration: document.querySelector("#totalDuration"),
  damageCount: document.querySelector("#damageCount"),
  segmentCount: document.querySelector("#segmentCount"),
  pendingCount: document.querySelector("#pendingCount"),
  overdueCount: document.querySelector("#overdueCount"),
  exportBtn: document.querySelector("#exportBtn")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    const base = structuredClone(defaultState);
    const segments = Array.isArray(parsed.segments) ? parsed.segments.map(normalizeSegment) : base.segments;
    return { ...base, ...parsed, segments };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

// ---------- 修复工单状态判断 ----------

function needsRepair(segment) {
  return segment.damage !== "完好";
}

function hasValidPass(segment) {
  return Boolean(segment.pass);
}

// 待修：有破损且复检未通过（启用备用片段不影响待修状态，原片段进度保留）
function isPending(segment) {
  return needsRepair(segment) && !hasValidPass(segment);
}

// 可放映：完好、复检通过，或启用备用片段顶替
function isScreenable(segment) {
  return !needsRepair(segment) || hasValidPass(segment) || segment.useBackup;
}

function isOverdue(segment) {
  return Boolean(isPending(segment) && segment.repair && segment.repair.dueDate && segment.repair.dueDate < todayStr());
}

// ---------- 修复工单操作 ----------

// 通过记录失效：移入留档，处理结果回到未完成
function invalidatePass(segment, reason) {
  if (!segment.pass) return;
  segment.passArchive.push({ ...segment.pass, invalidatedAt: nowIso(), reason });
  segment.pass = null;
  if (segment.repair) {
    segment.repair.result = "未完成";
    segment.repair.updatedAt = nowIso();
  }
}

function setRepairResult(segment, result) {
  if (!segment.repair) segment.repair = createRepair();
  if (segment.repair.result === result) return;
  if (segment.pass && result !== "复检通过") {
    invalidatePass(segment, `处理结果回退为「${result}」`);
  }
  segment.repair.result = result;
  segment.repair.updatedAt = nowIso();
  if (result === "复检通过") {
    segment.pass = { passedAt: nowIso(), duration: Number(segment.duration), damage: segment.damage };
    segment.useBackup = false;
  }
}

function setSegmentDuration(segment, duration) {
  const next = Math.max(1, Math.round(Number(duration) || 0));
  if (next === Number(segment.duration)) return;
  if (segment.pass) invalidatePass(segment, `时长变化 ${segment.duration}秒→${next}秒`);
  segment.duration = next;
}

function setSegmentDamage(segment, damage) {
  if (segment.damage === damage) return;
  if (segment.pass && damage !== "完好") invalidatePass(segment, `再次标为破损：${damage}`);
  segment.damage = damage;
  if (damage !== "完好" && !segment.repair) segment.repair = createRepair();
  if (damage === "完好") segment.useBackup = false;
}

function findSegment(id) {
  return state.segments.find((item) => item.id === id);
}

// ---------- 渲染 ----------

function getFilteredSegments() {
  const color = els.colorFilter.value;
  const keyword = els.searchInput.value.trim();
  return state.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const haystack = `${item.code}${item.note}${item.damage}${item.repair?.assignee || ""}${item.repair?.result || ""}`;
    const matchesKeyword = !keyword || haystack.includes(keyword);
    return matchesColor && matchesKeyword;
  });
}

function renderStats() {
  const screenableSeconds = state.segments.filter(isScreenable).reduce((sum, item) => sum + Number(item.duration), 0);
  els.totalDuration.textContent = formatDuration(screenableSeconds);
  els.segmentCount.textContent = state.segments.length;
  els.damageCount.textContent = state.segments.filter(needsRepair).length;
  els.pendingCount.textContent = state.segments.filter(isPending).length;
  els.overdueCount.textContent = state.segments.filter(isOverdue).length;
}

function segmentCard(item, seq) {
  const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
  const damaged = needsRepair(item);
  const held = seq === null;
  const tags = [
    `<span class="tag">${escapeHtml(item.shift)}</span>`,
    `<span class="tag ${damaged ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>`
  ];
  if (damaged && hasValidPass(item)) tags.push(`<span class="tag ok">复检通过</span>`);
  if (item.useBackup && isPending(item)) tags.push(`<span class="tag backup">备用片段顶替</span>`);
  if (held) tags.push(`<span class="tag hold">暂不放映</span>`);
  const repairLine =
    item.repair && damaged
      ? `<p class="repair-line">工单：${escapeHtml(item.repair.result)}｜负责人 ${escapeHtml(item.repair.assignee || "未指派")}｜预计 ${escapeHtml(item.repair.dueDate || "未定")}${isOverdue(item) ? "｜已超期" : ""}</p>`
      : "";
  return `
    <article class="segment-card${held ? " pending" : ""}" draggable="true" data-id="${item.id}">
      <div class="thumb">
        ${
          item.thumb
            ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
            : `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
        }
      </div>
      <div class="segment-main">
        <div class="segment-title">
          <strong>${held ? "" : `${seq}. `}${escapeHtml(item.code)}</strong>
          <span>${formatDuration(item.duration)}</span>
        </div>
        <div class="tag-row">${tags.join("")}</div>
        ${repairLine}
        <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
      </div>
      <div class="segment-actions">
        <button type="button" title="上移" data-move-up="${item.id}">↑</button>
        <button type="button" title="下移" data-move-down="${item.id}">↓</button>
        <button type="button" title="删除" data-delete="${item.id}">×</button>
      </div>
    </article>
  `;
}

function renderList() {
  const filtered = getFilteredSegments();
  const seqMap = new Map();
  state.segments.filter(isScreenable).forEach((item, index) => seqMap.set(item.id, index + 1));
  const screenable = filtered.filter(isScreenable);
  const pending = filtered.filter((item) => !isScreenable(item));
  const screenableSeconds = state.segments.filter(isScreenable).reduce((sum, item) => sum + Number(item.duration), 0);
  els.screenableMeta.textContent = `${seqMap.size} 段 · ${formatDuration(screenableSeconds)}`;
  els.pendingMeta.textContent = `${state.segments.filter((item) => !isScreenable(item)).length} 段`;
  els.screenableList.innerHTML =
    screenable.map((item) => segmentCard(item, seqMap.get(item.id))).join("") ||
    `<p class="empty">当前筛选下没有可放映片段。</p>`;
  els.pendingList.innerHTML =
    pending.map((item) => segmentCard(item, null)).join("") ||
    `<p class="empty">当前筛选下没有待修复片段。</p>`;
}

function repairCard(item) {
  const repair = item.repair;
  const damaged = needsRepair(item);
  const passed = hasValidPass(item);
  const overdue = isOverdue(item);
  const today = todayStr();
  const dueSoon =
    !overdue && isPending(item) && repair.dueDate && daysBetween(today, repair.dueDate) >= 0 && daysBetween(today, repair.dueDate) <= 2;

  let status;
  let statusClass;
  if (!damaged) {
    status = "已标记完好 · 工单留档";
    statusClass = "is-done";
  } else if (passed) {
    status = `复检通过于 ${formatDateTime(item.pass.passedAt)}`;
    statusClass = "is-passed";
  } else if (item.useBackup) {
    status = "备用片段顶替放映中 · 原片段修复进度保留";
    statusClass = "is-backup";
  } else {
    status = "待修复 · 复检通过前不进入放映";
    statusClass = "is-pending";
  }

  const dueBadge = overdue
    ? `<span class="due-badge overdue">已超期 ${daysBetween(repair.dueDate, today)} 天</span>`
    : dueSoon
      ? `<span class="due-badge soon">临近超期</span>`
      : "";

  const backupToggle = isPending(item)
    ? `<label class="backup-toggle">
        <input type="checkbox" data-field="useBackup" ${item.useBackup ? "checked" : ""} />
        使用备用片段顶替放映（原片段保留修复进度）
      </label>`
    : "";

  const archive = item.passArchive.length
    ? `<div class="pass-archive">
        <strong>已失效通过记录（留档）</strong>
        <ul>
          ${item.passArchive
            .map(
              (record) =>
                `<li>通过于 ${formatDateTime(record.passedAt)} → 失效于 ${formatDateTime(record.invalidatedAt)}｜${escapeHtml(record.reason)}</li>`
            )
            .join("")}
        </ul>
      </div>`
    : "";

  return `
    <article class="repair-card" data-id="${item.id}">
      <header class="repair-head">
        <strong>${escapeHtml(item.code)}</strong>
        <span class="repair-status ${statusClass}">${escapeHtml(status)}</span>
        ${dueBadge}
      </header>
      <div class="repair-grid">
        <label>负责人<input type="text" data-field="assignee" value="${escapeHtml(repair.assignee)}" placeholder="登记修复负责人" /></label>
        <label>预计完成<input type="date" data-field="dueDate" value="${escapeHtml(repair.dueDate)}" /></label>
        <label>处理结果
          <select data-field="result">
            ${repairResults.map((result) => `<option value="${result}" ${result === repair.result ? "selected" : ""}>${result}</option>`).join("")}
          </select>
        </label>
        <label>时长秒数<input type="number" min="1" data-field="duration" value="${Number(item.duration)}" /></label>
        <label>破损情况
          <select data-field="damage">
            ${damageOptions.map((damage) => `<option value="${damage}" ${damage === item.damage ? "selected" : ""}>${damage}</option>`).join("")}
          </select>
        </label>
      </div>
      ${backupToggle}
      ${archive}
    </article>
  `;
}

function renderRepairOrders() {
  const orders = state.segments.filter((item) => item.repair);
  els.repairMeta.textContent = `共 ${orders.length} 单 · 待修 ${state.segments.filter(isPending).length} · 超期 ${state.segments.filter(isOverdue).length}`;
  els.repairList.innerHTML =
    orders.map(repairCard).join("") || `<p class="empty">当前没有修复工单，破损片段录入后会自动生成。</p>`;
}

function warningItem(item, text, cls) {
  return `
    <div class="warning-item ${cls}">
      <strong>${escapeHtml(item.code)}</strong>
      <span>${escapeHtml(text)}${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
    </div>
  `;
}

function renderWarnings() {
  const today = todayStr();
  const groups = [];

  const overdue = state.segments.filter(isOverdue);
  if (overdue.length) {
    groups.push(`
      <div class="warning-group">
        <h3>超期风险（${overdue.length}）</h3>
        ${overdue
          .map((item) =>
            warningItem(
              item,
              `预计 ${item.repair.dueDate} 完成，已超期 ${daysBetween(item.repair.dueDate, today)} 天｜负责人：${item.repair.assignee || "未指派"}｜处理结果：${item.repair.result}`,
              "overdue"
            )
          )
          .join("")}
      </div>`);
  }

  const pending = state.segments.filter((item) => isPending(item) && !isOverdue(item));
  if (pending.length) {
    groups.push(`
      <div class="warning-group">
        <h3>待修复 · 复检通过前不进入放映（${pending.length}）</h3>
        ${pending
          .map((item) => {
            const bits = [
              item.damage,
              `处理结果：${item.repair.result}`,
              `负责人：${item.repair.assignee || "未指派"}`,
              `预计：${item.repair.dueDate || "未定"}`
            ];
            if (item.repair.dueDate && daysBetween(today, item.repair.dueDate) >= 0 && daysBetween(today, item.repair.dueDate) <= 2) {
              bits.push("临近超期");
            }
            if (item.useBackup) bits.push("已用备用片段顶替");
            return warningItem(item, bits.join("｜"), "");
          })
          .join("")}
      </div>`);
  }

  const passed = state.segments.filter((item) => needsRepair(item) && hasValidPass(item));
  if (passed.length) {
    groups.push(`
      <div class="warning-group">
        <h3>已通过复检（${passed.length}）</h3>
        ${passed
          .map((item) => warningItem(item, `${item.damage}｜通过于 ${formatDateTime(item.pass.passedAt)}，可进入放映`, "passed"))
          .join("")}
      </div>`);
  }

  const shifts = state.segments.filter((item) => item.shift !== "正常");
  if (shifts.length) {
    groups.push(`
      <div class="warning-group">
        <h3>颜色偏移（${shifts.length}）</h3>
        ${shifts.map((item) => warningItem(item, item.shift, "")).join("")}
      </div>`);
  }

  els.warningList.innerHTML = groups.join("") || `<p class="empty">当前清单没有需要核对的事项。</p>`;
}

function renderAll() {
  saveState();
  els.reelTitle.value = state.reelTitle;
  renderStats();
  renderList();
  renderRepairOrders();
  renderWarnings();
}

// ---------- 工具 ----------

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayStr() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- 片段增删与排序 ----------

async function addSegment(event) {
  event.preventDefault();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  const damage = els.damageInput.value;
  state.segments.push(
    normalizeSegment({
      id: crypto.randomUUID(),
      code: els.codeInput.value.trim(),
      duration: Number(els.durationInput.value),
      shift: els.shiftInput.value,
      damage,
      note: els.noteInput.value.trim(),
      thumb
    })
  );
  els.segmentForm.reset();
  els.durationInput.value = 12;
  renderAll();
}

function moveSegment(id, direction) {
  const index = state.segments.findIndex((item) => item.id === id);
  if (index < 0) return;
  const group = isScreenable(state.segments[index]);
  let target = index + direction;
  while (target >= 0 && target < state.segments.length && isScreenable(state.segments[target]) !== group) {
    target += direction;
  }
  if (target < 0 || target >= state.segments.length) return;
  const [item] = state.segments.splice(index, 1);
  state.segments.splice(target, 0, item);
  renderAll();
}

function exportList() {
  const screenable = state.segments.filter(isScreenable);
  const pending = state.segments.filter(isPending);
  const overdue = state.segments.filter(isOverdue);
  const passed = state.segments.filter((item) => needsRepair(item) && hasValidPass(item));
  const archived = state.segments.flatMap((item) => item.passArchive.map((record) => ({ item, record })));
  const screenableSeconds = screenable.reduce((sum, item) => sum + Number(item.duration), 0);

  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `导出时间：${formatDateTime(nowIso())}`,
    `可放映时长：${formatDuration(screenableSeconds)}（${screenable.length} 段）`,
    `待修复：${pending.length} 段｜超期风险：${overdue.length} 段`,
    "",
    "可放映顺序：",
    ...screenable.map((item, index) => {
      const flags = [];
      if (item.useBackup && isPending(item)) {
        flags.push(
          `备用片段顶替（原片段修复中：${item.repair.assignee || "未指派"}，预计 ${item.repair.dueDate || "未定"}，处理结果：${item.repair.result}）`
        );
      }
      if (needsRepair(item) && hasValidPass(item)) flags.push("复检通过");
      return `${index + 1}. ${item.code}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}${flags.length ? `｜${flags.join("｜")}` : ""}｜${item.note || "无备注"}`;
    }),
    "",
    `待修复（复检通过前不进入放映，${pending.length} 段）：`,
    ...(pending.length
      ? pending.map(
          (item) =>
            `- ${item.code}｜${item.damage}｜负责人：${item.repair.assignee || "未指派"}｜预计完成：${item.repair.dueDate || "未定"}${
              isOverdue(item) ? `（已超期 ${daysBetween(item.repair.dueDate, todayStr())} 天）` : ""
            }｜处理结果：${item.repair.result}${item.useBackup ? "｜已用备用片段顶替" : ""}`
        )
      : ["无"]),
    "",
    `已通过复检（${passed.length} 段）：`,
    ...(passed.length
      ? passed.map((item) => `- ${item.code}｜${item.damage}｜通过时间：${formatDateTime(item.pass.passedAt)}｜通过时长：${item.pass.duration}秒`)
      : ["无"]),
    "",
    `已失效通过记录（留档，${archived.length} 条）：`,
    ...(archived.length
      ? archived.map(
          ({ item, record }) =>
            `- ${item.code}｜通过于 ${formatDateTime(record.passedAt)}｜失效于 ${formatDateTime(record.invalidatedAt)}｜原因：${record.reason}`
        )
      : ["无"])
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-checklist.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---------- 事件 ----------

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  saveState();
});
els.colorFilter.addEventListener("change", renderList);
els.searchInput.addEventListener("input", renderList);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.segmentGroups.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  if (up) moveSegment(up.dataset.moveUp, -1);
  if (down) moveSegment(down.dataset.moveDown, 1);
  if (remove) {
    state.segments = state.segments.filter((item) => item.id !== remove.dataset.delete);
    renderAll();
  }
});

els.segmentGroups.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentGroups.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentGroups.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  const dragged = findSegment(draggedId);
  const target = findSegment(card.dataset.id);
  if (!dragged || !target) return;
  // 只允许在同一分组（可放映 / 待修复）内排序
  if (isScreenable(dragged) !== isScreenable(target)) return;
  event.preventDefault();
  const fromIndex = state.segments.indexOf(dragged);
  const toIndex = state.segments.indexOf(target);
  const [item] = state.segments.splice(fromIndex, 1);
  state.segments.splice(toIndex, 0, item);
  renderAll();
});

// 负责人输入：只保存并刷新核对面板，不重渲染工单，避免输入中丢失焦点
els.repairList.addEventListener("input", (event) => {
  if (event.target.dataset.field !== "assignee") return;
  const segment = findSegment(event.target.closest("[data-id]")?.dataset.id);
  if (!segment || !segment.repair) return;
  segment.repair.assignee = event.target.value;
  segment.repair.updatedAt = nowIso();
  saveState();
  renderWarnings();
});

els.repairList.addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  if (!field) return;
  const segment = findSegment(event.target.closest("[data-id]")?.dataset.id);
  if (!segment) return;
  if (field === "dueDate" && segment.repair) {
    segment.repair.dueDate = event.target.value;
    segment.repair.updatedAt = nowIso();
  }
  if (field === "result") setRepairResult(segment, event.target.value);
  if (field === "duration") setSegmentDuration(segment, event.target.value);
  if (field === "damage") setSegmentDamage(segment, event.target.value);
  if (field === "useBackup") segment.useBackup = event.target.checked;
  renderAll();
});

renderAll();
