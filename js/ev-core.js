// Lõi dự án — bản Mummii (tách từ bộ lõi "Triển khai giải" của Fairplay; phần đọc báo giá giữ lại để dùng sau nếu có mẫu báo giá).
// - Đọc báo giá Excel theo mẫu Fairplay (mỗi sheet = 1 giải)
// - Sinh checklist Trước / Trong / Sau theo đúng quy tắc của skill fairplay-event-checklist
// - Đọc file checklist Excel do Claude/skill tạo
// Không phụ thuộc thư viện: nhận ma trận ô (mảng các hàng) từ SheetJS.

export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const txt = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const num = (v) => {
  if (typeof v === 'number') return v;
  const s = txt(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') && !s.includes('.') ? s.replace(/,/g, '') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/;
export const PHASES = { before: 'Trước giải', during: 'Trong giải', after: 'Sau giải' };
export const TASK_STATUS = { todo: 'Chưa làm', doing: 'Đang làm', blocked: 'Vướng', done: 'Xong' };

// ---------------------------------------------------------------------------
// 1. Đọc báo giá
// ---------------------------------------------------------------------------
// sheets: [{ name, rows }] — rows là mảng 2 chiều (SheetJS sheet_to_json header:1)
export function parseQuote(sheets) {
  const out = [];
  for (const { name, rows } of sheets) {
    const n = fold(name);
    if (/checklist|tong quan|contact|giai thuong|de xuat san/.test(n)) continue;
    const q = parseQuoteSheet(rows);
    if (q && q.items.length) out.push({ sheet: name.trim(), ...q });
  }
  return out;
}

function findCol(row, test) {
  for (let i = 0; i < (row || []).length; i++) if (test(fold(row[i]))) return i;
  return -1;
}

function parseQuoteSheet(rows) {
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i] || [];
    if (findCol(r, (s) => s === 'stt') >= 0 && findCol(r, (s) => s.startsWith('noi dung')) >= 0) {
      h = i;
      break;
    }
  }
  if (h < 0) return null;
  const top = rows[h] || [];
  const sub = rows[h + 1] || [];
  const both = (test) => {
    const a = findCol(top, test);
    return a >= 0 ? a : findCol(sub, test);
  };
  const C = {
    stt: findCol(top, (s) => s === 'stt'),
    nd: findCol(top, (s) => s.startsWith('noi dung')),
    bg: both((s) => s.startsWith('bao gom')),
    sl: both((s) => s.startsWith('so luong')),
    dvt: both((s) => s === 'dvt' || s.startsWith('don vi tinh')),
    dg: both((s) => s.startsWith('don gia')),
    ngay: both((s) => s === 'ngay' || s.startsWith('so ngay')),
    tt: both((s) => s.startsWith('thanh tien')),
    gc: both((s) => s.startsWith('ghi chu')),
  };
  // Tiêu đề, khách hàng
  let title = '';
  let client = '';
  for (let i = 0; i < h; i++) {
    const r = (rows[i] || []).map(txt).filter(Boolean);
    if (!r.length) continue;
    if (!title && /bao gia/.test(fold(r[0]))) title = r[0];
    const ki = r.findIndex((x) => /kinh gui/.test(fold(x)));
    if (ki >= 0 && r[ki + 1]) client = r[ki + 1];
  }
  const items = [];
  const totals = {};
  let section = '';
  let grp = '';
  let lastNd = '';
  let empty = 0;
  for (let i = h + 2; i < rows.length; i++) {
    const r = rows[i] || [];
    const get = (k) => (C[k] >= 0 ? r[C[k]] : null);
    const cells = r.map(txt);
    if (!cells.some(Boolean)) {
      if (++empty > 15) break;
      continue;
    }
    empty = 0;
    const stt = txt(get('stt'));
    const nd = txt(get('nd'));
    const bg = txt(get('bg'));
    const label = fold(stt || nd || cells.find(Boolean));
    // Dòng tổng / phí / VAT
    // Hết phần hạng mục: "Lưu ý từ Fairplay…", điều khoản thanh toán
    if (/^(luu y|dieu khoan|ghi chu chung|dieu kien thanh toan)/.test(label)) break;
    // Dòng tổng / phí / VAT: tổng đầu tiên = cộng hạng mục, tổng cuối cùng = tổng giá trị
    if (/^(tong|phi quan ly|vat|thue|chiet khau|giam gia)/.test(label)) {
      const v = num(get('tt')) ?? [...r].reverse().map(num).find((x) => x != null && x > 1000);
      if (v == null) continue;
      if (/^tong/.test(label)) {
        if (totals.subtotal == null) totals.subtotal = v;
        totals.total = v;
      } else if (/phi quan ly/.test(label)) totals.fee = v;
      else if (/^(vat|thue)/.test(label)) totals.vat = v;
      else if (/chiet khau|giam gia/.test(label)) totals.discount = v;
      else {
        if (totals.subtotal == null) totals.subtotal = v;
        totals.total = v;
      }
      continue;
    }
    if (ROMAN.test(fold(stt))) {
      section = nd || stt;
      grp = '';
      lastNd = '';
      continue;
    }
    if (stt && !/^\d+([.,]\d+)?$/.test(stt)) grp = stt;
    if (nd) lastNd = nd;
    const qty = num(get('sl'));
    const price = num(get('dg'));
    const rawTT = get('tt');
    const isOption = cells.some((c) => /^option/.test(fold(c)));
    let amount = num(rawTT);
    if (amount == null && qty != null && price != null) amount = qty * price * (num(get('ngay')) || 1);
    // Tên hạng mục: "Nhãn: mô tả" trong cột Bao gồm thì lấy nhãn (VD "Giám sát: …")
    const m = bg.match(/^([^:]{2,45}):\s*(.+)$/);
    const bgLabel = m && !/^bao gom/.test(fold(m[1])) ? m[1].trim() : '';
    let name = nd || bgLabel || lastNd || bg.slice(0, 60);
    if (nd && bgLabel && /van hanh|ban to chuc|nhan su/.test(fold(nd))) name = bgLabel;
    if (!name) continue;
    if (!nd && !bg && qty == null && price == null) continue;
    items.push({
      section, grp, name: name.replace(/\s+/g, ' ').trim(), detail: bg, qty, unit: txt(get('dvt')), unit_price: price,
      days: txt(get('ngay')), amount: isOption ? (qty != null && price != null ? qty * price : amount) : amount,
      note: txt(get('gc')), is_option: isOption, chosen: !isOption,
    });
  }
  const sum = items.filter((x) => x.chosen).reduce((a, x) => a + (x.amount || 0), 0);
  return { title, client, items, totals: { ...totals, items_sum: sum } };
}

