const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

// 三类可登记修复工单的破损：划痕、齿孔、接片
const repairableDamage = ["轻微划痕", "齿孔破损", "接片松动"];
const resultOptions = ["未完成", "待复检", "通过"];
const riskWindowMs = 24 * 60 * 60 * 1000;

const defaultState = {
  reelTitle: "春日试映A卷",
  segments: [
    {
      id: crypto.randomUUID(),
      code: "A-001",
      duration: 18,
      shift: "正常",
      damage: "完好",
      note: "开场街景，节奏平稳，适合保留原顺序。",
      thumb: "",
      workOrder: null,
      inspections: [],
      backupId: null,
      originalId: null
    },
    {
      id: crypto.randomUUID(),
      code: "A-006",
      duration: 9,
      shift: "偏红",
      damage: "轻微划痕",
      note: "人物近景左侧有划痕，试映时留意是否明显。",
      thumb: "",
      // 已登记工单，预计完成时间已过，用于演示超期风险
      workOrder: { owner: "周师傅", dueAt: "2026-09-25T18:00", result: "未完成" },
      inspections: [],
      backupId: null,
      originalId: null
    },
    {
      id: crypto.randomUUID(),
      code: "A-012",
      duration: 14,
      shift: "褪色",
      damage: "接片松动",
      note: "接片位置靠近段尾，放映前建议重新压平。",
      thumb: "",
      workOrder: null,
      inspections: [],
      backupId: null,
      originalId: null
    },
    {
      id: crypto.randomUUID(),
      code: "A-020",
      duration: 11,
      shift: "正常",
      damage: "齿孔破损",
      note: "齿孔已补齐并复检通过，可正常放映。",
      thumb: "",
      workOrder: { owner: "林姐", dueAt: "2026-09-24T17:00", result: "通过" },
      inspections: [
        {
          passedAt: "2026-09-24T16:40",
          owner: "林姐",
          dueAt: "2026-09-24T17:00",
          durationSnapshot: 11,
          damageSnapshot: "齿孔破损",
          status: "valid",
          invalidatedAt: null,
          invalidatedReason: ""
        }
      ],
      backupId: null,
      originalId: null
    },
    {
      id: crypto.randomUUID(),
      code: "A-023",
      duration: 12,
      shift: "偏黄",
      damage: "轻微划痕",
      note: "重新剪辑后时长变化，旧的复检通过记录已失效，需要重新复检。",
      thumb: "",
      workOrder: { owner: "周师傅", dueAt: "2026-09-27T12:00", result: "未完成" },
      inspections: [
        {
          passedAt: "2026-09-22T15:10",
          owner: "周师傅",
          dueAt: "2026-09-22T18:00",
          durationSnapshot: 15,
          damageSnapshot: "轻微划痕",
          status: "invalidated",
          invalidatedAt: "2026-09-25T10:05",
          invalidatedReason: "片段时长由 15 秒变为 12 秒"
        }
      ],
      backupId: null,
      originalId: null
    },
    {
      id: crypto.randomUUID(),
      code: "A-030",
      duration: 7,
      shift: "正常",
      damage: "需跳过",
      note: "片门磨损严重段，本场试映暂不排入。",
      thumb: "",
      workOrder: null,
      inspections: [],
      backupId: null,
      originalId: null
    }
  ]
};

let state = loadState();
let draggedId = null;
let editingId = null;

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
  segmentList: document.querySelector("#segmentList"),
  repairList: document.querySelector("#repairList"),
  warningList: document.querySelector("#warningList"),
  totalDuration: document.querySelector("#totalDuration"),
  pendingCount: document.querySelector("#pendingCount"),
  riskCount: document.querySelector("#riskCount"),
  segmentCount: document.querySelector("#segmentCount"),
  exportBtn: document.querySelector("#exportBtn"),
  editModal: document.querySelector("#editModal"),
  editForm: document.querySelector("#editForm"),
  editModalHint: document.querySelector("#editModalHint"),
  editCode: document.querySelector("#editCode"),
  editDuration: document.querySelector("#editDuration"),
  editShift: document.querySelector("#editShift"),
  editDamage: document.querySelector("#editDamage"),
  editNote: document.querySelector("#editNote"),
  editCancel: document.querySelector("#editCancel")
};

