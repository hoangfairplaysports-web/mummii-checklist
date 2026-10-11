// Dự án (Mummii): MV / phim ngắn / TVC, chiến dịch truyền thông, booking KOL/KOC, khoá đào tạo.
// - Checklist theo giai đoạn của từng loại dự án (mọi người được CEO cho phép xem; người phụ trách cập nhật việc của mình)
// - Phần tiền (thu tiền khách, nhà cung cấp, phát sinh, nghiệm thu, hồ sơ, vòng sửa vượt mức): CHỈ CEO / Quản trị
import { html, Modal, Bar, Seg, Empty, ConfirmButton } from './ui.js';
import { useState, useEffect } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions, LIVE, getSb, loadLive } from './store.js';
import { PROJECT_TYPES, generateProject, defaultPayments, eventHealth, money, addDays, dLabel, parseChecklistFile, fold } from './ev-core.js';
import * as U from './util.js';

const EV_STATUS = { preparing: 'Đang chuẩn bị', running: 'Đang thực hiện', done: 'Đã xong', cancelled: 'Đã huỷ' };
const SUP_STATUS = { unpaid: 'Chưa trả', partial: 'Trả một phần', paid: 'Đã trả', none: 'Không qua NCC' };
const ACC = { pending: 'Chưa nghiệm thu', ok: 'Đạt', issue: 'Có vấn đề' };
const STATUS_BTNS = [['todo', '⬜', 'Chưa'], ['doing', '🔄', 'Đang làm'], ['blocked', '🚧', 'Vướng'], ['done', '✅', 'Xong']];
const today = () => U.todayStr();
const n = (v) => (v === '' || v == null ? null : Number(v));
const uuid = () => U.uid();
const typeOf = (ev) => PROJECT_TYPES[ev?.type] || PROJECT_TYPES.other;
const fmtDateTime = (iso) => (iso ? `${U.fmtTime(iso)} ${U.fmtShort(U.dateStr(new Date(iso)))}` : '');
const ok = ({ data, error }) => {
  if (error) throw new Error(/row-level security|permission/i.test(error.message) ? 'Bạn không có quyền thao tác này' : error.message);
  return data;
};

export function projectStats(state, ev, meId) {
  const t = state.ev_tasks.filter((x) => x.event_id === ev.id);
  const done = t.filter((x) => x.status === 'done').length;
  return {
    total: t.length, done, pct: t.length ? Math.round((done / t.length) * 100) : 0,
    overdue: t.filter((x) => x.status !== 'done' && x.due_date && x.due_date < today()).length,
    blocked: t.filter((x) => x.status === 'blocked').length,
    mine: t.filter((x) => x.pic_id === meId && x.status !== 'done').length,
  };
}

// ---------------------------------------------------------------------------
export function ProjectsView({ ctx }) {
  const { state, me } = ctx;
  const isAdmin = me.role === 'admin';
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState('active');
  const [creating, setCreating] = useState(false);
  const [moneyData, setMoney] = useState(null); // dữ liệu tiền (chỉ admin, bản thật)

  async function loadMoney() {
    if (!isAdmin || !LIVE) return setMoney({ items: [], payments: [], suppliers: [] });
    const sb = getSb();
    const [items, payments, suppliers] = await Promise.all([
      sb.from('ev_items').select('*').order('sort').then(ok),
      sb.from('ev_payments').select('*').order('sort').then(ok),
      sb.from('ev_suppliers').select('*').order('name').then(ok),
    ]).catch((e) => (ctx.notify(e.message, 'err'), [[], [], []]));
    setMoney({ items, payments, suppliers });
  }
  useEffect(() => {
    loadMoney();
  }, []);
  const reload = async () => {
    if (LIVE) await loadLive();
    await loadMoney();
  };

  const evs = (state.events || []).filter((e) => (tab === 'done' ? ['done', 'cancelled'].includes(e.status) : !['done', 'cancelled'].includes(e.status)))
    .sort((a, b) => (a.event_date || '9').localeCompare(b.event_date || '9'));
  const open = (state.events || []).find((e) => e.id === openId);
  const data = { ...(moneyData || { items: [], payments: [], suppliers: [] }), tasks: state.ev_tasks, members: state.people };
  if (open) return html`<${ProjectDetail} ctx=${ctx} ev=${open} data=${data} reload=${reload} onBack=${() => setOpenId(null)} />`;

  return html`<div class="page">
    <div class="page-head">
      <div><h1>🎬 Dự án</h1><div class="muted">${isAdmin ? `Hiển thị cho: ${{ admin: 'chỉ CEO / Quản trị', managers: 'CEO + quản lý nhóm', all: 'mọi người' }[state.settings.projects_visible || 'admin']} (đổi ở Cài đặt → Giờ làm & quyền)` : 'Checklist các dự án đang thực hiện'}</div></div>
      <div class="row">
        <${Seg} value=${tab} onChange=${setTab} options=${[{ id: 'active', label: 'Đang làm' }, { id: 'done', label: 'Đã xong' }, ...(isAdmin ? [{ id: 'suppliers', label: 'Nhà cung cấp' }] : [])]} />
        ${isAdmin && html`<button class="btn primary" onClick=${() => setCreating(true)}>+ Dự án mới</button>`}
      </div>
    </div>
    ${tab === 'suppliers' ? (LIVE ? html`<${Suppliers} ctx=${ctx} data=${data} reload=${reload} />` : html`<${Empty}>Danh bạ nhà cung cấp chỉ có ở bản thật.</${Empty}>`) : html`
      ${!evs.length && html`<${Empty}>${tab === 'active' ? (isAdmin ? 'Chưa có dự án. Bấm "+ Dự án mới" khi chốt với khách.' : 'Chưa có dự án nào.') : 'Chưa có dự án đã xong.'}</${Empty}>`}
      <div class="pgrid wide">${evs.map((e) => {
        const s = projectStats(state, e, me.id);
        const T = typeOf(e);
        const d = e.event_date ? U.diffDays(today(), e.event_date) : null;
        const h = isAdmin && moneyData ? eventHealth(e, data, today()) : null;
        return html`<div class="pcard evcard" onClick=${() => setOpenId(e.id)}>
          <div class="row between"><b class="evname">${T.icon} ${e.name}</b>
            ${d != null && html`<span class=${'badge ' + (d < 0 ? '' : d <= 3 ? 'bad' : d <= 10 ? 'warn' : 'info')}>${d < 0 ? 'Đã qua mốc' : d === 0 ? 'Hôm nay' : 'Còn ' + d + ' ngày'}</span>`}</div>
          <div class="muted small">${[T.label, e.client_name, e.event_date && `${T.anchor}: ${U.fmtShort(e.event_date)}`].filter(Boolean).join(' · ')}</div>
          <div><div class="row between small"><span>${s.done}/${s.total} việc xong</span><b>${s.pct}%</b></div><${Bar} pct=${s.pct} cls="brand" /></div>
          <div class="row small gap">
            ${s.overdue > 0 && html`<span class="badge bad">${s.overdue} quá hạn</span>`}
            ${s.blocked > 0 && html`<span class="badge bad">🚧 ${s.blocked} vướng</span>`}
            ${s.mine > 0 && html`<span class="badge info">${s.mine} việc của tôi</span>`}
            ${e.revisions_used > e.revisions_included && html`<span class="badge warn">Sửa ${e.revisions_used}/${e.revisions_included} vòng</span>`}
            ${h && h.warn.map((w) => html`<span class="badge bad">${w}</span>`)}
          </div>
        </div>`;
      })}</div>`}
    ${creating && html`<${NewProject} ctx=${ctx} onClose=${() => setCreating(false)} onDone=${async (id) => { setCreating(false); await reload(); setOpenId(id); }} />`}
  </div>`;
}