// ---------------------------------------------------------------------------
// 2. Sinh checklist (quy tắc của skill fairplay-event-checklist)
// ---------------------------------------------------------------------------
const K = {
  plan: 'Lập kế hoạch & Tư vấn', venue: 'Đề xuất & Chốt sân', contract: 'Hợp đồng & Tài chính', staff: 'Chốt nhân sự vận hành',
  design: 'Design thiết kế ấn phẩm', print: 'Sản xuất & in ấn', award: 'Giải thưởng', equip: 'Chuẩn bị thiết bị & hậu cần',
  tech: 'Bốc thăm & Kỹ thuật', exp: 'Setup & Bên lề', media: 'Truyền thông', food: 'Ăn uống & Tiệc', reg: 'Đăng ký VĐV',
  ops: 'Vận hành ngày thi đấu', post: 'Sau sự kiện',
};
const has = (s, re) => re.test(s);
const cap = (s) => { const t = txt(s).toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const qtyTxt = (it) => (it.qty != null ? ` (${Math.round(it.qty * 100) / 100} ${it.unit || ''})`.replace(/\s+\)/, ')') : '');

// Mỗi luật: điều kiện trên chuỗi đã chuẩn hoá → danh sách việc [category, title, offset, phase?]
const RULES = [
  [/khao sat .*tu van|tu van .*giai|khao sat nhu cau/, (it) => [[K.plan, 'Khảo sát nhu cầu, phân tích brief', -45], [K.plan, 'Kick-off meeting với khách hàng', -40]]],
  [/thiet ke chuyen mon|dieu le|the thuc/, () => [[K.plan, 'Xây điều lệ, thể thức thi đấu', -35]]],
  [/lap ke hoach|ke hoach trien khai|timeline/, () => [[K.plan, 'Lập kế hoạch triển khai, timeline', -35]]],
  [/hop ky thuat|boc tham/, (it, s) => [[K.tech, 'Họp kỹ thuật với khách hàng', -14], [K.tech, has(s, /live|truc tiep|online/) ? 'Bốc thăm chia bảng (livestream/online)' : 'Bốc thăm chia bảng', -10], [K.tech, 'Phát lịch thi đấu cho VĐV', -7]]],
  [/website|phan mem|livescore/, (it) => [[K.tech, `Dựng ${it.name}`, -10], [K.tech, 'Test phần mềm/website thi đấu', -7], [K.ops, 'Cập nhật tỉ số, kết quả trực tiếp', 0]]],
  [/san bai|setup san|thue san|san thi dau|dia diem/, () => [[K.venue, 'Gửi đề xuất sân cho khách review', -40], [K.venue, 'Khảo sát thực địa sân được chọn', -35], [K.venue, 'Chốt sân & đặt cọc', -30], [K.venue, 'Xác nhận lần cuối & thanh toán sân', -3]]],
  [/trong tai/, (it) => [[K.staff, `Chốt ${it.name}${qtyTxt(it)}`, -10], [K.staff, 'Brief luật thi đấu & cách tính điểm cho trọng tài', -1, 'during']]],
  [/nhom nhay|mua|van nghe|tiet muc/, (it) => [[K.staff, `Book ${it.name}${qtyTxt(it)}`, -14], [K.staff, `Duyệt tiết mục ${it.name} (ảnh/video)`, -7]]],
  [/\bmc\b|dan chuong trinh/, (it) => [[K.staff, `Chốt MC${qtyTxt(it)}`, -14], [K.staff, 'Gửi & thống nhất kịch bản MC', -3]]],
  [/mascot/, (it) => [[K.exp, `Đặt Mascot${qtyTxt(it)}`, -14], [K.exp, 'Lên kịch bản xuất hiện Mascot', -7]]],
  [/\bpg\b|le tan/, (it) => [[K.staff, `Chốt PG${qtyTxt(it)}`, -7], [K.staff, 'Brief công việc cho PG (check-in, trao giải)', -1, 'during']]],
  [/y te/, (it) => [[K.staff, `Chốt nhân sự y tế${qtyTxt(it)} & vật tư sơ cứu`, -7]]],
  [/livestream|live stream|binh luan vien/, (it) => [[K.staff, `Chốt ${it.name}${qtyTxt(it)}`, -10], [K.ops, 'Setup & test livestream', -1, 'during'], [K.ops, 'Livestream trận đấu', 0]]],
  [/thiet ke|poster|social|branding|key visual/, (it) => [[K.media, 'Lên timeline truyền thông', -30], [K.design, 'Thiết kế Key Visual & bộ nhận diện giải', -25], [K.media, `${it.name.length > 12 ? it.name : 'Thiết kế bộ ấn phẩm social (poster, thư mời)'}${qtyTxt(it)}`, -21]]],
  [/buc trao giai|buc vinh danh/, (it) => [[K.award, `Chuẩn bị ${it.name}`, -3], [K.ops, `Setup ${it.name}`, -1, 'during']]],
  [/chup anh|nhiep anh|quay phim|video|flycam/, (it, s) => [[K.staff, `Chốt ${it.name}${qtyTxt(it)}`, -10], [K.post, 'Gửi ảnh/video cho khách hàng', 3], ...(has(s, /quay|video|flycam/) ? [[K.post, 'Dựng & gửi video recap', 21]] : [])]],
  [/dieu hanh|giam sat|nhan su|ban to chuc|ho tro|check-?in thi dau/, (it) => [[K.staff, `Chốt ${it.name}${qtyTxt(it)}`, -10]]],
  [/ao dau|ao thi dau|dong phuc|\bao\b/, (it) => [[K.design, 'Thiết kế & chốt mẫu áo đấu', -25], [K.print, `Chốt size & đặt may áo${qtyTxt(it)}`, -21], [K.print, 'Nhận áo, kiểm tra số lượng & size', -5]]],
  [/cup|huy chuong|ky niem chuong|bang danh vi|giai thuong|cu?p/, (it) => [[K.award, `Thiết kế & đặt ${it.name}${qtyTxt(it)}`, -10], [K.award, `Nhận & kiểm tra ${it.name}`, -3]]],
  [/backdrop|back drop|standee|banner|co phuon|co canh buom|\bco\b|fomex|cong hoi|cong khung|photobook|hashtag|welcome kit|so qua|tui|bang chi duong|tru & bang|bien|poster|thu moi|an pham/,
    (it) => [[K.design, `Thiết kế ${it.name}`, -25], [K.print, `Sản xuất ${it.name}${qtyTxt(it)}`, -15], [K.ops, `Lắp đặt / bày trí ${it.name}`, -1, 'during']]],
  [/bong thi dau|\bbong\b|qua cau|ong cau|cau long|\bcau\b|vot|dung cu thi dau/, (it) => [[K.equip, `Đặt ${it.name}${qtyTxt(it)}`, -7], [K.equip, `Test ${it.name} trước giải`, -2]]],
  [/nuoc|revive|lavie|dien giai/, (it) => [[K.equip, `Đặt ${it.name}${qtyTxt(it)} — giao tại sân`, -3]]],
  [/do an|banh|hoa qua|suat an|an nhe/, (it) => [[K.food, `Chốt & đặt ${it.name}${qtyTxt(it)}`, -3]]],
  [/gala|dinner|tiec|beer|bia|networking|coffee|tra chieu|tea break|an trua|an toi/, (it) => {
    const label = /gala|tiec|an trua|an toi|dinner|beer/.test(fold(it.section)) ? cap(it.section) : it.name;
    if (/ban ghe/.test(fold(it.name))) return [[K.food, `Thuê bàn ghế ${label}${qtyTxt(it)}`, -5]];
    return [[K.food, `Xác nhận ngân sách & số lượng khách ${label}`, -21], [K.food, `Chốt thực đơn ${label}${qtyTxt(it)}`, -7], [K.food, `Setup & phục vụ ${label}`, 0]];
  }],
  [/am thanh|loa|micro|ampli|anh sang|san khau|led|man hinh|tivi|\btv\b/, (it) => [[K.equip, `Đặt ${it.name}${qtyTxt(it)}`, -7], [K.ops, `Setup & test ${it.name}`, -1, 'during']]],
  [/photobooth|minigame|mini game|target zone|trai nghiem|khu vui choi|phao/, (it) => [[K.exp, `Lên kịch bản ${it.name}`, -14], [K.exp, `Setup ${it.name}`, -1, 'during'], [K.exp, `Vận hành ${it.name}`, 0]]],
  [/ban ghe|o lech tam|cot sat|day nhung|thanh rao|leu|nha bat|thue/, (it) => [[K.equip, `Thuê ${it.name}${qtyTxt(it)}`, -5]]],
  [/van chuyen/, (it) => [[K.equip, 'Đặt vận chuyển 2 chiều vật dụng', -3], [K.post, 'Vận chuyển vật dụng về sau giải', 0]]],
  [/truyen thong|social|bai dang|livestream|bao chi/, (it) => [[K.media, 'Lên timeline truyền thông', -30], [K.media, `Triển khai ${it.name}`, -21]]],
];