function migrateSegment(segment) {
  return {
    workOrder: null,
    inspections: [],
    backupId: null,
    originalId: null,
    ...segment
  };
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    const merged = { ...structuredClone(defaultState), ...parsed };
    merged.segments = (merged.segments || []).map(migrateSegment);
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function nowLocalInputValue() {
  const d = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getSegment(id) {
  return state.segments.find((item) => item.id === id) || null;
}

function getValidPass(item) {
  return (item.inspections || []).find((record) => record.status === "valid") || null;
}

// 复检闸口：需跳过永不入序；划痕/齿孔/接片问题必须持有有效的复检通过记录
function canScreen(item) {
  if (item.damage === "需跳过") return false;
  if (repairableDamage.includes(item.damage) && !getValidPass(item)) return false;
  return true;
}

// 待修：存在三类破损且没有有效通过记录（含已登记但未完成、以及通过记录已失效）
function isPending(item) {
  return repairableDamage.includes(item.damage) && !getValidPass(item);
}

function getRiskState(item) {
  const order = item.workOrder;
  if (!order || !order.dueAt) return "";
  const due = Date.parse(order.dueAt);
  if (Number.isNaN(due)) return "";
  if (due <= Date.now()) return "overdue";
  if (due <= Date.now() + riskWindowMs) return "soon";
  return "";
}

function getFilteredSegments() {
  const color = els.colorFilter.value;
  const keyword = els.searchInput.value.trim();
  return state.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const matchesKeyword = !keyword || `${item.code}${item.note}${item.damage}`.includes(keyword);
    return matchesColor && matchesKeyword;
  });
}

function renderStats() {
  const screenable = state.segments.filter(canScreen);
  const pending = state.segments.filter(isPending);
  const risk = pending.filter((item) => getRiskState(item) !== "");
  const total = screenable.reduce((sum, item) => sum + Number(item.duration), 0);
  els.totalDuration.textContent = formatDuration(total);
  els.segmentCount.textContent = screenable.length;
  els.pendingCount.textContent = pending.length;
  els.riskCount.textContent = risk.length;
  els.riskCount.classList.toggle("danger-number", risk.length > 0);
}

function thumbHtml(item, label) {
  if (item.thumb) {
    return `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`;
  }
  const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
  return `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(label || item.code)}</div>`;
}

function passBadgeHtml(item) {
  const pass = getValidPass(item);
  if (!pass) return "";
  return `<span class="tag pass" title="复检通过时间 ${formatDateTime(pass.passedAt)}｜负责人 ${escapeHtml(pass.owner)}">复检通过 ${formatDateTime(pass.passedAt).slice(5)}</span>`;
}

function backupBadgeHtml(item) {
  if (item.originalId) {
    const original = getSegment(item.originalId);
    return `<span class="tag backup">备用片段</span><span class="inline-hint">顶替原片 ${escapeHtml(original ? original.code : item.code)}</span>`;
  }
  if (item.backupId) {
    return `<span class="tag used-backup">已启用备用</span><span class="inline-hint">原片保留修复进度</span>`;
  }
  return "";
}

