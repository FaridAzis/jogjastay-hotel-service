// Dashboard staf JogjaStay — SPA sederhana berbasis hash (#overview, #bookings, ...).
// Semua data lewat /api/v1/admin/* (cookie sesi). Admin melihat menu tambahan (Akun Staf, Integrasi API).
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = (iso) => { if (!iso) return '–'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const fmtTime = (iso) => { if (!iso) return '–'; const d = new Date(iso); return `${fmtDate(d.toLocaleDateString('en-CA'))} ${d.toTimeString().slice(0, 5)}`; };
const PLACEHOLDER = '/img/room-placeholder.svg';

const STATUS = { confirmed: 'Confirmed', checked_in: 'Menginap', checked_out: 'Selesai', cancelled: 'Dibatalkan' };
const PAY = { unpaid: 'Belum bayar', paid: 'Lunas', refunded: 'Refund penuh', partially_refunded: 'Refund sebagian' };
const ROLE = { admin: 'Admin', receptionist: 'Resepsionis' };
const METHODS = ['tunai', 'transfer', 'kartu', 'e-wallet', 'qris'];
const ACTION_LABEL = {
  'booking.create': 'Booking dibuat', 'booking.pay': 'Pembayaran', 'booking.cancel': 'Dibatalkan', 'booking.check_in': 'Check-in',
  'booking.check_out': 'Check-out', 'booking.update': 'Data diubah', 'auth.login': 'Login', 'auth.logout': 'Logout',
  'auth.login_failed': 'Login gagal', 'room.create': 'Kamar ditambah', 'room.update': 'Kamar diubah', 'room.delete': 'Kamar dihapus',
  'hotel.create': 'Hotel ditambah', 'hotel.update': 'Hotel diubah', 'user.create': 'Staf ditambah', 'user.update': 'Staf diubah',
  'client.rotate': 'Token Itinerary diganti', 'client.revoke': 'Akses Itinerary dicabut', 'client.enable': 'Akses Itinerary diaktifkan', seed: 'Data awal disiapkan',
};

const ICONS = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  bed: '<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M7 9V6h10v3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 3.5 6"/>',
  plug: '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  in: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (n) => `<i data-icon="${n}"><svg viewBox="0 0 24 24">${ICONS[n] || ''}</svg></i>`;
function paintIcons(root = document) { $$('i[data-icon]:empty', root).forEach((i) => { i.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[i.dataset.icon] || ''}</svg>`; }); }

const state = { me: null, hotels: [], rooms: [], filters: { status: '', hotelId: '', source: '', q: '' } };
const isAdmin = () => state.me && state.me.role === 'admin';

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch('/api/v1' + path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
  let data = null; try { data = await res.json(); } catch { /* kosong */ }
  if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent('/dashboard' + location.hash); throw new Error('Sesi habis'); }
  if (!res.ok) throw new Error((data && data.message) || 'Terjadi kesalahan');
  return data;
}
function toast(msg, ok = true) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (ok ? '' : ' err'); t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 3800);
}
document.addEventListener('error', (e) => { const i = e.target; if (i.tagName === 'IMG' && !i.src.endsWith(PLACEHOLDER)) i.src = PLACEHOLDER; }, true);

// ---------- Drawer & modal ----------
function openDrawer(html) { $('#drawerPanel').innerHTML = html; $('#drawer').hidden = false; paintIcons($('#drawerPanel')); }
function closeDrawer() { $('#drawer').hidden = true; }
function openModal(html) { $('#modalPanel').innerHTML = html; $('#modal').hidden = false; paintIcons($('#modalPanel')); const f = $('#modalPanel input, #modalPanel select'); if (f) f.focus(); }
function closeModal() { $('#modal').hidden = true; }
document.addEventListener('click', (e) => {
  if (e.target.closest('#drawer [data-close]')) closeDrawer();
  if (e.target.closest('#modal [data-close]')) closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else closeDrawer(); } });

/** Modal form generik: fields = [{name,label,type,options,value,required,full,hint}] */
function formModal({ title, subtitle = '', fields, submit = 'Simpan', danger = false, onSubmit }) {
  const field = (f) => {
    const v = f.value ?? '';
    let input;
    if (f.type === 'select') input = `<select name="${f.name}" ${f.required ? 'required' : ''}>${f.options.map((o) => {
      const [val, lab] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="3">${esc(v)}</textarea>`;
    else input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`;
    return `<label class="field ${f.full ? 'full' : ''}"><span>${esc(f.label)}${f.hint ? ` <span class="hint">· ${esc(f.hint)}</span>` : ''}</span>${input}</label>`;
  };
  openModal(`<form class="m-body" id="mForm" novalidate>
      <h2>${esc(title)}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}
      <div class="form-grid">${fields.map(field).join('')}</div>
      <div class="form-error" id="mErr"></div>
      <div class="m-foot"><button type="button" class="btn btn-light" data-close>Batal</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="mSubmit">${esc(submit)}</button></div></form>`);
  $('#mForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const btn = $('#mSubmit'); btn.disabled = true; $('#mErr').textContent = '';
    try { await onSubmit(data); closeModal(); } catch (err) { $('#mErr').textContent = err.message; btn.disabled = false; }
  });
}

// ---------- Badges ----------
const statusBadge = (s) => `<span class="badge b-${s}">${STATUS[s] || s}</span>`;
const payBadge = (p) => `<span class="badge b-${p}">${PAY[p] || p}</span>`;
const srcBadge = (s) => `<span class="badge b-src">${esc(s)}</span>`;

// ---------- Router ----------
const VIEWS = { overview: ['Ringkasan', viewOverview], bookings: ['Reservasi', viewBookings], rooms: ['Kamar & Hotel', viewRooms],
  staff: ['Akun Staf', viewStaff], integrations: ['Integrasi API', viewIntegrations], activity: ['Log Aktivitas', viewActivity] };
async function route() {
  let key = (location.hash || '#overview').slice(1).split('?')[0];
  if (!VIEWS[key] || (['staff', 'integrations'].includes(key) && !isAdmin())) key = 'overview';
  $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.view === key));
  $('#viewTitle').textContent = VIEWS[key][0];
  $('#sidebar').classList.remove('open');
  const c = $('#content'); c.innerHTML = '<div class="loading">Memuat…</div>';
  try { await VIEWS[key][1](c); paintIcons(c); } catch (e) { c.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
$('#logoutBtn').onclick = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/login'; };

// ---------- Ringkasan ----------
async function viewOverview(c) {
  const [s, list, act] = await Promise.all([api('/admin/stats'), api(`/admin/bookings?limit=200`), api('/admin/activity?limit=8')]);
  const today = s.today;
  const arrivals = list.filter((b) => b.status === 'confirmed' && b.checkIn === today);
  const departures = list.filter((b) => b.status === 'checked_in' && b.checkOut <= today);
  const max = Math.max(1, ...s.next7Days.map((d) => d.occupied));
  const totalSrc = s.bySource.reduce((a, x) => a + x.count, 0) || 1;
  const day = (iso) => ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][new Date(iso + 'T00:00:00').getDay()];
  const row = (b, kind) => `<div class="list-item">
      <div class="grow"><b>${esc(b.guestName)} <span class="muted" style="font-weight:500">· ${esc(b.bookingId)}</span></b>
      <small>${esc(b.roomType)} · ${esc(b.hotelName)} · ${b.guests} tamu</small></div>
      ${payBadge(b.payment.status)}
      <button class="btn btn-sm ${kind === 'in' ? 'btn-primary' : 'btn-ok'}" data-quick="${kind}" data-id="${esc(b.bookingId)}">${kind === 'in' ? 'Check-in' : 'Check-out'}</button></div>`;

  c.innerHTML = `
    <div class="kpis">
      <div class="card kpi accent"><small>Okupansi hari ini</small><b>${s.occupancy.percent}%</b><span class="sub">${s.occupancy.occupied} dari ${s.occupancy.totalUnits} unit</span></div>
      <div class="card kpi"><small>${icon('in')}Kedatangan hari ini</small><b>${s.arrivalsToday}</b><span class="sub">menunggu check-in</span></div>
      <div class="card kpi"><small>${icon('out')}Check-out hari ini</small><b>${s.departuresToday}</b><span class="sub">tamu harus keluar</span></div>
      <div class="card kpi"><small>${icon('bed')}Sedang menginap</small><b>${s.inHouse}</b><span class="sub">tamu in-house</span></div>
      <div class="card kpi"><small>Belum bayar</small><b>${s.unpaid}</b><span class="sub">booking aktif</span></div>
      <div class="card kpi"><small>Pendapatan bulan ini</small><b style="font-size:1.25rem">${rupiah(s.revenueThisMonth)}</b><span class="sub">bersih setelah refund</span></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><div><h2>Kedatangan hari ini</h2><p>${fmtDate(today)}</p></div><a class="btn btn-sm btn-ghost" href="#bookings">Semua reservasi</a></div>
        <div class="list">${arrivals.length ? arrivals.map((b) => row(b, 'in')).join('') : '<div class="empty">Tidak ada tamu yang dijadwalkan datang hari ini.</div>'}</div>
        <div class="card-head" style="border-top:1px solid var(--line)"><div><h2>Check-out hari ini</h2></div></div>
        <div class="list">${departures.length ? departures.map((b) => row(b, 'out')).join('') : '<div class="empty">Tidak ada check-out hari ini.</div>'}</div>
      </div>
      <div style="display:grid;gap:20px;align-content:start">
        <div class="card"><div class="card-head"><div><h2>Okupansi 7 hari ke depan</h2><p>Unit terisi per malam</p></div></div>
          <div class="card-body"><div class="bars">${s.next7Days.map((d, i) => `<div class="bar ${i === 0 ? 'today' : ''}">
            <span class="val">${d.occupied}</span><div class="fill" style="height:${Math.round((d.occupied / max) * 120) + 4}px"></div>
            <small>${i === 0 ? 'Hari ini' : day(d.date) + ' ' + +d.date.slice(8)}</small></div>`).join('')}</div></div></div>
        <div class="card"><div class="card-head"><div><h2>Sumber booking</h2><p>Website, walk-in, dan aplikasi partner</p></div></div>
          <div class="card-body">${s.bySource.map((x) => `<div class="src-row"><span>${esc(x.source)}</span><b>${x.count}</b>
            <div class="meter"><i style="width:${Math.round((x.count / totalSrc) * 100)}%"></i></div></div>`).join('') || '<div class="muted">Belum ada data.</div>'}</div></div>
      </div>
    </div>

    <div class="card"><div class="card-head"><div><h2>Aktivitas terbaru</h2></div><a class="btn btn-sm btn-ghost" href="#activity">Lihat semua</a></div>
      ${activityTable(act)}</div>`;

  $$('[data-quick]', c).forEach((b) => b.onclick = () => quickAction(b.dataset.quick, b.dataset.id));
}

async function quickAction(kind, id) {
  try {
    await api(`/admin/bookings/${id}/${kind === 'in' ? 'check-in' : 'check-out'}`, { method: 'POST' });
    toast(kind === 'in' ? `${id} check-in berhasil` : `${id} check-out berhasil`); route();
  } catch (e) {
    if (/belum dibayar/i.test(e.message)) { toast(e.message, false); openBooking(id); } else toast(e.message, false);
  }
}

// ---------- Reservasi ----------
async function viewBookings(c) {
  if (!state.hotels.length) state.hotels = await api('/admin/hotels');
  const f = state.filters;
  c.innerHTML = `<div class="card">
    <div class="toolbar">
      <input class="input search" id="fq" placeholder="Cari kode, nama, atau no. HP…" value="${esc(f.q)}">
      <select class="input" id="fstatus"><option value="">Semua status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="input" id="fhotel"><option value="">Semua hotel</option>${state.hotels.map((h) => `<option value="${h.hotelId}" ${f.hotelId === h.hotelId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select>
      <select class="input" id="fsource"><option value="">Semua sumber</option></select>
      <button class="btn btn-primary" id="walkIn">${icon('plus')}Booking walk-in</button>
    </div>
    <div class="table-wrap" id="bookingTable"><div class="loading">Memuat…</div></div></div>`;
  const stats = await api('/admin/stats');
  $('#fsource').innerHTML += stats.bySource.map((x) => `<option ${f.source === x.source ? 'selected' : ''}>${esc(x.source)}</option>`).join('')
    + (['website', 'walk-in'].filter((s) => !stats.bySource.some((x) => x.source === s)).map((s) => `<option>${s}</option>`).join(''));
  let timer;
  const reload = () => { f.q = $('#fq').value.trim(); f.status = $('#fstatus').value; f.hotelId = $('#fhotel').value; f.source = $('#fsource').value; loadBookingTable(); };
  $('#fq').oninput = () => { clearTimeout(timer); timer = setTimeout(reload, 250); };
  ['#fstatus', '#fhotel', '#fsource'].forEach((s) => $(s).onchange = reload);
  $('#walkIn').onclick = openWalkIn;
  loadBookingTable();
}

async function loadBookingTable() {
  const p = new URLSearchParams(Object.entries(state.filters).filter(([, v]) => v));
  const list = await api('/admin/bookings?' + p);
  const box = $('#bookingTable'); if (!box) return;
  box.innerHTML = list.length ? `<table><thead><tr><th>Kode</th><th>Tamu</th><th>Kamar</th><th>Menginap</th><th>Status</th><th>Bayar</th><th>Sumber</th><th class="num">Total</th></tr></thead>
    <tbody>${list.map((b) => `<tr data-id="${esc(b.bookingId)}">
      <td><span class="t-main">${esc(b.bookingId)}</span></td>
      <td><div class="t-main">${esc(b.guestName)}</div><div class="t-sub">${esc(b.guestPhone || b.guestEmail || '–')}</div></td>
      <td><div class="t-main">${esc(b.roomType)}</div><div class="t-sub">${esc(b.hotelName)}</div></td>
      <td><div class="t-main">${fmtDate(b.checkIn)}</div><div class="t-sub">${b.nights} malam · ${b.guests} tamu</div></td>
      <td>${statusBadge(b.status)}</td><td>${payBadge(b.payment.status)}</td><td>${srcBadge(b.source)}</td>
      <td class="num t-main">${rupiah(b.totalPrice)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Tidak ada reservasi yang cocok dengan filter.</div>';
  $$('tbody tr', box).forEach((tr) => tr.onclick = () => openBooking(tr.dataset.id));
}

async function openBooking(id) {
  const b = await api(`/admin/bookings/${encodeURIComponent(id)}`);
  const c = b.cancellation;
  const btn = (act, label, cls = 'btn-light') => `<button class="btn ${cls}" data-act="${act}">${label}</button>`;
  const acts = [];
  if (b.status === 'confirmed') acts.push(btn('check-in', 'Check-in', 'btn-primary'));
  if (b.status === 'checked_in') acts.push(btn('check-out', 'Check-out', 'btn-ok'));
  if (b.payment.status === 'unpaid' && b.status !== 'cancelled') acts.push(btn('pay', 'Catat pembayaran'));
  if (['confirmed', 'checked_in'].includes(b.status)) acts.push(btn('edit', 'Ubah data tamu'));
  if (c.allowed) acts.push(btn('cancel', 'Batalkan', 'btn-ghost" style="color:var(--bad);border-color:#ecc'));

  let note = '';
  if (b.status === 'confirmed' && b.checkIn > new Date().toLocaleDateString('en-CA')) note = `<div class="notice n-info">Check-in bisa dilakukan mulai ${fmtDate(b.checkIn)}.</div>`;
  if (b.status === 'checked_in' && b.payment.status === 'unpaid') note = '<div class="notice n-warn">Tagihan belum dibayar. Catat pembayaran sebelum check-out.</div>';
  if (b.status === 'cancelled') note = `<div class="notice n-bad">Dibatalkan ${fmtTime(b.cancelledAt)}${b.cancelReason ? ' · ' + esc(b.cancelReason) : ''}. Refund ${rupiah(b.payment.refundAmount)}.</div>`;

  openDrawer(`
    <div class="d-head"><img src="${esc(b.roomImageUrl || PLACEHOLDER)}" alt=""><button class="icon-btn" data-close aria-label="Tutup">${icon('close')}</button></div>
    <div class="d-body">
      <div><div class="d-title"><h2>${esc(b.bookingId)}</h2>${statusBadge(b.status)}${payBadge(b.payment.status)}${srcBadge(b.source)}</div>
        <div class="muted" style="margin-top:4px">${esc(b.roomType)} · ${esc(b.hotelName)} · dibuat ${fmtTime(b.createdAt)}</div></div>
      ${note}
      <div class="actions">${acts.join('') || '<span class="muted">Tidak ada aksi untuk status ini.</span>'}</div>
      <div><div class="section-label">Tamu</div><div class="kv">
        <div><small>Nama</small><b>${esc(b.guestName)}</b></div><div><small>Jumlah tamu</small><b>${b.guests} orang</b></div>
        <div><small>No. HP</small><b>${esc(b.guestPhone || '–')}</b></div><div><small>Email</small><b>${esc(b.guestEmail || '–')}</b></div>
        ${b.notes ? `<div style="grid-column:1/-1"><small>Catatan</small><b>${esc(b.notes)}</b></div>` : ''}</div></div>
      <div><div class="section-label">Menginap</div><div class="kv">
        <div><small>Check-in</small><b>${fmtDate(b.checkIn)}</b></div><div><small>Check-out</small><b>${fmtDate(b.checkOut)}</b></div>
        <div><small>Lama</small><b>${b.nights} malam</b></div><div><small>Waktu check-in / out</small><b>${b.checkedInAt ? fmtTime(b.checkedInAt) : '–'} / ${b.checkedOutAt ? fmtTime(b.checkedOutAt) : '–'}</b></div></div></div>
      <div><div class="section-label">Pembayaran</div><div class="kv">
        <div><small>Total</small><b>${rupiah(b.totalPrice)}</b></div><div><small>Dibayar</small><b>${rupiah(b.payment.paidAmount)}${b.payment.method ? ' · ' + esc(b.payment.method) : ''}</b></div>
        <div><small>Refund</small><b>${rupiah(b.payment.refundAmount)}</b></div><div><small>Waktu bayar</small><b>${fmtTime(b.payment.paidAt)}</b></div></div></div>
      <div><div class="section-label">Riwayat</div><div class="timeline">${b.activity.map((a) => `<div><span></span><div><b>${esc(ACTION_LABEL[a.action] || a.action)}</b>
        <small>${fmtTime(a.at)} · ${esc(a.actor)}${a.detail ? ' · ' + esc(a.detail) : ''}</small></div></div>`).join('') || '<span class="muted">–</span>'}</div></div>
    </div>`);

  $$('[data-act]', $('#drawerPanel')).forEach((el) => el.onclick = () => bookingAction(el.dataset.act, b));
}

async function bookingAction(act, b) {
  const done = (msg) => { toast(msg); openBooking(b.bookingId); if (location.hash.startsWith('#bookings')) loadBookingTable(); else if (!location.hash || location.hash === '#overview') route(); };
  try {
    if (act === 'check-in' || act === 'check-out') {
      await api(`/admin/bookings/${b.bookingId}/${act}`, { method: 'POST' });
      return done(act === 'check-in' ? 'Check-in berhasil' : 'Check-out berhasil');
    }
  } catch (e) { return toast(e.message, false); }
  if (act === 'pay') return formModal({ title: 'Catat pembayaran', subtitle: `${esc(b.bookingId)} · tagihan <b>${rupiah(b.totalPrice)}</b>`,
    fields: [{ name: 'method', label: 'Metode', type: 'select', options: METHODS, value: 'tunai', full: true }], submit: `Terima ${rupiah(b.totalPrice)}`,
    onSubmit: async (d) => { await api(`/admin/bookings/${b.bookingId}/payment`, { method: 'POST', body: d }); done('Pembayaran dicatat'); } });
  if (act === 'edit') return formModal({ title: 'Ubah data tamu', subtitle: esc(b.bookingId), fields: [
    { name: 'guestName', label: 'Nama', value: b.guestName, required: true, full: true },
    { name: 'guestPhone', label: 'No. HP', value: b.guestPhone || '' }, { name: 'guestEmail', label: 'Email', value: b.guestEmail || '', type: 'email' },
    { name: 'guests', label: 'Jumlah tamu', type: 'number', min: 1, value: b.guests }, { name: 'notes', label: 'Catatan', type: 'textarea', value: b.notes, full: true }],
    onSubmit: async (d) => { await api(`/admin/bookings/${b.bookingId}`, { method: 'PATCH', body: { ...d, guests: +d.guests } }); done('Data tamu diperbarui'); } });
  if (act === 'cancel') {
    const c = b.cancellation;
    return formModal({ title: 'Batalkan reservasi?', danger: true, submit: 'Ya, batalkan',
      subtitle: b.payment.paidAmount > 0 ? `Refund <b>${c.refundPercent}% = ${rupiah(c.refundAmount)}</b> dari ${rupiah(b.payment.paidAmount)} sesuai kebijakan.` : 'Belum ada pembayaran, tidak ada refund.',
      fields: [{ name: 'reason', label: 'Alasan', type: 'select', full: true,
        options: ['Permintaan tamu', 'Tamu tidak datang (no-show)', 'Kamar bermasalah / overbooking', 'Pembayaran tidak diterima', 'Lainnya'] }],
      onSubmit: async (d) => { const r = await api(`/admin/bookings/${b.bookingId}/cancel`, { method: 'POST', body: d }); done(r.refund.amount ? `Dibatalkan · refund ${rupiah(r.refund.amount)}` : 'Reservasi dibatalkan'); } });
  }
}

async function openWalkIn() {
  if (!state.rooms.length) state.rooms = await api('/admin/rooms');
  const t = new Date().toLocaleDateString('en-CA');
  const t1 = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
  formModal({ title: 'Booking walk-in', subtitle: 'Untuk tamu yang datang langsung atau memesan lewat telepon.', submit: 'Buat booking',
    fields: [
      { name: 'roomId', label: 'Kamar', type: 'select', full: true, required: true,
        options: state.rooms.map((r) => [r.roomId, `${r.hotelName} · ${r.roomType} · ${rupiah(r.pricePerNight)}/malam · maks ${r.capacity}`]) },
      { name: 'checkIn', label: 'Check-in', type: 'date', value: t, required: true }, { name: 'checkOut', label: 'Check-out', type: 'date', value: t1, required: true },
      { name: 'guestName', label: 'Nama tamu', required: true }, { name: 'guestPhone', label: 'No. HP' },
      { name: 'guests', label: 'Jumlah tamu', type: 'number', min: 1, value: 1 }, { name: 'notes', label: 'Catatan', placeholder: 'opsional' }],
    onSubmit: async (d) => {
      const room = state.rooms.find((r) => r.roomId === d.roomId);
      const res = await api('/admin/bookings', { method: 'POST', body: { ...d, hotelId: room.hotelId, guests: +d.guests } });
      toast(`Booking ${res.bookingId} dibuat · ${rupiah(res.totalPrice)}`); loadBookingTable(); setTimeout(() => openBooking(res.bookingId), 150);
    } });
}

// ---------- Kamar & hotel ----------
async function viewRooms(c) {
  const [hotels, rooms] = await Promise.all([api('/admin/hotels'), api('/admin/rooms')]);
  state.hotels = hotels; state.rooms = rooms;
  const admin = isAdmin();
  c.innerHTML = `
    ${admin ? '' : '<div class="notice n-info">Mode lihat saja. Perubahan kamar dan hotel hanya bisa dilakukan oleh admin.</div>'}
    ${admin ? `<div class="actions"><button class="btn btn-primary" id="addRoom">${icon('plus')}Tambah tipe kamar</button><button class="btn btn-light" id="addHotel">${icon('plus')}Tambah hotel</button></div>` : ''}
    ${hotels.map((h) => `<div class="card hotel-block">
      <div class="card-head"><div style="display:flex;gap:14px;align-items:center"><img class="hotel-thumb" src="${esc(h.imageUrl || PLACEHOLDER)}" alt="">
        <div><h2>${esc(h.name)} <span class="muted" style="font-weight:500">· ${esc(h.hotelId)} · ${'★'.repeat(h.rating)}</span></h2><p>${esc(h.area)} · ${esc(h.city)}</p></div></div>
        ${admin ? `<button class="btn btn-sm btn-ghost" data-edit-hotel="${esc(h.hotelId)}">Ubah hotel</button>` : ''}</div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Tipe</th><th>Detail</th><th class="num">Harga / malam</th><th class="num">Kapasitas</th><th class="num">Unit</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${rooms.filter((r) => r.hotelId === h.hotelId).map((r) => `<tr class="static">
        <td style="width:70px"><img class="room-thumb" src="${esc(r.imageUrl || PLACEHOLDER)}" alt=""></td>
        <td><div class="t-main">${esc(r.roomType)}</div><div class="t-sub">${esc(r.roomId)}</div></td>
        <td><div class="t-sub" style="max-width:360px">${esc(r.description)}</div><div class="t-sub">${r.sizeM2} m² · ${esc(r.bedType)} · ${r.facilities.length} fasilitas</div></td>
        <td class="num t-main">${rupiah(r.pricePerNight)}</td><td class="num">${r.capacity} org</td>
        <td class="num">${r.totalUnits ? r.totalUnits : '<span class="badge b-off">Nonaktif</span>'}</td>
        ${admin ? `<td><div class="row-actions"><button class="btn btn-sm btn-light" data-edit-room="${esc(r.roomId)}">Ubah</button>
          <button class="btn btn-sm btn-ghost" data-del-room="${esc(r.roomId)}">Hapus</button></div></td>` : ''}</tr>`).join('')
        || `<tr class="static"><td colspan="7" class="empty">Belum ada tipe kamar.</td></tr>`}</tbody></table></div></div>`).join('')}`;
  if (!admin) return;
  $('#addRoom').onclick = () => roomForm();
  $('#addHotel').onclick = () => hotelForm();
  $$('[data-edit-room]', c).forEach((b) => b.onclick = () => roomForm(rooms.find((r) => r.roomId === b.dataset.editRoom)));
  $$('[data-edit-hotel]', c).forEach((b) => b.onclick = () => hotelForm(hotels.find((h) => h.hotelId === b.dataset.editHotel)));
  $$('[data-del-room]', c).forEach((b) => b.onclick = () => formModal({ title: `Hapus kamar ${b.dataset.delRoom}?`, danger: true, submit: 'Hapus',
    subtitle: 'Hanya tipe kamar tanpa riwayat booking yang bisa dihapus. Untuk menonaktifkan, set jumlah unit ke 0.', fields: [],
    onSubmit: async () => { await api(`/admin/rooms/${b.dataset.delRoom}`, { method: 'DELETE' }); toast('Kamar dihapus'); route(); } }));
}

function roomForm(r) {
  const edit = Boolean(r); r = r || {};
  formModal({ title: edit ? `Ubah kamar ${r.roomId}` : 'Tambah tipe kamar', subtitle: 'Perubahan langsung tampil di website dan REST API.', fields: [
    { name: 'hotelId', label: 'Hotel', type: 'select', options: state.hotels.map((h) => [h.hotelId, h.name]), value: r.hotelId, full: true },
    { name: 'roomType', label: 'Tipe', type: 'select', options: ['Standard', 'Deluxe', 'Suite', 'Family', 'Villa', 'Villa Suite', 'Eco Villa', 'Sea View Suite', 'Adventure Suite'], value: r.roomType },
    { name: 'pricePerNight', label: 'Harga / malam (Rp)', type: 'number', min: 0, value: r.pricePerNight ?? '', required: true },
    { name: 'capacity', label: 'Kapasitas (orang)', type: 'number', min: 1, value: r.capacity ?? 2 },
    { name: 'totalUnits', label: 'Jumlah unit', type: 'number', min: 0, value: r.totalUnits ?? 1, hint: '0 = nonaktif' },
    { name: 'sizeM2', label: 'Luas (m²)', type: 'number', min: 0, value: r.sizeM2 ?? '' }, { name: 'bedType', label: 'Kasur', value: r.bedType || '', placeholder: '1 Queen bed' },
    { name: 'description', label: 'Deskripsi', type: 'textarea', value: r.description || '', full: true },
    { name: 'facilities', label: 'Fasilitas', value: (r.facilities || []).join(', '), full: true, hint: 'pisahkan dengan koma' },
    { name: 'imageUrl', label: 'URL foto', value: r.imageUrl || '', full: true, placeholder: 'https://…' }],
    onSubmit: async (d) => {
      const body = { ...d, pricePerNight: +d.pricePerNight, capacity: +d.capacity, totalUnits: +d.totalUnits, sizeM2: +d.sizeM2 || 0 };
      await api(edit ? `/admin/rooms/${r.roomId}` : '/admin/rooms', { method: edit ? 'PATCH' : 'POST', body });
      toast(edit ? 'Kamar diperbarui' : 'Tipe kamar ditambahkan'); route();
    } });
}

function hotelForm(h) {
  const edit = Boolean(h); h = h || {};
  formModal({ title: edit ? `Ubah ${h.name}` : 'Tambah hotel', fields: [
    { name: 'name', label: 'Nama hotel', value: h.name || '', required: true, full: true },
    { name: 'address', label: 'Alamat', value: h.address || '', required: true, full: true },
    { name: 'area', label: 'Area', value: h.area || '', placeholder: 'Malioboro' }, { name: 'city', label: 'Kota/Kabupaten DIY', type: 'select', options: ['Kota Yogyakarta', 'Sleman', 'Bantul', 'Gunungkidul', 'Kulon Progo'], value: h.city || 'Kota Yogyakarta' },
    { name: 'rating', label: 'Rating', type: 'select', options: [1, 2, 3, 4, 5], value: h.rating || 4 },
    { name: 'imageUrl', label: 'URL foto', value: h.imageUrl || '' },
    { name: 'description', label: 'Deskripsi', type: 'textarea', value: h.description || '', full: true }],
    onSubmit: async (d) => {
      if (edit && !d.address) delete d.address;
      await api(edit ? `/admin/hotels/${h.hotelId}` : '/admin/hotels', { method: edit ? 'PATCH' : 'POST', body: { ...d, rating: +d.rating } });
      toast(edit ? 'Hotel diperbarui' : 'Hotel ditambahkan'); route();
    } });
}

// ---------- Akun staf ----------
async function viewStaff(c) {
  const users = await api('/admin/users');
  c.innerHTML = `<div class="card"><div class="card-head"><div><h2>Akun staf</h2><p>Admin: akses penuh. Resepsionis: reservasi, check-in/out, pembayaran.</p></div>
    <button class="btn btn-primary" id="addUser">${icon('plus')}Tambah staf</button></div>
    <div class="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Dibuat</th><th></th></tr></thead>
    <tbody>${users.map((u) => `<tr class="static"><td class="t-main">${esc(u.name)}${u.id === state.me.id ? ' <span class="muted">(Anda)</span>' : ''}</td><td><code>${esc(u.username)}</code></td>
      <td><span class="badge b-${u.role}">${ROLE[u.role]}</span></td><td>${u.active ? '<span class="badge b-paid">Aktif</span>' : '<span class="badge b-off">Nonaktif</span>'}</td>
      <td class="t-sub">${fmtDate(u.createdAt)}</td>
      <td><div class="row-actions"><button class="btn btn-sm btn-light" data-edit-user="${u.id}">Ubah</button>
      <button class="btn btn-sm btn-ghost" data-pw="${u.id}">Reset password</button>
      ${u.id !== state.me.id ? `<button class="btn btn-sm btn-ghost" data-toggle="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div></div>`;
  $('#addUser').onclick = () => formModal({ title: 'Tambah staf', submit: 'Buat akun', fields: [
    { name: 'name', label: 'Nama lengkap', required: true, full: true }, { name: 'username', label: 'Username', required: true, placeholder: 'huruf kecil, tanpa spasi' },
    { name: 'role', label: 'Role', type: 'select', options: [['receptionist', 'Resepsionis'], ['admin', 'Admin']] },
    { name: 'password', label: 'Password awal', type: 'password', required: true, full: true, hint: 'min. 8 karakter' }],
    onSubmit: async (d) => { await api('/admin/users', { method: 'POST', body: d }); toast('Akun staf dibuat'); route(); } });
  $$('[data-edit-user]', c).forEach((b) => b.onclick = () => { const u = users.find((x) => x.id === +b.dataset.editUser);
    formModal({ title: `Ubah ${u.username}`, fields: [{ name: 'name', label: 'Nama', value: u.name, required: true, full: true },
      { name: 'role', label: 'Role', type: 'select', options: [['receptionist', 'Resepsionis'], ['admin', 'Admin']], value: u.role, full: true }],
      onSubmit: async (d) => { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: d }); toast('Akun diperbarui'); route(); } }); });
  $$('[data-pw]', c).forEach((b) => b.onclick = () => formModal({ title: 'Reset password', subtitle: 'Staf akan diminta login ulang.', submit: 'Simpan password',
    fields: [{ name: 'password', label: 'Password baru', type: 'password', required: true, full: true, hint: 'min. 8 karakter' }],
    onSubmit: async (d) => { await api(`/admin/users/${b.dataset.pw}`, { method: 'PATCH', body: d }); toast('Password diganti');
      if (+b.dataset.pw === state.me.id) location.href = '/login'; } }));
  $$('[data-toggle]', c).forEach((b) => b.onclick = async () => {
    try { await api(`/admin/users/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.active !== '1' } }); toast('Status akun diubah'); route(); }
    catch (e) { toast(e.message, false); } });
}

// ---------- Integrasi API (partner: Itinerary Yogyakarta) ----------
async function viewIntegrations(c) {
  const clients = await api('/admin/api-clients');
  const x = clients.find((k) => k.name === 'Itinerary Yogyakarta') || clients[0];
  const base = location.origin + '/api/v1';
  if (!x) { c.innerHTML = '<div class="card empty">Data partner belum ada. Jalankan <code>npm run seed</code>.</div>'; return; }
  c.innerHTML = `
    <div class="grid-2">
      <div class="card"><div class="card-head"><div><h2>Itinerary Yogyakarta</h2><p>Satu-satunya aplikasi partner yang terhubung ke Hotel Service.</p></div>
        ${x.active ? '<span class="badge b-paid">Aktif</span>' : '<span class="badge b-off">Akses dicabut</span>'}</div>
        <div class="card-body" style="display:grid;gap:16px">
          <div class="kv">
            <div><small>Token</small><b><code>${esc(x.tokenPrefix)}…</code></b></div>
            <div><small>Booking dari Itinerary</small><b>${x.bookings}</b></div>
            <div><small>Terakhir dipakai</small><b>${x.lastUsedAt ? fmtTime(x.lastUsedAt) : 'belum pernah'}</b></div>
            <div><small>Terdaftar</small><b>${fmtDate(x.createdAt)}</b></div>
          </div>
          <div class="actions">
            <button class="btn btn-primary" id="rotate">Ganti token</button>
            ${x.active ? '<button class="btn btn-ghost" id="revoke" style="color:var(--bad);border-color:#ecc">Cabut akses</button>'
                       : '<button class="btn btn-light" id="enable">Aktifkan akses</button>'}
            <a class="btn btn-light" href="#bookings" id="seeBookings">Lihat booking Itinerary</a>
          </div>
          <p class="muted" style="margin:0;font-size:.84rem">Ganti token jika token bocor: token lama langsung tidak berlaku. Cabut akses untuk menghentikan Itinerary sementara tanpa menghapus datanya.</p>
        </div></div>

      <div class="card"><div class="card-head"><div><h2>Cara Itinerary terhubung</h2><p>Tanpa berbagi database.</p></div></div>
        <div class="card-body"><ol class="steps">
          <li><div>Berikan ke tim Itinerary: base URL <code>${esc(base)}</code>, token, dan dokumentasi <a href="/api/docs" target="_blank" style="color:var(--brand);font-weight:600">/api/docs</a>.</div></li>
          <li><div>Itinerary mengirim header <code>Authorization: Token &lt;token&gt;</code> di setiap request.</div></li>
          <li><div>Booking dari Itinerary muncul di menu Reservasi dengan sumber "Itinerary Yogyakarta".</div></li>
          <li><div>Itinerary hanya bisa melihat, membayar, dan membatalkan booking miliknya sendiri.</div></li>
        </ol></div></div>
    </div>
    <div class="card"><div class="card-head"><div><h2>Contoh request Itinerary</h2><p>Cek ketersediaan, buat booking, lalu lihat booking milik Itinerary</p></div></div>
      <div class="card-body"><pre class="code">curl -H "Authorization: Token &lt;token&gt;" \\
  "${esc(base)}/hotels/H01/availability?checkIn=2026-12-10&amp;checkOut=2026-12-12"

curl -X POST "${esc(base)}/hotel-bookings" \\
  -H "Authorization: Token &lt;token&gt;" -H "Content-Type: application/json" \\
  -d '{"hotelId":"H01","roomId":"R01","guestName":"Budi","checkIn":"2026-12-10","checkOut":"2026-12-12"}'

curl -H "Authorization: Token &lt;token&gt;" "${esc(base)}/partner/bookings"</pre>
      <p class="muted" style="margin:10px 0 0;font-size:.84rem">Simpan token partner secara pribadi dan jangan bagikan melalui halaman publik</p></div></div>`;

  $('#rotate').onclick = () => formModal({ title: 'Ganti token Itinerary?', submit: 'Ganti token', danger: true, fields: [],
    subtitle: 'Token lama langsung tidak berlaku. Pastikan tim Itinerary segera memakai token baru.',
    onSubmit: async () => {
      const res = await api(`/admin/api-clients/${x.id}/rotate`, { method: 'POST' });
      setTimeout(() => {
        openModal(`<div class="m-body"><h2>Token baru Itinerary Yogyakarta</h2>
          <p>Salin sekarang. Demi keamanan token tidak bisa ditampilkan lagi (yang disimpan hanya hash-nya).</p>
          <div class="token-box"><span>${esc(res.token)}</span><button class="btn btn-sm btn-light" id="copyTok">Salin</button></div>
          <pre class="code">Authorization: Token ${esc(res.token)}</pre>
          <div class="m-foot"><button class="btn btn-primary" data-close>Selesai</button></div></div>`);
        $('#copyTok').onclick = () => navigator.clipboard?.writeText(res.token).then(() => toast('Token disalin'));
        route();
      }, 50);
    } });
  const r = $('#revoke'), e = $('#enable');
  if (r) r.onclick = async () => { await api(`/admin/api-clients/${x.id}/revoke`, { method: 'POST' }); toast('Akses Itinerary dicabut'); route(); };
  if (e) e.onclick = async () => { await api(`/admin/api-clients/${x.id}/enable`, { method: 'POST' }); toast('Akses Itinerary diaktifkan'); route(); };
  $('#seeBookings').onclick = () => { state.filters = { status: '', hotelId: '', q: '', source: x.name }; };
}

// ---------- Log aktivitas ----------
function activityTable(list) {
  return list.length ? `<div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Oleh</th><th>Aktivitas</th><th>Target</th><th>Detail</th></tr></thead>
    <tbody>${list.map((a) => `<tr class="${/^HB-/.test(a.target) ? '' : 'static'}" ${/^HB-/.test(a.target) ? `data-open="${esc(a.target)}"` : ''}>
      <td class="t-sub" style="white-space:nowrap">${fmtTime(a.at)}</td><td>${esc(a.actor)}</td><td class="t-main">${esc(ACTION_LABEL[a.action] || a.action)}</td>
      <td>${esc(a.target)}</td><td class="t-sub">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Belum ada aktivitas.</div>';
}
async function viewActivity(c) {
  c.innerHTML = `<div class="card"><div class="card-head"><div><h2>Log aktivitas</h2><p>Semua tindakan staf, tamu, dan aplikasi partner tercatat di sini.</p></div></div>${activityTable(await api('/admin/activity?limit=200'))}</div>`;
}
document.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-open]'); if (tr) openBooking(tr.dataset.open); });

// ---------- Init ----------
(async function init() {
  paintIcons();
  try { state.me = (await api('/auth/me')).user; } catch { return; }
  $('#userName').textContent = state.me.name;
  $('#userRole').textContent = ROLE[state.me.role];
  $('#avatar').textContent = state.me.name.trim()[0].toUpperCase();
  if (!isAdmin()) $$('[data-admin]').forEach((a) => a.remove());
  route();
})();