// Việc luôn có (trách nhiệm PM — không nằm trong báo giá)
const DEFAULTS = [
  [K.contract, 'Ký hợp đồng dịch vụ', -28, 'before', 'contract'],
  [K.reg, 'Mở form đăng ký VĐV & truyền thông đăng ký', -30],
  [K.reg, 'Chốt & tổng hợp danh sách VĐV', -10],
  [K.plan, 'Kịch bản xử lý tình huống (VĐV bỏ giải, chấn thương, phần mềm lỗi)', -7],
  [K.plan, 'Checklist vật dụng tổng thể', -3],
  [K.ops, 'Walkthrough kiểm tra sân (PM + đại diện khách)', -1, 'during'],
  [K.ops, 'Check-in VĐV, phát áo/kit', 0],
  [K.ops, 'Lễ khai mạc (theo kịch bản)', 0],
  [K.ops, 'Y tế trực chờ suốt giải', 0],
  [K.ops, 'Lễ bế mạc & trao giải', 0],
  [K.post, 'Thu dọn, bàn giao mặt bằng', 0, 'after'],
  [K.post, 'Nghiệm thu với khách hàng (ký biên bản)', 1, 'after', 'acceptance'],
  [K.post, 'Bài tổng kết giải', 2],
  [K.post, 'Trả thưởng tiền mặt cho VĐV (nếu có)', 7],
  [K.post, 'Thanh toán nhà cung cấp / đối tác', 7],
  [K.post, 'Quyết toán chi phí với khách hàng', 7],
  [K.post, 'Báo cáo sự kiện (KPI, kết quả, bài học)', 14],
];