// ---------------------------------------------------------------------------
function NewProject({ ctx, onClose, onDone }) {
  const { state } = ctx;
  const staff = state.people.filter((p) => p.active !== false && p.role !== 'bod');
  const [f, setF] = useState({ type: 'video', name: '', client_name: '', client_contact: '', event_date: '', shoot_date: '', pm_id: ctx.me.id, total: '', pay1: 50,
    contract_signed_at: today(), contract_deadline: '', revisions_included: 2, notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const T = PROJECT_TYPES[f.type];
  async function create(e) {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Nhập tên dự án');
    if (!f.event_date) return setErr(`Nhập ${T.anchor.toLowerCase()} để tính hạn các việc`);
    setBusy(true);
    setErr('');
    try {
      const id = uuid();
      const total = n(f.total) || 0;
      const p1 = Number(f.pay1) || 50;
      const pays = total ? defaultPayments(total, f.event_date).map((p, i) => ({ ...p, id: uuid(), event_id: id,
        label: i === 0 ? `Đợt 1 — cọc ${p1}%` : `Đợt 2 — ${100 - p1}% còn lại`, percent: i === 0 ? p1 : 100 - p1,
        amount: i === 0 ? Math.round((total * p1) / 100) : total - Math.round((total * p1) / 100),
        due_date: i === 0 ? f.contract_signed_at || today() : addDays(f.event_date, 3), due_rule: i === 0 ? 'Khi ký hợp đồng' : 'Trong 3 ngày sau nghiệm thu',
        offset_days: i === 0 ? -28 : 3 })) : [];
      const tasks = generateProject({ type: f.type, anchor: f.event_date, shoot: f.shoot_date || null, today: today(), payments: pays, contractSigned: !!f.contract_signed_at })
        .map((t) => ({ ...t, id: uuid(), event_id: id, pic_id: f.pm_id || null }));
      const ev = { id, type: f.type, name: f.name.trim(), client_name: f.client_name || null, client_contact: f.client_contact || null, event_date: f.event_date,
        shoot_date: f.shoot_date || null, pm_id: f.pm_id || null, contract_signed_at: f.contract_signed_at || null, contract_deadline: f.contract_deadline || null,
        revisions_included: Number(f.revisions_included) || 0, revisions_used: 0, quote_total: total || null, notes: f.notes || null, status: 'preparing' };
      if (LIVE) {
        const sb = getSb();
        ok(await sb.from('ev_events').insert(ev));
        if (pays.length) ok(await sb.from('ev_payments').insert(pays.map(({ offset_days, ...p }) => p)));
        const cols = ['id', 'event_id', 'phase', 'category', 'title', 'detail', 'pic_id', 'offset_days', 'due_date', 'status', 'note', 'sort'];
        ok(await sb.from('ev_tasks').insert(tasks.map((t) => Object.fromEntries(cols.map((c) => [c, t[c] ?? null])))));
      } else {
        const st = (await import('./store.js')).getState();
        st.events.push(ev);
        st.ev_tasks.push(...tasks);
      }
      ctx.notify(`Đã tạo dự án với ${tasks.length} việc`);
      onDone(id);
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }
  return html`<${Modal} title="Dự án mới" onClose=${onClose} wide>
    <form class="form" onSubmit=${create}>
      <div class="chips">${Object.entries(PROJECT_TYPES).map(([k, t]) => html`<button type="button" class=${'chip ' + (f.type === k ? 'on' : '')} onClick=${() => setF({ ...f, type: k })}>${t.icon} ${t.label}</button>`)}</div>
      <p class="muted small">Checklist mẫu: ${Object.values(T.phases).join(' → ')} · ${T.tasks.length + 1} việc, hạn tính theo ${T.anchor.toLowerCase()}.</p>
      <div class="grid2">
        <label>Tên dự án *<input id="p-name" value=${f.name} onInput=${set('name')} placeholder="VD: MV 'Mùa hè' – ca sĩ A" /></label>
        <label>${T.anchor} *<input id="p-date" type="date" value=${f.event_date} onInput=${set('event_date')} /></label>
        ${f.type === 'video' && html`<label>Ngày quay <span class="muted small">(trống = trước 14 ngày)</span><input id="p-shoot" type="date" value=${f.shoot_date} onInput=${set('shoot_date')} /></label>`}
        <label>Khách hàng<input id="p-client" value=${f.client_name} onInput=${set('client_name')} /></label>
        <label>Đầu mối phía khách<input id="p-contact" value=${f.client_contact} onInput=${set('client_contact')} placeholder="Tên — SĐT" /></label>
        <label>Người phụ trách (PM)<select id="p-pm" value=${f.pm_id} onChange=${set('pm_id')}>${staff.map((p) => html`<option value=${p.id}>${p.full_name}</option>`)}</select></label>
        <label>Giá trị hợp đồng (đ)<input id="p-total" type="number" value=${f.total} onInput=${set('total')} placeholder="Để trống nếu chưa có" /></label>
        <label>Đợt 1 (cọc) %<input id="p-pay1" type="number" min="0" max="100" value=${f.pay1} onInput=${set('pay1')} /></label>
        <label>Ngày ký hợp đồng<input id="p-signed" type="date" value=${f.contract_signed_at} onInput=${set('contract_signed_at')} /></label>
        <label>Hạn ký HĐ (nếu chưa ký)<input id="p-deadline" type="date" value=${f.contract_deadline} onInput=${set('contract_deadline')} /></label>
        ${f.type === 'video' && html`<label>Số vòng sửa trong báo giá<input id="p-rev" type="number" min="0" value=${f.revisions_included} onInput=${set('revisions_included')} /></label>`}
      </div>
      <label>Ghi chú<textarea id="p-notes" rows="2" value=${f.notes} onInput=${set('notes')}></textarea></label>
      ${err && html`<div class="err">${err}</div>`}
      <div class="row end"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary" disabled=${busy}>${busy ? 'Đang tạo…' : 'Tạo dự án & checklist'}</button></div>
    </form>
  </${Modal}>`;
}

// ---------------------------------------------------------------------------
function ProjectDetail({ ctx, ev, data, reload, onBack }) {
  const { me } = ctx;
  const isAdmin = me.role === 'admin';
  const [tab, setTab] = useState('checklist');
  const T = typeOf(ev);
  const h = eventHealth(ev, data, today());
  const d = ev.event_date ? U.diffDays(today(), ev.event_date) : null;
  const TABS = [['checklist', 'Checklist'], ...(isAdmin ? [['overview', 'Tổng quan'], ['pay', 'Thu tiền khách'], ['items', 'Hạng mục & NCC'], ['extra', 'Phát sinh'], ['accept', 'Nghiệm thu'], ['files', 'Hồ sơ']] : [])];
  const needLive = (el) => (LIVE ? el : html`<${Empty}>Phần tiền & hồ sơ chỉ có ở bản thật.</${Empty}>`);
  return html`<div class="page">
    <div class="page-head">
      <div>
        <button class="link" onClick=${onBack}>‹ Tất cả dự án</button>
        <h1>${T.icon} ${ev.name}</h1>
        <div class="muted">${[T.label, ev.client_name, ev.event_date && `${T.anchor}: ${U.fmtDayLong(ev.event_date)}${d != null ? (d >= 0 ? ` (còn ${d} ngày)` : ' (đã qua)') : ''}`].filter(Boolean).join(' · ')}</div>
        <div class="row" style="margin-top:6px">${isAdmin && h.warn.map((w) => html`<span class="badge bad">${w}</span>`)}</div>
      </div>
      ${isAdmin && html`<select value=${ev.status} onChange=${(e) => actions.saveEvent(ev.id, { status: e.target.value })}>${Object.entries(EV_STATUS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>`}
    </div>
    ${TABS.length > 1 && html`<div class="scroll-x mb"><${Seg} value=${tab} onChange=${setTab} options=${TABS.map(([id, label]) => ({ id, label }))} /></div>`}
    ${tab === 'checklist' && html`<${Checklist} ctx=${ctx} ev=${ev} reload=${reload} />`}
    ${tab === 'overview' && html`<${Overview} ctx=${ctx} ev=${ev} data=${data} h=${h} reload=${reload} />`}
    ${tab === 'pay' && needLive(html`<${Payments} ctx=${ctx} ev=${ev} data=${data} h=${h} reload=${reload} />`)}
    ${tab === 'items' && needLive(html`<${Items} ctx=${ctx} ev=${ev} data=${data} reload=${reload} />`)}
    ${tab === 'extra' && needLive(html`<${Extras} ctx=${ctx} ev=${ev} data=${data} reload=${reload} />`)}
    ${tab === 'accept' && needLive(html`<${Acceptance} ctx=${ctx} ev=${ev} data=${data} reload=${reload} />`)}
    ${tab === 'files' && needLive(html`<${Files} ctx=${ctx} ev=${ev} />`)}
  </div>`;
}

// Vòng sửa (dự án video): báo giá cho N vòng, vượt thì gợi ý tính phát sinh
function Revisions({ ctx, ev, reload }) {
  const isAdmin = ctx.me.role === 'admin';
  const over = ev.revisions_used > ev.revisions_included;
  async function addRound() {
    const nRound = (ev.revisions_used || 0) + 1;
    actions.saveEvent(ev.id, { revisions_used: nRound });
    actions.addEvTask({ event_id: ev.id, phase: 'p3', category: 'Vòng sửa', title: `Chỉnh sửa vòng ${nRound} theo góp ý khách${nRound > ev.revisions_included ? ' (ngoài báo giá)' : ''}`,
      due_date: addDays(today(), 2), pic_id: ev.pm_id, sort: 7000 + nRound });
    ctx.notify(nRound > ev.revisions_included ? `Đã vượt ${ev.revisions_included} vòng trong báo giá — cân nhắc tính phát sinh` : `Đã ghi nhận vòng sửa ${nRound}`);
  }
  return html`<div class=${'card pad mb row between ' + (over ? 'late' : '')}>
    <div><b>✏️ Vòng sửa: ${ev.revisions_used || 0} / ${ev.revisions_included} vòng trong báo giá</b>
      ${over && html`<div class="bad-t small">Đã vượt ${ev.revisions_used - ev.revisions_included} vòng — ghi vào tab Phát sinh để tính thêm phí.</div>`}</div>
    ${isAdmin && html`<button class="btn sm" onClick=${addRound}>+ Ghi nhận 1 vòng sửa</button>`}
  </div>`;
}

function Checklist({ ctx, ev, reload }) {
  const { state, me } = ctx;
  const isAdmin = me.role === 'admin';
  const T = typeOf(ev);
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(null);
  const [importing, setImporting] = useState(false);
  const [assignCat, setAssignCat] = useState(null);
  const all = state.ev_tasks.filter((t) => t.event_id === ev.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const list = all.filter((t) => (filter === 'mine' ? t.pic_id === me.id : filter === 'open' ? t.status !== 'done' : filter === 'late' ? t.status !== 'done' && t.due_date && t.due_date < today() : true));
  const s = projectStats(state, ev, me.id);
  const staff = state.people.filter((p) => p.role !== 'bod' && p.active !== false);
  const phases = { ...T.phases };
  for (const t of all) if (!phases[t.phase]) phases[t.phase] = t.phase;
  return html`<div>
    ${ev.type === 'video' && html`<${Revisions} ctx=${ctx} ev=${ev} reload=${reload} />`}
    <div class="stats">
      <div class="stat"><b>${s.pct}%</b><span>Hoàn thành (${s.done}/${s.total})</span></div>
      <div class=${'stat ' + (s.overdue ? 'bad' : '')}><b>${s.overdue}</b><span>Việc quá hạn</span></div>
      <div class=${'stat ' + (s.blocked ? 'bad' : '')}><b>${s.blocked}</b><span>Đang vướng</span></div>
      <div class="stat info"><b>${s.mine}</b><span>Việc của tôi chưa xong</span></div>
    </div>
    <div class="row between mb">
      <${Seg} value=${filter} onChange=${setFilter} options=${[{ id: 'all', label: 'Tất cả' }, { id: 'mine', label: 'Của tôi' }, { id: 'open', label: 'Chưa xong' }, { id: 'late', label: 'Quá hạn' }]} />
      ${isAdmin && html`<button class="btn" onClick=${() => setImporting(true)}>⬆ Nhập checklist từ Excel</button>`}
    </div>
    ${Object.entries(phases).map(([ph, label]) => {
      const rows = list.filter((t) => t.phase === ph);
      const n0 = all.filter((t) => t.phase === ph);
      const cats = [...new Set(rows.map((t) => t.category || 'Khác'))];
      return html`<section class="section" key=${ph}>
        <div class="section-head"><h2>▶ ${String(label).toUpperCase()} <span class="count">${n0.filter((t) => t.status === 'done').length}/${n0.length}</span></h2>
          ${isAdmin && html`<button class="btn sm" onClick=${() => setAdding({ phase: ph })}>+ Thêm việc</button>`}</div>
        ${!rows.length ? html`<div class="tempty">Không có việc.</div>` : html`<div class="ledger evledger">
          <div class="lg-head"><span>Hạn</span><span>Việc</span><span>Trạng thái</span><span>Ghi chú</span><span></span></div>
          ${cats.map((c) => html`
            <div class="lg-div row between"><span>${c}</span>${isAdmin && html`<button class="link small" onClick=${() => setAssignCat({ phase: ph, category: c })}>Giao cả nhóm</button>`}</div>
            ${rows.filter((t) => (t.category || 'Khác') === c).map((t) => html`<${EvRow} key=${t.id} t=${t} ctx=${ctx} staff=${staff} />`)}`)}
        </div>`}
      </section>`;
    })}
    ${adding && html`<${EvTaskForm} ctx=${ctx} ev=${ev} init=${adding} staff=${staff} onClose=${() => setAdding(null)} />`}
    ${importing && html`<${ImportChecklist} ctx=${ctx} ev=${ev} onClose=${() => setImporting(false)} />`}
    ${assignCat && html`<${AssignGroup} ctx=${ctx} ev=${ev} group=${assignCat} staff=${staff} onClose=${() => setAssignCat(null)} />`}
  </div>`;
}

export function EvRow({ t, ctx, staff, showEvent }) {
  const { me, state } = ctx;
  const isAdmin = me.role === 'admin';
  const canEdit = isAdmin || t.pic_id === me.id;
  const [note, setNote] = useState(t.note || '');
  const [edit, setEdit] = useState(false);
  useEffect(() => setNote(t.note || ''), [t.note]);
  const late = t.status !== 'done' && t.due_date && t.due_date < today();
  const pic = t.pic_id ? state.people.find((p) => p.id === t.pic_id)?.full_name : t.pic_name;
  const ev = showEvent && state.events.find((e) => e.id === t.event_id);
  return html`<div class=${`crow st-${t.status}${late ? ' pr-high' : ''}`}>
    <div class="c-time">${t.due_date ? U.fmtShort(t.due_date) : '—'}<small>${dLabel(t.offset_days)}</small></div>
    <div class="c-title">
      <div class="c-name">${t.title}</div>
      <div class="c-meta">
        ${ev && html`<span class="m-assign">${typeOf(ev).icon} ${ev.name}</span>`}
        <span class=${t.pic_id === me.id ? 'm-kpi' : ''}>👤 ${pic || 'Chưa giao'}</span>
        ${t.sup_fp && html`<span>Hỗ trợ: ${t.sup_fp}</span>`}
        ${t.sup_client && html`<span>Phía KH: ${t.sup_client}</span>`}
        ${late && html`<span class="m-bad">Quá hạn ${U.diffDays(t.due_date, today())} ngày</span>`}
        ${t.note && /Gấp/.test(t.note) && t.status !== 'done' && html`<span class="m-warn">Gấp</span>`}
      </div>
      ${t.detail && html`<div class="c-detail">${t.detail}</div>`}
    </div>
    <div class="c-status" role="group" aria-label="Trạng thái">
      ${STATUS_BTNS.map(([k, ic, l]) => html`<button type="button" class=${'sb sb-' + k + (t.status === k ? ' on' : '')} disabled=${!canEdit} onClick=${() => k !== t.status && actions.updateEvTask(t.id, { status: k })} title=${l}><span>${ic}</span><em>${l}</em></button>`)}
    </div>
    <div class="c-note">
      ${canEdit
        ? html`<input class="in-note" value=${note} placeholder="Ghi chú / kết quả…" onInput=${(e) => setNote(e.target.value)} onBlur=${() => note !== (t.note || '') && actions.updateEvTask(t.id, { note })} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`
        : html`<div class=${'note-ro' + (note ? '' : ' empty-ro')}>${note || '—'}</div>`}
    </div>
    <button type="button" class="c-more" disabled=${!isAdmin} onClick=${() => setEdit(true)} title="Sửa việc">⋯</button>
    ${edit && html`<${EvTaskForm} ctx=${ctx} task=${t} staff=${staff || state.people} onClose=${() => setEdit(false)} />`}
  </div>`;
}

function EvTaskForm({ ctx, ev, task, init = {}, staff, onClose }) {
  const evx = ev || ctx.state.events.find((e) => e.id === task.event_id);
  const T = typeOf(evx);
  const [f, setF] = useState({ phase: 'p1', category: '', title: '', detail: '', pic: '', due_date: '', sup_fp: '', sup_client: '', ...init, ...(task || {}),
    ...(task ? { pic: task.pic_id || (task.pic_name ? 'ext:' + task.pic_name : '') } : {}) });
  const [extName, setExtName] = useState(task?.pic_name || '');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cats = [...new Set(ctx.state.ev_tasks.filter((t) => t.event_id === evx.id).map((t) => t.category).filter(Boolean))];
  function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    const ext = f.pic.startsWith('ext:') ? f.pic.slice(4) : '';
    const patch = {
      phase: f.phase, category: f.category || 'Khác', title: f.title.trim(), detail: f.detail || null, due_date: f.due_date || null,
      offset_days: f.due_date && evx.event_date ? U.diffDays(evx.event_date, f.due_date) : null,
      pic_id: !f.pic || ext ? null : f.pic, pic_name: ext || null, sup_fp: f.sup_fp || null, sup_client: f.sup_client || null,
    };
    if (task) actions.updateEvTask(task.id, patch);
    else actions.addEvTask({ ...patch, event_id: evx.id });
    ctx.notify('Đã lưu');
    onClose();
  }
  return html`<${Modal} title=${task ? 'Sửa việc' : 'Thêm việc cho dự án'} onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>Việc *<input id="evt-title" value=${f.title} onInput=${set('title')} /></label>
      <div class="grid2">
        <label>Giai đoạn<select id="evt-phase" value=${f.phase} onChange=${set('phase')}>${Object.entries(T.phases).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
        <label>Nhóm việc<input id="evt-cat" list="evt-cats" value=${f.category} onInput=${set('category')} /><datalist id="evt-cats">${cats.map((c) => html`<option value=${c} />`)}</datalist></label>
      </div>
      <label>Chi tiết<textarea id="evt-detail" rows="2" value=${f.detail || ''} onInput=${set('detail')}></textarea></label>
      <div class="grid2">
        <label>Người phụ trách
          <select id="evt-pic" value=${f.pic.startsWith('ext:') ? 'ext' : f.pic} onChange=${(e) => setF({ ...f, pic: e.target.value === 'ext' ? 'ext:' + extName : e.target.value })}>
            <option value="">— Chưa giao —</option>${staff.map((p) => html`<option value=${p.id}>${p.full_name}</option>`)}<option value="ext">Người ngoài (ghi tên)…</option>
          </select></label>
        <label>Hạn chót<input id="evt-due" type="date" value=${f.due_date || ''} onInput=${set('due_date')} /></label>
      </div>
      ${f.pic.startsWith('ext:') && html`<label>Tên người ngoài (diễn viên, KOL, đối tác…)<input id="evt-ext" value=${extName} onInput=${(e) => { setExtName(e.target.value); setF({ ...f, pic: 'ext:' + e.target.value }); }} /></label>`}
      <div class="grid2">
        <label>Hỗ trợ (Mummii)<input id="evt-supfp" value=${f.sup_fp || ''} onInput=${set('sup_fp')} /></label>
        <label>Phía khách hàng<input id="evt-supc" value=${f.sup_client || ''} onInput=${set('sup_client')} /></label>
      </div>
      <div class="row between">
        ${task ? html`<${ConfirmButton} label="🗑 Xoá việc" ask="Bấm lần nữa để xoá" onConfirm=${() => { actions.deleteEvTask(task.id); onClose(); }} />` : html`<span></span>`}
        <div class="row"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">Lưu</button></div>
      </div>
    </form>
  </${Modal}>`;
}

function AssignGroup({ ctx, ev, group, staff, onClose }) {
  const [pic, setPic] = useState('');
  const tasks = ctx.state.ev_tasks.filter((t) => t.event_id === ev.id && t.phase === group.phase && (t.category || 'Khác') === group.category);
  return html`<${Modal} title=${'Giao cả nhóm: ' + group.category} onClose=${onClose}>
    <div class="form">
      <p class="muted">${tasks.length} việc trong nhóm này sẽ giao cho:</p>
      <select id="grp-pic" value=${pic} onChange=${(e) => setPic(e.target.value)}><option value="">— Chọn người —</option>${staff.map((p) => html`<option value=${p.id}>${p.full_name}</option>`)}</select>
      <div class="row end"><button class="btn" onClick=${onClose}>Huỷ</button>
        <button class="btn primary" disabled=${!pic} onClick=${() => { tasks.forEach((t) => actions.updateEvTask(t.id, { pic_id: pic, pic_name: null })); ctx.notify(`Đã giao ${tasks.length} việc`); onClose(); }}>Giao việc</button></div>
    </div>
  </${Modal}>`;
}

let xlsxP;
function loadXlsx() {
  xlsxP = xlsxP || import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm').then((m) => m.default || m);
  return xlsxP;
}

// Nhập checklist từ file Excel (cột Hạng mục · Task · PIC · Deadline · Tình trạng — giống file do Claude tạo)
function ImportChecklist({ ctx, ev, onClose }) {
  const [sheets, setSheets] = useState(null);
  const [pick, setPick] = useState(0);
  const [replace, setReplace] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const map = { before: 'p1', during: 'p2', after: 'p4' };
  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setErr('');
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer());
      const res = parseChecklistFile(wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) })), ctx.state.people);
      if (!res.length) return setErr('Không tìm thấy bảng checklist (cần các cột Hạng mục · Task · PIC · Deadline).');
      setSheets(res);
    } catch (x) {
      setErr('Không đọc được file: ' + x.message);
    }
  }
  async function doImport() {
    setBusy(true);
    try {
      const tasks = sheets[pick].tasks.map((t) => ({ ...t, phase: map[t.phase] || t.phase, offset_days: t.offset_days ?? (t.due_date && ev.event_date ? U.diffDays(ev.event_date, t.due_date) : null) }));
      await actions.importEvTasks(ev.id, tasks, replace);
      ctx.notify(`Đã nhập ${tasks.length} việc`);
      onClose();
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }
  const preview = sheets?.[pick]?.tasks || [];
  return html`<${Modal} title="Nhập checklist từ Excel" onClose=${onClose} wide>
    <div class="form">
      <input id="ck-file" type="file" accept=".xlsx,.xls" onChange=${onFile} />
      ${err && html`<div class="err">${err}</div>`}
      ${sheets && html`
        ${sheets.length > 1 && html`<label>Sheet<select value=${pick} onChange=${(e) => setPick(+e.target.value)}>${sheets.map((s, i) => html`<option value=${i}>${s.sheet} (${s.tasks.length} việc)</option>`)}</select></label>`}
        <p><b>${preview.length} việc</b> · ${preview.filter((t) => t.pic_id).length} việc khớp nhân viên</p>
        <label class="check"><input type="checkbox" checked=${replace} onChange=${(e) => setReplace(e.target.checked)} /> Thay toàn bộ checklist hiện tại (bỏ tick = thêm vào)</label>
        <div class="row end"><button class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary" disabled=${busy} onClick=${doImport}>${busy ? 'Đang nhập…' : 'Nhập ' + preview.length + ' việc'}</button></div>`}
    </div>
  </${Modal}>`;
}

// Việc dự án của tôi trong 3 ngày tới (hiện trong "Hôm nay")
export function myEventTasks(state, meId) {
  const soon = U.addDays(3);
  return (state.ev_tasks || []).filter((t) => t.pic_id === meId && t.status !== 'done' && t.due_date && t.due_date <= soon)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

// ---------------------------------------------------------------------------
// Phần dành cho CEO / Quản trị (bản thật)
// ---------------------------------------------------------------------------
function Overview({ ctx, ev, data, h, reload }) {
  const save = useSave(ctx, reload);
  const T = typeOf(ev);
  const [f, setF] = useState(ev);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const staff = data.members.filter((m) => m.active !== false && m.role !== 'bod');
  return html`<div class="form">
    <div class="stats">
      <div class="stat info"><b>${h.pct}%</b><span>Checklist (${h.done}/${h.tasks})</span></div>
      <div class="stat"><b>${money(ev.quote_total) || '—'}</b><span>Giá trị hợp đồng${h.extras ? ` + phát sinh ${money(h.extras)}` : ''}</span></div>
      <div class="stat ok"><b>${money(h.paidIn) || '0đ'}</b><span>Khách đã trả / ${money(h.dueIn) || '0đ'}</span></div>
      <div class="stat warn"><b>${money(h.paidOut) || '0đ'}</b><span>Đã trả NCC / ${money(h.cost) || '0đ'}</span></div>
      ${h.cost > 0 && html`<div class="stat"><b>${money((ev.quote_total || 0) + h.extras - h.cost)}</b><span>Lãi gộp ước tính</span></div>`}
    </div>
    <div class="grid2">
      <label>Tên dự án<input value=${f.name} onInput=${set('name')} /></label>
      <label>Loại<select value=${f.type} onChange=${set('type')}>${Object.entries(PROJECT_TYPES).map(([k, t]) => html`<option value=${k}>${t.icon} ${t.label}</option>`)}</select></label>
      <label>${T.anchor}<input type="date" value=${f.event_date || ''} onInput=${set('event_date')} /></label>
      ${ev.type === 'video' && html`<label>Ngày quay<input type="date" value=${f.shoot_date || ''} onInput=${set('shoot_date')} /></label>`}
      <label>Khách hàng<input value=${f.client_name || ''} onInput=${set('client_name')} /></label>
      <label>Đầu mối phía khách<input value=${f.client_contact || ''} onInput=${set('client_contact')} /></label>
      <label>PM<select value=${f.pm_id || ''} onChange=${set('pm_id')}><option value="">—</option>${staff.map((m) => html`<option value=${m.id}>${m.full_name}</option>`)}</select></label>
      <label>Giá trị hợp đồng (đ)<input type="number" value=${f.quote_total ?? ''} onInput=${set('quote_total')} /></label>
      <label>Ngày ký hợp đồng<input type="date" value=${f.contract_signed_at || ''} onInput=${set('contract_signed_at')} /></label>
      <label>Hạn ký HĐ<input type="date" value=${f.contract_deadline || ''} onInput=${set('contract_deadline')} /></label>
      ${ev.type === 'video' && html`<label>Số vòng sửa trong báo giá<input type="number" min="0" value=${f.revisions_included} onInput=${set('revisions_included')} /></label>`}
      <label>Ghi chú hợp đồng<input value=${f.contract_note || ''} onInput=${set('contract_note')} /></label>
    </div>
    <label>Ghi chú<textarea rows="2" value=${f.notes || ''} onInput=${set('notes')}></textarea></label>
    <div class="row end"><button class="btn primary" onClick=${() => {
      const patch = {};
      for (const k of ['name', 'type', 'event_date', 'shoot_date', 'client_name', 'client_contact', 'pm_id', 'contract_signed_at', 'contract_deadline', 'contract_note', 'notes']) patch[k] = f[k] === '' ? null : f[k];
      patch.quote_total = n(f.quote_total);
      patch.revisions_included = Number(f.revisions_included) || 0;
      if (patch.event_date && patch.event_date !== ev.event_date) shiftTasks(ctx, ev.id, patch.event_date);
      actions.saveEvent(ev.id, patch);
      ctx.notify('Đã lưu');
    }}>Lưu</button></div>
  </div>`;
}

function useSave(ctx, reload) {
  return async (table, id, patch, msg) => {
    try {
      ok(await getSb().from(table).update(patch).eq('id', id));
      if (msg) ctx.notify(msg);
      await reload();
    } catch (e) {
      ctx.notify(e.message, 'err');
    }
  };
}

// Đổi mốc dự án → dời hạn các việc chưa xong theo mốc D
function shiftTasks(ctx, eventId, newDate) {
  const tasks = ctx.state.ev_tasks.filter((t) => t.event_id === eventId && t.status !== 'done' && t.offset_days != null);
  tasks.forEach((t) => actions.updateEvTask(t.id, { due_date: addDays(newDate, t.offset_days) }));
  ctx.notify(`Đã dời hạn ${tasks.length} việc theo mốc mới`);
}

function Payments({ ctx, ev, data, h, reload }) {
  const sb = getSb();
  const rows = data.payments.filter((p) => p.event_id === ev.id);
  const save = useSave(ctx, reload);
  const t = today();
  async function add() {
    ok(await sb.from('ev_payments').insert({ event_id: ev.id, label: `Đợt ${rows.length + 1}`, amount: 0, sort: rows.length }));
    reload();
  }
  return html`<div class="form">
    <p class="muted">Giá trị cần thu: <b>${money(ev.quote_total)}</b>${h.extras ? html` + phát sinh <b>${money(h.extras)}</b> (chưa VAT/phí)` : ''} · Đã thu <b>${money(h.paidIn)}</b></p>
    ${rows.map((p) => {
      const late = p.status !== 'paid' && p.due_date && p.due_date < t;
      const soon = p.status !== 'paid' && p.due_date && p.due_date >= t && p.due_date <= addDays(t, 3);
      return html`<div class=${'card-sec' + (late ? ' late' : '')} key=${p.id}>
        <div class="row between"><b>${p.label}</b>
          <span class=${'badge ' + (p.status === 'paid' ? 'ok' : late ? 'bad' : soon ? 'warn' : '')}>${p.status === 'paid' ? '✓ Đã thu' : late ? 'Quá hạn' : soon ? 'Sắp đến hạn — nhắc khách' : p.status === 'partial' ? 'Thu một phần' : 'Chưa thu'}</span></div>
        <div class="grid3">
          <label>Số tiền<input type="number" value=${p.amount ?? ''} onChange=${(e) => save('ev_payments', p.id, { amount: n(e.target.value) })} /></label>
          <label>Hạn thanh toán<input type="date" value=${p.due_date || ''} onChange=${(e) => save('ev_payments', p.id, { due_date: e.target.value || null })} /></label>
          <label>Điều kiện<input value=${p.due_rule || ''} onChange=${(e) => save('ev_payments', p.id, { due_rule: e.target.value })} /></label>
          <label>Đã thu<input type="number" value=${p.paid_amount ?? 0} onChange=${(e) => {
            const v = n(e.target.value) || 0;
            save('ev_payments', p.id, { paid_amount: v, status: v <= 0 ? 'unpaid' : v >= (p.amount || 0) ? 'paid' : 'partial', paid_at: v > 0 ? p.paid_at || t : null }, 'Đã cập nhật');
          }} /></label>
          <label>Ngày thu<input type="date" value=${p.paid_at || ''} onChange=${(e) => save('ev_payments', p.id, { paid_at: e.target.value || null })} /></label>
          <label>Ghi chú<input value=${p.note || ''} onChange=${(e) => save('ev_payments', p.id, { note: e.target.value })} /></label>
        </div>
        <div class="row">
          ${p.status !== 'paid' && html`<button class="btn sm" onClick=${() => save('ev_payments', p.id, { last_reminded: t }, 'Đã ghi nhận nhắc khách hôm nay')}>📞 Đã nhắc khách</button>`}
          ${p.last_reminded && html`<span class="muted small">Nhắc gần nhất: ${U.fmtDate(p.last_reminded)}</span>`}
          ${p.status !== 'paid' && html`<button class="btn sm" onClick=${() => save('ev_payments', p.id, { paid_amount: p.amount, status: 'paid', paid_at: t }, 'Đã thu đủ')}>✓ Đã thu đủ</button>`}
        </div>
      </div>`;
    })}
    <button class="btn" onClick=${add}>+ Thêm đợt thanh toán</button>
  </div>`;
}

function Items({ ctx, ev, data, reload }) {
  const sb = getSb();
  const save = useSave(ctx, reload);
  const [showOpt, setShowOpt] = useState(false);
  const items = data.items.filter((i) => i.event_id === ev.id && !i.is_extra && (showOpt || i.chosen));
  const sups = data.suppliers;
  const t = today();
  async function choose(it, chosen) {
    await save('ev_items', it.id, { chosen });
  }
  const [nf, setNf] = useState({ name: '', qty: 1, unit: '', unit_price: '' });
  async function addItem(e) {
    e.preventDefault();
    if (!nf.name.trim()) return;
    const amount = (Number(nf.qty) || 0) * (Number(nf.unit_price) || 0);
    ok(await sb.from('ev_items').insert({ event_id: ev.id, name: nf.name.trim(), qty: n(nf.qty), unit: nf.unit || null, unit_price: n(nf.unit_price), amount, sort: 100 + items.length }));
    setNf({ name: '', qty: 1, unit: '', unit_price: '' });
    reload();
  }
  return html`<div>
    <div class="row between"><p class="muted">Ghi nhà cung cấp, giá nhập và tiến độ trả tiền cho từng hạng mục. Hạng mục Mummii tự làm chọn "Không qua NCC".</p>
      <label class="inline-check"><input type="checkbox" checked=${showOpt} onChange=${(e) => setShowOpt(e.target.checked)} /> Hiện cả Option khách chưa chọn</label></div>
    <div class="table-wrap"><table class="table compact items">
      <thead><tr><th>Hạng mục</th><th class="num">SL</th><th class="num">Báo giá</th><th>Nhà cung cấp</th><th class="num">Giá nhập</th><th class="num">Đã trả NCC</th><th>Hạn trả</th><th>Trạng thái</th><th>Vướng mắc</th></tr></thead>
      <tbody>${items.map((it) => {
        const late = it.supplier_status !== 'paid' && it.supplier_status !== 'none' && it.supplier_due && it.supplier_due < t;
        return html`<tr key=${it.id} class=${it.chosen ? '' : 'muted'}>
          <td><b>${it.name}</b>${it.is_option && html` <label class="inline-check small"><input type="checkbox" checked=${it.chosen} onChange=${(e) => choose(it, e.target.checked)} /> Option${it.chosen ? ' (đã chọn)' : ''}</label>`}<div class="muted small clamp">${it.detail || ''}</div></td>
          <td class="num">${it.qty ?? ''} ${it.unit || ''}</td>
          <td class="num">${money(it.amount)}</td>
          <td><select value=${it.supplier_id || ''} onChange=${(e) => save('ev_items', it.id, { supplier_id: e.target.value || null })}><option value="">—</option>${sups.map((s) => html`<option value=${s.id}>${s.name}</option>`)}</select></td>
          <td class="num"><input class="w-num" type="number" value=${it.cost_amount ?? ''} onChange=${(e) => save('ev_items', it.id, { cost_amount: n(e.target.value) })} /></td>
          <td class="num"><input class="w-num" type="number" value=${it.supplier_paid ?? 0} onChange=${(e) => {
            const v = n(e.target.value) || 0;
            save('ev_items', it.id, { supplier_paid: v, supplier_status: v <= 0 ? 'unpaid' : it.cost_amount && v >= it.cost_amount ? 'paid' : 'partial' });
          }} /></td>
          <td><input class="w-date" type="date" value=${it.supplier_due || ''} onChange=${(e) => save('ev_items', it.id, { supplier_due: e.target.value || null })} /></td>
          <td><select class=${late ? 'bad-sel' : ''} value=${it.supplier_status} onChange=${(e) => save('ev_items', it.id, { supplier_status: e.target.value, ...(e.target.value === 'paid' && it.cost_amount ? { supplier_paid: it.cost_amount } : {}) })}>${Object.entries(SUP_STATUS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>${late && html`<div class="stale small">Quá hạn</div>`}</td>
          <td><input value=${it.supplier_issue || ''} placeholder="Khó khăn khi trả…" onChange=${(e) => save('ev_items', it.id, { supplier_issue: e.target.value || null })} /></td>
        </tr>`;
      })}</tbody>
    </table></div>
    <form class="card pad form mt" onSubmit=${addItem}>
      <b class="small">+ Thêm hạng mục (VD: thuê thiết bị, diễn viên, location, KOL…)</b>
      <div class="grid3">
        <label>Hạng mục<input value=${nf.name} onInput=${(e) => setNf({ ...nf, name: e.target.value })} /></label>
        <label>Số lượng<input type="number" value=${nf.qty} onInput=${(e) => setNf({ ...nf, qty: e.target.value })} /></label>
        <label>ĐVT<input value=${nf.unit} onInput=${(e) => setNf({ ...nf, unit: e.target.value })} /></label>
        <label>Đơn giá báo khách (đ)<input type="number" value=${nf.unit_price} onInput=${(e) => setNf({ ...nf, unit_price: e.target.value })} /></label>
      </div>
      <div class="row end"><button class="btn primary">Thêm</button></div>
    </form>
    <p class="muted small">Chưa có nhà cung cấp trong danh sách? Thêm ở tab "Nhà cung cấp" trên trang Dự án.</p>
  </div>`;
}

function Extras({ ctx, ev, data, reload }) {
  const sb = getSb();
  const extras = data.items.filter((i) => i.event_id === ev.id && i.is_extra);
  const [f, setF] = useState({ name: '', detail: '', qty: 1, unit: '', unit_price: '', extra_by: '', extra_date: today() });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const amount = (Number(f.qty) || 0) * (Number(f.unit_price) || 0);
  async function add(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    try {
      const it = { id: uuid(), event_id: ev.id, name: f.name.trim(), detail: f.detail || null, qty: n(f.qty), unit: f.unit || null, unit_price: n(f.unit_price), amount,
        is_extra: true, chosen: true, extra_by: f.extra_by || null, extra_date: f.extra_date || null, sort: 9000 + extras.length };
      ok(await sb.from('ev_items').insert(it));
      actions.addEvTask({ event_id: ev.id, phase: 'p3', category: 'Phát sinh', title: `Thực hiện phát sinh: ${it.name}`, detail: [it.detail, it.extra_by && 'Yêu cầu bởi ' + it.extra_by].filter(Boolean).join(' · ') || null, due_date: addDays(today(), 3), pic_id: ev.pm_id, sort: 8000 + extras.length });
      const tasks = [1];
      ctx.notify(`Đã thêm phát sinh${tasks.length ? ` + ${tasks.length} việc vào checklist` : ''}`);
      setF({ ...f, name: '', detail: '', unit_price: '' });
      reload();
    } catch (x) {
      ctx.notify(x.message, 'err');
    }
  }
  const last = data.payments.filter((p) => p.event_id === ev.id).sort((a, b) => b.sort - a.sort)[0];
  const sum = extras.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  return html`<div class="form">
    <p class="muted">Hạng mục khách yêu cầu thêm sau khi ký hợp đồng (VD thêm cảnh quay, thêm vòng sửa, thêm video ngắn). Mỗi phát sinh tự thêm việc vào checklist và nằm trong danh sách nghiệm thu.</p>
    ${extras.length ? html`<div class="table-wrap"><table class="table compact">
      <thead><tr><th>Phát sinh</th><th class="num">SL</th><th class="num">Thành tiền</th><th>Yêu cầu bởi</th><th>Ngày</th></tr></thead>
      <tbody>${extras.map((x) => html`<tr><td><b>${x.name}</b><div class="muted small">${x.detail || ''}</div></td><td class="num">${x.qty ?? ''} ${x.unit || ''}</td><td class="num">${money(x.amount)}</td><td>${x.extra_by || ''}</td><td>${x.extra_date ? U.fmtDate(x.extra_date) : ''}</td></tr>`)}
        <tr><td><b>Tổng phát sinh</b></td><td></td><td class="num"><b>${money(sum)}</b></td><td colspan="2">
          ${last && sum > 0 && html`<button class="btn sm" onClick=${async () => { ok(await sb.from('ev_payments').update({ amount: (Number(last.amount) || 0) + sum, note: [last.note, `Đã cộng phát sinh ${money(sum)}`].filter(Boolean).join(' · ') }).eq('id', last.id)); ctx.notify('Đã cộng phát sinh vào ' + last.label); reload(); }}>Cộng vào ${last.label}</button>`}</td></tr>
      </tbody></table></div>` : html`<div class="empty">Chưa có phát sinh.</div>`}
    <form class="card-sec form" onSubmit=${add}>
      <h3>+ Thêm phát sinh</h3>
      <div class="grid2">
        <label>Hạng mục *<input value=${f.name} onInput=${set('name')} placeholder="VD: Vòng sửa thứ 3 / Thêm 1 video 9:16" /></label>
        <label>Mô tả<input value=${f.detail} onInput=${set('detail')} /></label>
      </div>
      <div class="grid3">
        <label>Số lượng<input type="number" value=${f.qty} onInput=${set('qty')} /></label>
        <label>ĐVT<input value=${f.unit} onInput=${set('unit')} placeholder="tiết mục, người…" /></label>
        <label>Đơn giá<input type="number" value=${f.unit_price} onInput=${set('unit_price')} /></label>
        <label>Yêu cầu bởi<input value=${f.extra_by} onInput=${set('extra_by')} placeholder="VD: Anh A (khách hàng)" /></label>
        <label>Ngày yêu cầu<input type="date" value=${f.extra_date} onInput=${set('extra_date')} /></label>
        <label>Thành tiền<input readonly value=${money(amount)} /></label>
      </div>
      <div class="row end"><button class="btn primary">Thêm phát sinh</button></div>
    </form>
  </div>`;
}

function Acceptance({ ctx, ev, data, reload }) {
  const save = useSave(ctx, reload);
  const items = data.items.filter((i) => i.event_id === ev.id && i.chosen);
  const okN = items.filter((i) => i.accept_status === 'ok').length;
  const issue = items.filter((i) => i.accept_status === 'issue').length;
  return html`<div class="form">
    <div class="row between">
      <p><b>${okN}/${items.length}</b> hạng mục đạt${issue ? html` · <span class="stale">${issue} có vấn đề</span>` : ''}</p>
      <label class="inline-check">Ngày ký biên bản nghiệm thu <input type="date" value=${ev.accepted_at || ''} onChange=${(e) => save('ev_events', ev.id, { accepted_at: e.target.value || null }, 'Đã lưu')} /></label>
    </div>
    <div class="table-wrap"><table class="table compact">
      <thead><tr><th>Hạng mục</th><th class="num">SL báo giá</th><th class="num">SL thực tế</th><th>Kết quả</th><th>Ghi chú</th></tr></thead>
      <tbody>${items.map((it) => html`<tr key=${it.id}>
        <td><b>${it.name}</b>${it.is_extra && html` <span class="badge warn">Phát sinh</span>`}</td>
        <td class="num">${it.qty ?? ''} ${it.unit || ''}</td>
        <td class="num"><input class="w-num" type="number" value=${it.accept_qty ?? ''} placeholder=${it.qty ?? ''} onChange=${(e) => save('ev_items', it.id, { accept_qty: n(e.target.value) })} /></td>
        <td><select value=${it.accept_status} onChange=${(e) => save('ev_items', it.id, { accept_status: e.target.value })}>${Object.entries(ACC).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></td>
        <td><input value=${it.accept_note || ''} onChange=${(e) => save('ev_items', it.id, { accept_note: e.target.value || null })} placeholder="VD: thiếu bản 9:16" /></td>
      </tr>`)}</tbody>
    </table></div>
    <div class="row">
      <button class="btn" onClick=${async () => { for (const it of items.filter((x) => x.accept_status === 'pending')) await getSb().from('ev_items').update({ accept_status: 'ok' }).eq('id', it.id); ctx.notify('Đã đánh dấu đạt các mục còn lại'); reload(); }}>✓ Đánh dấu đạt tất cả mục còn lại</button>
      <span class="muted small">Đính kèm biên bản ký ở tab Hồ sơ.</span>
    </div>
  </div>`;
}

function Files({ ctx, ev }) {
  const sb = getSb();
  const [files, setFiles] = useState(null);
  const [kind, setKind] = useState('contract');
  const [busy, setBusy] = useState(false);
  const KIND = { quote: 'Báo giá', contract: 'Hợp đồng', acceptance: 'Biên bản nghiệm thu', other: 'Khác' };
  async function load() {
    setFiles(ok(await sb.from('ev_files').select('*').eq('event_id', ev.id).order('uploaded_at', { ascending: false })));
  }
  useEffect(() => {
    load();
  }, []);
  async function upload(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return ctx.notify('File tối đa 20MB', 'err');
    setBusy(true);
    try {
      const path = `${ev.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
      const up = await sb.storage.from('ev-files').upload(path, f);
      if (up.error) throw up.error;
      ok(await sb.from('ev_files').insert({ event_id: ev.id, kind, name: f.name, path, size: f.size }));
      ctx.notify('Đã tải lên');
      load();
    } catch (x) {
      ctx.notify(x.message, 'err');
    }
    setBusy(false);
    e.target.value = '';
  }
  async function open(f) {
    const { data, error } = await sb.storage.from('ev-files').createSignedUrl(f.path, 300, { download: f.name });
    if (error) return ctx.notify(error.message, 'err');
    window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function remove(f) {
    await sb.storage.from('ev-files').remove([f.path]);
    await sb.from('ev_files').delete().eq('id', f.id);
    load();
  }
  return html`<div class="form">
    <div class="row"><select value=${kind} onChange=${(e) => setKind(e.target.value)}>${Object.entries(KIND).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
      <input type="file" disabled=${busy} onChange=${upload} /> ${busy && html`<span class="muted">Đang tải lên…</span>`}</div>
    ${files === null ? html`<p class="muted">Đang tải…</p>` : !files.length ? html`<div class="empty">Chưa có file.</div>` : html`<div class="minilist">${files.map((f) => html`<div class="mini">
      <div class="mini-main" onClick=${() => open(f)}><b>${f.name}</b><div class="muted small">${KIND[f.kind]} · ${fmtDateTime(f.uploaded_at)} · ${Math.round((f.size || 0) / 1024)} KB</div></div>
      <button class="btn sm" onClick=${() => open(f)}>Tải về</button>
      <button class="link danger" onClick=${() => remove(f)}>Xoá</button>
    </div>`)}</div>`}
  </div>`;
}