function renderScreenList() {
  const segments = getFilteredSegments().filter(canScreen);
  els.segmentList.innerHTML =
    segments
      .map((item, index) => {
        const hasDamage = item.damage !== "完好";
        return `
          <article class="segment-card" draggable="true" data-id="${item.id}">
            <div class="thumb">${thumbHtml(item)}</div>
            <div class="segment-main">
              <div class="segment-title">
                <strong>${index + 1}. ${escapeHtml(item.code)}</strong>
                <span>${formatDuration(item.duration)}</span>
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
                ${passBadgeHtml(item)}
                ${backupBadgeHtml(item)}
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
            </div>
            <div class="segment-actions">
              <button type="button" title="上移" data-move-up="${item.id}">↑</button>
              <button type="button" title="下移" data-move-down="${item.id}">↓</button>
              <button type="button" title="编辑片段" data-edit="${item.id}">改</button>
              <button type="button" title="删除" data-delete="${item.id}">×</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有可放映片段：划痕、齿孔或接片问题需复检通过后才会进入这里。</p>`;
}

function workOrderFormHtml(item) {
  const order = item.workOrder;
  const risk = getRiskState(item);
  const riskBadge =
    risk === "overdue"
      ? `<span class="tag risk">已超期</span>`
      : risk === "soon"
        ? `<span class="tag risk-soon">24小时内到期</span>`
        : "";
  const archived = (item.inspections || [])
    .filter((record) => record.status === "invalidated")
    .map(
      (record) => `
        <div class="archive-item">
          <span class="tag invalid">旧通过记录已失效</span>
          <span class="archive-text">${formatDateTime(record.passedAt)} 曾通过（${escapeHtml(record.owner)}），${escapeHtml(record.invalidatedReason || "记录失效")}；${formatDateTime(record.invalidatedAt)} 失效留档</span>
        </div>`
    )
    .join("");
  const options = resultOptions
    .map((value) => `<option value="${value}" ${order && order.result === value ? "selected" : ""}>${value}</option>`)
    .join("");
  return `
    <div class="work-order">
      ${order ? `<div class="work-head"><strong>修复工单</strong>${riskBadge}</div>` : ""}
      <div class="work-grid">
        <label>
          负责人
          <input type="text" data-wo="owner" value="${escapeHtml(order ? order.owner : "")}" placeholder="负责人姓名" />
        </label>
        <label>
          预计完成时间
          <input type="datetime-local" data-wo="dueAt" value="${escapeHtml(order ? order.dueAt : "")}" />
        </label>
        <label>
          处理结果
          <select data-wo="result">${options}</select>
        </label>
      </div>
      <div class="work-actions">
        <button type="button" class="primary" data-save-wo="${item.id}">${order ? "保存工单" : "登记工单"}</button>
        ${
          !item.backupId && !item.originalId
            ? `<button type="button" data-backup="${item.id}">启用备用片段</button>`
            : ""
        }
      </div>
      <span class="work-error" data-wo-error="${item.id}"></span>
      ${archived}
    </div>`;
}

function renderRepairQueue() {
  const pending = getFilteredSegments().filter(isPending);
  els.repairList.innerHTML =
    pending
      .map((item) => {
        const risk = getRiskState(item);
        return `
          <article class="repair-card ${risk === "overdue" ? "is-overdue" : ""}" data-id="${item.id}">
            <div class="thumb">${thumbHtml(item)}</div>
            <div class="repair-main">
              <div class="segment-title">
                <strong>${escapeHtml(item.code)}</strong>
                <span>${formatDuration(item.duration)}</span>
                <span class="tag damage">${escapeHtml(item.damage)}</span>
                <span class="tag">${escapeHtml(item.shift)}</span>
                ${
                  risk === "overdue"
                    ? `<span class="tag risk">已超期</span>`
                    : risk === "soon"
                      ? `<span class="tag risk-soon">24小时内到期</span>`
                      : ""
                }
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
              ${workOrderFormHtml(item)}
            </div>
            <div class="segment-actions">
              <button type="button" title="编辑片段" data-edit="${item.id}">改</button>
              <button type="button" title="删除" data-delete="${item.id}">×</button>
            </div>
          </article>`;
      })
      .join("") || `<p class="empty">当前没有待修片段。</p>`;
}

function renderWarnings() {
  const pending = state.segments.filter(isPending);
  const skipped = state.segments.filter((item) => item.damage === "需跳过");
  const shifted = state.segments.filter(
    (item) => item.shift !== "正常" && item.damage !== "需跳过" && !isPending(item)
  );

  const sections = [];

  if (pending.length) {
    sections.push(`
      <div class="warning-group">
        <h3>待修复 · 未进入放映顺序（${pending.length}）</h3>
        ${pending
          .map((item) => {
            const order = item.workOrder;
            const risk = getRiskState(item);
            const riskText =
              risk === "overdue"
                ? ` <strong class="risk-text">已超期</strong>`
                : risk === "soon"
                  ? ` <strong class="risk-soon-text">24小时内到期</strong>`
                  : "";
            const orderText = order
              ? `负责人 ${escapeHtml(order.owner || "未填")}｜预计 ${formatDateTime(order.dueAt)}｜${escapeHtml(order.result)}`
              : "尚未登记工单";
            return `<div class="warning-item"><strong>${escapeHtml(item.code)} · ${escapeHtml(item.damage)}${riskText}</strong><span>${orderText}</span></div>`;
          })
          .join("")}
      </div>`);
  }

  if (skipped.length) {
    sections.push(`
      <div class="warning-group">
        <h3>需跳过（${skipped.length}）</h3>
        ${skipped
          .map(
            (item) => `
            <div class="warning-item">
              <strong>${escapeHtml(item.code)}</strong>
              <span>不排入场次${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
            </div>`
          )
          .join("")}
      </div>`);
  }

  if (shifted.length) {
    sections.push(`
      <div class="warning-group">
        <h3>颜色偏移（${shifted.length}）</h3>
        ${shifted
          .map(
            (item) => `
            <div class="warning-item">
              <strong>${escapeHtml(item.code)} · ${escapeHtml(item.shift)}</strong>
              <span>${escapeHtml(item.note || "试映时留意颜色表现。")}</span>
            </div>`
          )
          .join("")}
      </div>`);
  }

  els.warningList.innerHTML = sections.join("") || `<p class="empty">当前清单没有待修、跳过或颜色偏移提醒。</p>`;
}

function renderAll() {
  saveState();
  els.reelTitle.value = state.reelTitle;
  renderStats();
  renderScreenList();
  renderRepairQueue();
  renderWarnings();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
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

// 让旧的有效通过记录失效，但保留在复检留档中
function invalidatePass(item, reason) {
  const record = getValidPass(item);
  if (!record) return;
  record.status = "invalidated";
  record.invalidatedAt = nowLocalInputValue();
  record.invalidatedReason = reason;
}

async function addSegment(event) {
  event.preventDefault();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  state.segments.push({
    id: crypto.randomUUID(),
    code: els.codeInput.value.trim(),
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    note: els.noteInput.value.trim(),
    thumb,
    workOrder: null,
    inspections: [],
    backupId: null,
    originalId: null
  });
  els.segmentForm.reset();
  els.durationInput.value = 12;
  renderAll();
}

function readWorkOrderForm(id) {
  const card = els.repairList.querySelector(`[data-id="${id}"]`);
  if (!card) return null;
  return {
    owner: card.querySelector('[data-wo="owner"]').value.trim(),
    dueAt: card.querySelector('[data-wo="dueAt"]').value,
    result: card.querySelector('[data-wo="result"]').value
  };
}

function setWorkOrderError(id, message) {
  const errorEl = els.repairList.querySelector(`[data-wo-error="${id}"]`);
  if (errorEl) errorEl.textContent = message;
}

function saveWorkOrder(id) {
  const item = getSegment(id);
  if (!item) return;
  const form = readWorkOrderForm(id);
  if (!form.owner || !form.dueAt) {
    setWorkOrderError(id, "请先填写负责人和预计完成时间。");
    return;
  }
  setWorkOrderError(id, "");

  const previous = item.workOrder;
  item.workOrder = form;

  if (form.result === "通过") {
    // 重新通过复检：旧记录（若还在有效状态）先留档，再写一条新的通过记录
    if (getValidPass(item)) {
      invalidatePass(item, "重新登记复检通过");
    }
    item.inspections.push({
      passedAt: nowLocalInputValue(),
      owner: form.owner,
      dueAt: form.dueAt,
      durationSnapshot: Number(item.duration),
      damageSnapshot: item.damage,
      status: "valid",
      invalidatedAt: null,
      invalidatedReason: ""
    });
  } else if (previous && previous.result === "通过") {
    // 处理结果回到未完成 / 待复检：旧通过记录失效并留档
    invalidatePass(item, `处理结果改回「${form.result}」`);
  }
  renderAll();
}

function enableBackup(id) {
  const original = getSegment(id);
  if (!original || original.backupId || original.originalId) return;
  const insertAt = state.segments.findIndex((item) => item.id === id) + 1;
  const backup = {
    id: crypto.randomUUID(),
    code: `${original.code}-备`,
    duration: Number(original.duration),
    shift: original.shift,
    damage: "完好",
    note: `备用片段，顶替原片段 ${original.code} 进入放映顺序。`,
    thumb: "",
    workOrder: null,
    inspections: [],
    backupId: null,
    originalId: original.id
  };
  original.backupId = backup.id;
  state.segments.splice(insertAt, 0, backup);
  renderAll();
}

function deleteSegment(id) {
  const item = getSegment(id);
  if (!item) return;
  // 删除原片段：备用片段脱离关联继续留在放映顺序
  if (item.backupId) {
    const backup = getSegment(item.backupId);
    if (backup) {
      backup.originalId = null;
      backup.note = `原片段 ${item.code} 已删除，本备用片段继续保留在放映顺序。`;
    }
  }
  // 删除备用片段：原片段的修复进度照常保留
  if (item.originalId) {
    const original = getSegment(item.originalId);
    if (original) original.backupId = null;
  }
  state.segments = state.segments.filter((segment) => segment.id !== id);
  renderAll();
}

// 在可放映顺序内部（跳过不可放映片段）上下移动
function moveScreenable(id, direction) {
  const screenable = state.segments.filter(canScreen);
  const index = screenable.findIndex((item) => item.id === id);
  const swapWith = screenable[index + direction];
  if (index < 0 || !swapWith) return;
  const masterFrom = state.segments.findIndex((item) => item.id === id);
  const masterTo = state.segments.findIndex((item) => item.id === swapWith.id);
  const [moved] = state.segments.splice(masterFrom, 1);
  state.segments.splice(masterTo, 0, moved);
  renderAll();
}

function openEditModal(id) {
  const item = getSegment(id);
  if (!item) return;
  editingId = id;
  els.editCode.value = item.code;
  els.editDuration.value = item.duration;
  els.editShift.value = item.shift;
  els.editDamage.value = item.damage;
  els.editNote.value = item.note || "";
  const pass = getValidPass(item);
  els.editModalHint.textContent = pass
    ? "注意：通过复检后修改时长或再次标为破损，旧通过记录将失效并留档。"
    : "修改片段信息。";
  els.editModal.hidden = false;
}

function closeEditModal() {
  editingId = null;
  els.editModal.hidden = true;
}

function saveEdit(event) {
  event.preventDefault();
  const item = getSegment(editingId);
  if (!item) {
    closeEditModal();
    return;
  }
  const nextDuration = Number(els.editDuration.value);
  const nextDamage = els.editDamage.value;
  const reasons = [];

  if (getValidPass(item)) {
    if (nextDuration !== Number(item.duration)) {
      reasons.push(`片段时长由 ${item.duration} 秒变为 ${nextDuration} 秒`);
    }
    if (nextDamage !== item.damage) {
      reasons.push(`破损情况由「${item.damage}」改标为「${nextDamage}」`);
    }
    if (reasons.length) invalidatePass(item, reasons.join("；"));
  }

  item.code = els.editCode.value.trim();
  item.duration = nextDuration;
  item.shift = els.editShift.value;
  item.damage = nextDamage;
  item.note = els.editNote.value.trim();
  closeEditModal();
  renderAll();
}

function describeSegmentLine(item) {
  const order = item.workOrder;
  const pass = getValidPass(item);
  const parts = [
    `${item.code}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}`,
    order
      ? `负责人：${order.owner || "未填"}｜预计完成：${formatDateTime(order.dueAt)}｜处理结果：${order.result}`
      : "未登记修复工单"
  ];
  if (pass) parts.push(`复检通过：${formatDateTime(pass.passedAt)}（${pass.owner}）`);
  if (item.originalId) {
    const original = getSegment(item.originalId);
    parts.push(`备用片段，原片 ${original ? original.code : ""} 仍保留修复进度`);
  }
  const invalidated = (item.inspections || []).filter((record) => record.status === "invalidated");
  invalidated.forEach((record) => {
    parts.push(
      `失效留档：${formatDateTime(record.passedAt)} 曾通过（${record.owner}），${record.invalidatedReason || "记录失效"}，${formatDateTime(record.invalidatedAt)} 失效`
    );
  });
  parts.push(item.note || "无备注");
  return parts.join("｜");
}

function exportList() {
  const screenable = state.segments.filter(canScreen);
  const pending = state.segments.filter(isPending);
  const skipped = state.segments.filter((item) => item.damage === "需跳过");
  const risk = pending.filter((item) => getRiskState(item) !== "");
  const total = screenable.reduce((sum, item) => sum + Number(item.duration), 0);

  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `导出时间：${formatDateTime(nowLocalInputValue())}`,
    `可放映总时长：${formatDuration(total)}（${screenable.length} 段）｜待修数量：${pending.length}｜超期风险：${risk.length}`,
    "",
    "【可放映顺序】",
    ...(screenable.length
      ? screenable.map((item, index) => `${index + 1}. ${describeSegmentLine(item)}`)
      : ["（暂无通过复检、可以放映的片段）"]),
    "",
    "【待修片段 · 未进入放映顺序】",
    ...(pending.length ? pending.map((item) => `· ${describeSegmentLine(item)}`) : ["（无）"]),
    "",
    "【需跳过】",
    ...(skipped.length ? skipped.map((item) => `· ${describeSegmentLine(item)}`) : ["（无）"])
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-checklist.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  saveState();
});
els.colorFilter.addEventListener("change", renderAll);
els.searchInput.addEventListener("input", () => {
  renderScreenList();
  renderRepairQueue();
});
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  if (up) moveScreenable(up.dataset.moveUp, -1);
  if (down) moveScreenable(down.dataset.moveDown, 1);
  if (edit) openEditModal(edit.dataset.edit);
  if (remove) deleteSegment(remove.dataset.delete);
});

els.repairList.addEventListener("click", (event) => {
  const save = event.target.closest("[data-save-wo]");
  const backup = event.target.closest("[data-backup]");
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  if (save) saveWorkOrder(save.dataset.saveWo);
  if (backup) enableBackup(backup.dataset.backup);
  if (edit) openEditModal(edit.dataset.edit);
  if (remove) deleteSegment(remove.dataset.delete);
});

els.editForm.addEventListener("submit", saveEdit);
els.editCancel.addEventListener("click", closeEditModal);
els.editModal.addEventListener("click", (event) => {
  if (event.target === els.editModal) closeEditModal();
});

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  // 只允许在可放映顺序内部重排
  if (!canScreen(getSegment(draggedId)) || !canScreen(getSegment(card.dataset.id))) return;
  event.preventDefault();
  const fromIndex = state.segments.findIndex((item) => item.id === draggedId);
  const toIndex = state.segments.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = state.segments.splice(fromIndex, 1);
  state.segments.splice(toIndex, 0, item);
  renderAll();
});

renderAll();