const phaseOf = (off, forced) => forced || (off < -1 ? 'before' : off <= 0 ? 'during' : 'after');
export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dLabel = (off) => (off == null ? '' : off === 0 ? 'Ngày D' : `D${off > 0 ? '+' : ''}${off}`);

// items: hạng mục đã chọn (kèm id nếu đã lưu). payments: đợt thu tiền khách.
export function generateChecklist({ items, eventDate, today, payments = [] }) {
  const out = [];
  const seen = new Set();
  const push = (category, title, offset, forcedPhase, item, extra = {}) => {
    const key = fold(title);
    if (seen.has(key)) return;
    seen.add(key);
    let due = eventDate ? addDays(eventDate, offset) : null;
    let note = '';
    if (due && today && due < today && offset < 0) {
      note = `⚠️ Gấp: mốc chuẩn ${dLabel(offset)} đã qua`;
      due = today;
    }
    out.push({ phase: phaseOf(offset, forcedPhase), category, title, detail: item ? itemDetail(item) : '', offset_days: offset, due_date: due, note, item_ref: item?.ref ?? null, status: 'todo', ...extra });
  };
  for (const [cat, title, off, ph, kind] of DEFAULTS) {
    if (kind === 'acceptance' || kind === 'contract') push(cat, title, off, ph, null, { kind });
    else push(cat, title, off, ph);
  }
  for (const p of payments) {
    const off = p.offset_days ?? -3;
    push(K.contract, `Thu ${p.label}${p.amount ? ` — ${money(p.amount)}` : ''}`, off, off > 0 ? 'after' : 'before', null, { kind: 'payment' });
  }
  for (const it of items) {
    if (it.is_option && !it.chosen) continue;
    const s = fold(`${it.name} ${it.grp} ${it.section} ${it.detail}`);
    const sName = fold(`${it.name} ${it.grp} ${it.section}`);
    const rule = RULES.find(([re]) => re.test(sName)) || RULES.find(([re]) => re.test(s));
    const tasks = rule ? rule[1](it, s) : [[K.equip, `Chuẩn bị: ${it.name}${qtyTxt(it)}`, -7]];
    for (const [cat, title, off, ph] of tasks) push(it.is_extra ? `${cat} · Phát sinh` : cat, it.is_extra ? `${title} (phát sinh)` : title, off, ph, it);
  }
  const order = { before: 0, during: 1, after: 2 };
  out.sort((a, b) => order[a.phase] - order[b.phase] || a.offset_days - b.offset_days);
  out.forEach((t, i) => (t.sort = i));
  return out;
}