function Suppliers({ ctx, data, reload }) {
  const sb = getSb();
  const [f, setF] = useState(null);
  async function save(e) {
    e.preventDefault();
    if (!f.name?.trim()) return;
    try {
      const row = { name: f.name.trim(), category: f.category || null, contact: f.contact || null, phone: f.phone || null, bank: f.bank || null, note: f.note || null };
      if (f.id) ok(await sb.from('ev_suppliers').update(row).eq('id', f.id));
      else ok(await sb.from('ev_suppliers').insert(row));
      setF(null);
      reload();
    } catch (x) {
      ctx.notify(x.message, 'err');
    }
  }
  const owe = (s) => data.items.filter((i) => i.supplier_id === s.id && i.supplier_status !== 'paid').reduce((a, i) => a + Math.max(0, (Number(i.cost_amount) || 0) - (Number(i.supplier_paid) || 0)), 0);
  return html`<div>
    <div class="row between"><p class="muted">Danh bạ nhà cung cấp dùng lại cho mọi dự án.</p><button class="btn primary" onClick=${() => setF({})}>+ Nhà cung cấp</button></div>
    <div class="table-wrap"><table class="table leads">
      <thead><tr><th>Tên</th><th>Mảng</th><th>Liên hệ</th><th>Tài khoản</th><th class="num">Còn nợ</th></tr></thead>
      <tbody>${data.suppliers.map((s) => html`<tr onClick=${() => setF(s)}><td><b>${s.name}</b><div class="muted small">${s.note || ''}</div></td><td>${s.category || ''}</td><td>${[s.contact, s.phone].filter(Boolean).join(' · ')}</td><td class="small">${s.bank || ''}</td><td class="num">${money(owe(s))}</td></tr>`)}</tbody>
    </table></div>
    ${f && html`<${Modal} title=${f.id ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'} onClose=${() => setF(null)}>
      <form class="form" onSubmit=${save}>
        <label>Tên *<input value=${f.name || ''} onInput=${(e) => setF({ ...f, name: e.target.value })} /></label>
        <div class="grid2"><label>Mảng<input value=${f.category || ''} onInput=${(e) => setF({ ...f, category: e.target.value })} placeholder="Thiết bị, diễn viên, location, KOL…" /></label>
          <label>Người liên hệ<input value=${f.contact || ''} onInput=${(e) => setF({ ...f, contact: e.target.value })} /></label>
          <label>SĐT<input value=${f.phone || ''} onInput=${(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label>Số tài khoản / ngân hàng<input value=${f.bank || ''} onInput=${(e) => setF({ ...f, bank: e.target.value })} /></label></div>
        <label>Ghi chú<input value=${f.note || ''} onInput=${(e) => setF({ ...f, note: e.target.value })} /></label>
        <div class="row end"><button type="button" class="btn" onClick=${() => setF(null)}>Huỷ</button><button class="btn primary">Lưu</button></div>
      </form>
    </${Modal}>`}
  </div>`;
}