// Việc cho riêng 1 hạng mục (dùng khi thêm phát sinh / khách chốt thêm Option)
export function tasksForItem(it, eventDate, today, existingTitles = []) {
  const s = fold(`${it.name} ${it.grp} ${it.section} ${it.detail}`);
  const sName = fold(`${it.name} ${it.grp} ${it.section}`);
  const rule = RULES.find(([re]) => re.test(sName)) || RULES.find(([re]) => re.test(s));
  const raw = rule ? rule[1](it, s) : [[K.equip, `Chuẩn bị: ${it.name}${qtyTxt(it)}`, -7]];
  const seen = new Set(existingTitles.map(fold));
  return raw.map(([cat, title, off, ph]) => {
    const t = it.is_extra ? `${title} (phát sinh)` : title;
    let due = eventDate ? addDays(eventDate, off) : null;
    let note = '';
    if (due && today && due < today) { note = `⚠️ Gấp: mốc chuẩn ${dLabel(off)} đã qua`; due = today; }
    return { phase: phaseOf(off, ph), category: it.is_extra ? `${cat} · Phát sinh` : cat, title: t, detail: itemDetail(it), offset_days: off, due_date: due, note, status: 'todo' };
  }).filter((t) => !seen.has(fold(t.title)));
}

function itemDetail(it) {
  const parts = [];
  if (it.detail && fold(it.detail) !== fold(it.name)) parts.push(it.detail);
  if (it.qty != null) parts.push(`SL: ${it.qty} ${it.unit || ''}`.trim());
  if (it.note) parts.push(it.note);
  if (it.is_extra) parts.push(`Phát sinh${it.extra_by ? ' — yêu cầu bởi ' + it.extra_by : ''}`);
  return parts.join(' · ').slice(0, 600);
}

export const money = (v) => (v == null || v === '' ? '' : Math.round(Number(v)).toLocaleString('vi-VN') + 'đ');

// Thanh toán mặc định: 2 đợt — cọc 70% trước giải 3 ngày, 30% trong 3 ngày sau nghiệm thu
export function defaultPayments(total, eventDate) {
  const t = Number(total) || 0;
  return [
    { label: 'Đợt 1 — cọc 70%', percent: 70, amount: Math.round(t * 0.7), offset_days: -3, due_rule: 'Trước khai mạc 3 ngày', due_date: eventDate ? addDays(eventDate, -3) : null, sort: 0 },
    { label: 'Đợt 2 — 30% còn lại', percent: 30, amount: t - Math.round(t * 0.7), offset_days: 4, due_rule: 'Trong 3 ngày sau nghiệm thu', due_date: eventDate ? addDays(eventDate, 4) : null, sort: 1 },
  ];
}

// ---------------------------------------------------------------------------
// 3. Đọc file checklist Excel do Claude/skill tạo
// ---------------------------------------------------------------------------
// members: [{id, full_name}] để khớp PIC
export function parseChecklistFile(sheets, members = []) {
  const out = [];
  for (const { name, rows } of sheets) {
    let h = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = rows[i] || [];
      if (findCol(r, (s) => s === 'task' || s.startsWith('cong viec')) >= 0 && findCol(r, (s) => s.startsWith('deadline') || s === 'han' || s.startsWith('han chot')) >= 0) {
        h = i;
        break;
      }
    }
    if (h < 0) continue;
    const top = rows[h];
    const C = {
      cat: findCol(top, (s) => s.startsWith('hang muc')),
      task: findCol(top, (s) => s === 'task' || s.startsWith('cong viec')),
      detail: findCol(top, (s) => s.startsWith('chi tiet')),
      pic: findCol(top, (s) => s.startsWith('pic')),
      supc: findCol(top, (s) => s.startsWith('sup') && s.includes('khach')),
      supf: findCol(top, (s) => s.startsWith('sup') && s.includes('fairplay')),
      due: findCol(top, (s) => s.startsWith('deadline') || s === 'han' || s.startsWith('han chot')),
      st: findCol(top, (s) => s.startsWith('tinh trang') || s.startsWith('trang thai')),
      note: findCol(top, (s) => s.startsWith('ghi chu')),
    };
    let phase = 'before';
    let cat = '';
    const tasks = [];
    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const cells = r.map(txt);
      const filled = cells.filter(Boolean);
      if (!filled.length) continue;
      const f0 = fold(filled[0]);
      if (/truoc su kien|truoc giai/.test(f0)) { phase = 'before'; continue; }
      if (/trong su kien|trong giai|ngay thi dau/.test(f0)) { phase = 'during'; continue; }
      if (/sau su kien|sau giai/.test(f0)) { phase = 'after'; continue; }
      const title = txt(r[C.task]);
      if (!title) {
        if (filled.length === 1) cat = filled[0].replace(/^[▶⚠️\s]+/u, '');
        continue;
      }
      const dueTxt = txt(r[C.due]);
      const dm = dueTxt.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const om = dueTxt.match(/D\s*([+-])\s*(\d+)/i);
      const picTxt = txt(r[C.pic]);
      const member = matchMember(picTxt, members);
      // Có file ghi trạng thái nhầm sang cột Deadline (VD "Đã hoàn thành")
      const st = fold(r[C.st]) || (!dm && /hoan thanh|done|dang|da ky/.test(fold(dueTxt)) ? fold(dueTxt) : '');
      tasks.push({
        phase, category: txt(r[C.cat]) || cat, title, detail: txt(r[C.detail]),
        pic_id: member?.id ?? null, pic_name: member ? null : picTxt || null,
        sup_client: txt(r[C.supc]) || null, sup_fp: txt(r[C.supf]) || null,
        due_date: dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null,
        offset_days: om ? (om[1] === '-' ? -1 : 1) * Number(om[2]) : /^ngay d\b|\(d\)/.test(fold(dueTxt)) ? 0 : null,
        status: /hoan thanh|done|da ky|da xong/.test(st) ? 'done' : /dang|progress/.test(st) ? 'doing' : 'todo',
        note: [txt(r[C.note]), C.st >= 0 && !/hoan thanh|done|dang|progress/.test(st) ? txt(r[C.st]) : ''].filter(Boolean).join(' · ') || null,
      });
    }
    if (tasks.length) out.push({ sheet: name.trim(), tasks: tasks.map((t, i) => ({ ...t, sort: i })) });
  }
  return out;
}

export function matchMember(text, members) {
  const f = fold(text);
  if (!f) return null;
  return members.find((m) => fold(m.full_name) === f) ||
    members.find((m) => f.includes(fold(m.full_name))) ||
    members.find((m) => {
      const w = fold(m.full_name).split(' ');
      const short = w.slice(-2).join(' ');
      return short.length > 3 && f.includes(short);
    }) || null;
}

// Tiến độ & cảnh báo của 1 giải (dùng cho danh sách)
export function eventHealth(ev, { tasks = [], payments = [], items = [] }, today) {
  const t = tasks.filter((x) => x.event_id === ev.id);
  const done = t.filter((x) => x.status === 'done').length;
  const overdue = t.filter((x) => x.status !== 'done' && x.due_date && x.due_date < today).length;
  const p = payments.filter((x) => x.event_id === ev.id);
  const it = items.filter((x) => x.event_id === ev.id && x.chosen);
  const warn = [];
  if (!ev.contract_signed_at && ev.contract_deadline && ev.contract_deadline < today) warn.push('Quá hạn ký HĐ');
  const late = p.filter((x) => x.status !== 'paid' && x.due_date && x.due_date < today);
  const soon = p.filter((x) => x.status !== 'paid' && x.due_date && x.due_date >= today && x.due_date <= addDays(today, 3));
  if (late.length) warn.push('Khách quá hạn thanh toán');
  else if (soon.length) warn.push('Sắp đến hạn — nhắc khách');
  const nccLate = it.filter((x) => x.supplier_status !== 'paid' && x.supplier_status !== 'none' && x.supplier_due && x.supplier_due < today);
  if (nccLate.length) warn.push(`${nccLate.length} NCC quá hạn trả`);
  const issues = it.filter((x) => x.supplier_issue && x.supplier_status !== 'paid').length;
  if (issues) warn.push(`${issues} khoản NCC đang vướng`);
  const contract = it.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  return {
    tasks: t.length, done, overdue, pct: t.length ? Math.round((done / t.length) * 100) : 0,
    paidIn: p.reduce((a, x) => a + (Number(x.paid_amount) || 0), 0), dueIn: p.reduce((a, x) => a + (Number(x.amount) || 0), 0),
    cost: it.reduce((a, x) => a + (Number(x.cost_amount) || 0), 0), paidOut: it.reduce((a, x) => a + (Number(x.supplier_paid) || 0), 0),
    contract, extras: it.filter((x) => x.is_extra).reduce((a, x) => a + (Number(x.amount) || 0), 0), warn,
  };
}

// ===========================================================================
// MUMMII — Dự án theo loại (không có mẫu báo giá cố định → sinh checklist theo mẫu)
// Mốc D = ngày bàn giao (video) / ngày bắt đầu chiến dịch / ngày KOL đăng / ngày khai giảng.
// ===========================================================================
export const PROJECT_TYPES = {
  video: {
    label: 'MV / Phim ngắn / TVC', anchor: 'Ngày bàn giao', icon: '🎬',
    phases: { p1: 'Tiền kỳ', p2: 'Sản xuất (quay)', p3: 'Hậu kỳ', p4: 'Bàn giao & phát hành' },
    tasks: [
      ['p1', 'Brief & ý tưởng', 'Nhận brief, họp kick-off với khách', -30], ['p1', 'Brief & ý tưởng', 'Lên concept / ý tưởng sáng tạo', -28],
      ['p1', 'Kịch bản', 'Viết kịch bản', -25], ['p1', 'Kịch bản', 'Khách duyệt kịch bản', -22], ['p1', 'Kịch bản', 'Storyboard / shotlist', -20],
      ['p1', 'Nhân sự & bối cảnh', 'Casting diễn viên / KOL', -20], ['p1', 'Nhân sự & bối cảnh', 'Chọn & khảo sát location', -18],
      ['p1', 'Nhân sự & bối cảnh', 'Chốt ekip quay & thiết bị', -16], ['p1', 'Nhân sự & bối cảnh', 'Đạo cụ, phục trang, makeup', -15],
      ['p1', 'Kế hoạch quay', 'Lập kế hoạch quay & call sheet', -16], ['p1', 'Kế hoạch quay', 'Xin phép quay tại địa điểm (nếu cần)', -15],
      ['p2', 'Ngày quay', 'Brief ekip & kiểm tra thiết bị trước ngày quay', 'shoot-1'], ['p2', 'Ngày quay', 'Quay chính', 'shoot'],
      ['p2', 'Ngày quay', 'Backup dữ liệu ngay sau buổi quay (2 nơi)', 'shoot'], ['p2', 'Ngày quay', 'Quay bổ sung (nếu cần)', 'shoot+2'],
      ['p3', 'Dựng', 'Dựng bản nháp (rough cut)', -10], ['p3', 'Dựng', 'Gửi khách duyệt bản nháp', -8], ['p3', 'Dựng', 'Chỉnh sửa vòng 1', -6],
      ['p3', 'Hoàn thiện', 'Color grading', -5], ['p3', 'Hoàn thiện', 'Âm thanh, nhạc, mix', -5], ['p3', 'Hoàn thiện', 'Phụ đề, đồ hoạ, logo', -4],
      ['p3', 'Dựng', 'Chỉnh sửa vòng 2', -3], ['p3', 'Dựng', 'Khách duyệt bản cuối', -2],
      ['p4', 'Bàn giao', 'Xuất file các định dạng (16:9, 9:16, 1:1)', -1], ['p4', 'Bàn giao', 'Bàn giao file thành phẩm & nguồn', 0],
      ['p4', 'Phát hành', 'Đăng / phát hành theo lịch', 0], ['p4', 'Nghiệm thu', 'Nghiệm thu & thu tiền đợt cuối', 3],
      ['p4', 'Phát hành', 'Báo cáo số liệu sau 7 ngày', 7], ['p4', 'Lưu trữ', 'Lưu trữ dự án (footage, project file)', 7],
    ],
  },
  campaign: {
    label: 'Chiến dịch truyền thông / Xây kênh', anchor: 'Ngày bắt đầu chiến dịch', icon: '📣',
    phases: { p1: 'Kế hoạch', p2: 'Sản xuất nội dung', p3: 'Triển khai', p4: 'Báo cáo & nghiệm thu' },
    tasks: [
      ['p1', 'Kế hoạch', 'Nhận brief & mục tiêu chiến dịch', -14], ['p1', 'Kế hoạch', 'Nghiên cứu đối thủ, insight khách hàng', -12],
      ['p1', 'Kế hoạch', 'Kế hoạch & KPI chiến dịch', -10], ['p1', 'Kế hoạch', 'Khách duyệt kế hoạch', -7],
      ['p2', 'Sáng tạo', 'Key visual & bộ nhận diện chiến dịch', -7], ['p2', 'Sáng tạo', 'Content calendar (lịch đăng)', -7],
      ['p2', 'Sản xuất', 'Sản xuất lô nội dung tuần đầu', -3], ['p2', 'Sản xuất', 'Khách duyệt nội dung', -2],
      ['p3', 'Triển khai', 'Đăng bài & seeding', 0], ['p3', 'Triển khai', 'Chạy quảng cáo (nếu có)', 0], ['p3', 'Theo dõi', 'Theo dõi tương tác & tối ưu', 3],
      ['p4', 'Báo cáo', 'Báo cáo giữa kỳ', 14], ['p4', 'Báo cáo', 'Báo cáo tổng kết', 30], ['p4', 'Nghiệm thu', 'Nghiệm thu & thu tiền đợt cuối', 33],
    ],
  },
  kol: {
    label: 'Booking KOL / KOC', anchor: 'Ngày KOL đăng bài', icon: '⭐',
    phases: { p1: 'Đề xuất', p2: 'Ký kết', p3: 'Sản xuất nội dung', p4: 'Đăng & nghiệm thu' },
    tasks: [
      ['p1', 'Đề xuất', 'Nhận brief & ngân sách', -21], ['p1', 'Đề xuất', 'Đề xuất danh sách KOL/KOC (kèm số liệu kênh)', -18], ['p1', 'Đề xuất', 'Khách duyệt danh sách', -15],
      ['p2', 'Ký kết', 'Deal giá & lịch đăng với KOL', -12], ['p2', 'Ký kết', 'Ký hợp đồng / xác nhận với KOL', -10],
      ['p3', 'Nội dung', 'Gửi brief & sản phẩm cho KOL', -9], ['p3', 'Nội dung', 'KOL gửi nội dung nháp', -5], ['p3', 'Nội dung', 'Khách duyệt nội dung', -3],
      ['p4', 'Đăng bài', 'KOL đăng bài', 0], ['p4', 'Đăng bài', 'Kiểm tra link & số liệu', 3], ['p4', 'Thanh toán', 'Thanh toán KOL', 7], ['p4', 'Nghiệm thu', 'Báo cáo nghiệm thu cho khách', 7],
    ],
  },
  course: {
    label: 'Khoá đào tạo content creator', anchor: 'Ngày khai giảng', icon: '🎓',
    phases: { p1: 'Chuẩn bị', p2: 'Tuyển sinh', p3: 'Giảng dạy', p4: 'Tổng kết' },
    tasks: [
      ['p1', 'Chương trình', 'Hoàn thiện giáo trình & tài liệu', -30], ['p1', 'Chương trình', 'Chốt lịch học & giảng viên', -25], ['p1', 'Chương trình', 'Chuẩn bị phòng học / link học online', -5],
      ['p2', 'Tuyển sinh', 'Landing page / form đăng ký', -21], ['p2', 'Tuyển sinh', 'Truyền thông tuyển sinh (group, fanpage)', -21],
      ['p2', 'Tuyển sinh', 'Tư vấn & chốt học viên', -7], ['p2', 'Tuyển sinh', 'Chốt danh sách & thu học phí', -3], ['p2', 'Tuyển sinh', 'Nhắc lịch học viên', -1],
      ['p3', 'Giảng dạy', 'Khai giảng', 0], ['p3', 'Giảng dạy', 'Điểm danh & giao bài tập các buổi', 1], ['p3', 'Giảng dạy', 'Chấm & phản hồi bài tập', 7],
      ['p4', 'Tổng kết', 'Tổng kết & cấp chứng nhận', 30], ['p4', 'Tổng kết', 'Khảo sát học viên & bài học rút ra', 31],
    ],
  },
  other: {
    label: 'Dự án khác', anchor: 'Ngày hoàn thành', icon: '📌',
    phases: { p1: 'Chuẩn bị', p2: 'Thực hiện', p3: 'Kiểm tra', p4: 'Bàn giao' },
    tasks: [['p1', 'Chuẩn bị', 'Nhận brief & kick-off', -14], ['p1', 'Chuẩn bị', 'Lập kế hoạch & phân công', -12], ['p2', 'Thực hiện', 'Triển khai', -7],
      ['p3', 'Kiểm tra', 'Khách duyệt', -2], ['p4', 'Bàn giao', 'Bàn giao & nghiệm thu', 0], ['p4', 'Bàn giao', 'Thu tiền đợt cuối', 3]],
  },
};

// Sinh checklist cho 1 dự án. shoot: ngày quay (dự án video), nếu thiếu lấy D-14
export function generateProject({ type, anchor, shoot, today, payments = [], contractSigned = false }) {
  const T = PROJECT_TYPES[type] || PROJECT_TYPES.other;
  const shootDate = shoot || (anchor ? addDays(anchor, -14) : null);
  const out = [];
  const push = (phase, category, title, due, offset, extra = {}) => {
    let note = '';
    if (due && today && due < today) { note = '⚠️ Gấp: mốc chuẩn đã qua'; due = today; }
    out.push({ phase, category, title, due_date: due, offset_days: offset, note, status: 'todo', ...extra });
  };
  push('p1', 'Hợp đồng & tài chính', 'Ký hợp đồng với khách', anchor ? addDays(anchor, -28) : null, -28, { status: contractSigned ? 'done' : 'todo', note: '' });
  for (const [ph, cat, title, rel] of T.tasks) {
    let due = null;
    let off = null;
    if (typeof rel === 'number') { off = rel; due = anchor ? addDays(anchor, rel) : null; }
    else if (shootDate) {
      const m = String(rel).match(/^shoot([+-]\d+)?$/);
      const k = m && m[1] ? Number(m[1]) : 0;
      due = addDays(shootDate, k);
      off = anchor ? Math.round((new Date(due) - new Date(anchor)) / 86400000) : null;
    }
    push(ph, cat, title, due, off);
  }
  for (const p of payments) push(p.offset_days > 0 ? 'p4' : 'p1', 'Hợp đồng & tài chính', `Thu ${p.label}${p.amount ? ` — ${money(p.amount)}` : ''}`, p.due_date, p.offset_days ?? null);
  return out.map((t, i) => ({ ...t, sort: i }));
}
