// JogjaStay — frontend tamu langsung.
// Semua data diambil dari REST API yang sama dengan yang dipakai sistem luar (Itinerary, Postman, curl).
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PLACEHOLDER = 'img/room-placeholder.svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const isoOffset = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA'); };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

const ICON = {
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  size: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/></svg>',
  bed: '<svg viewBox="0 0 24 24"><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M7 9V6h10v3"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
};
const PAY_LABEL = { unpaid: 'Belum diproses', paid: 'Tercatat untuk pengujian', refunded: 'Pengembalian tercatat', partially_refunded: 'Pengembalian sebagian tercatat' };

const state = { rooms: [], hotels: [], type: '', hotel: '', area: '', priceMin: 0, priceMax: 0, checkIn: '', checkOut: '', guests: 2 };

// ---------- Utilities ----------
async function api(path, opts = {}) {
  const res = await fetch('/api/v1' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  let data = null;
  try { data = await res.json(); } catch { /* respons kosong */ }
  if (!res.ok) { const e = new Error((data && data.message) || 'Terjadi kesalahan'); e.code = data && data.code; throw e; }
  return data;
}

function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (ok ? '' : ' err'); t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 4200);
}

// Gambar gagal dimuat (mis. offline) → pakai ilustrasi lokal
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && !img.src.endsWith(PLACEHOLDER)) img.src = PLACEHOLDER;
}, true);

const store = {
  get() { try { return JSON.parse(localStorage.getItem('jogjastay.bookings') || '[]'); } catch { return []; } },
  add(id, name, token) {
    try {
      const list = this.get().filter((b) => b.id !== id);
      list.unshift({ id, name, token }); localStorage.setItem('jogjastay.bookings', JSON.stringify(list.slice(0, 5)));
    } catch { /* storage tidak tersedia */ }
  },
};

function bookingToken(id) {
  const saved = store.get().find((b) => b.id === id)?.token;
  return saved || $('#lookupToken')?.value.trim() || '';
}
const bookingHeaders = (id) => ({ 'X-Booking-Token': bookingToken(id) });

// ---------- Modal ----------
const modal = $('#modal'), panel = $('#modalPanel');
function openModal(html, narrow = false) {
  panel.className = 'modal-panel' + (narrow ? ' narrow' : '');
  panel.innerHTML = `<button class="modal-close" data-close aria-label="Tutup">${ICON.close}</button>` + html;
  modal.hidden = false; document.body.style.overflow = 'hidden';
}
function closeModal() { modal.hidden = true; document.body.style.overflow = ''; panel.innerHTML = ''; }
modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

// ---------- Nav ----------
window.addEventListener('scroll', () => $('#nav').classList.toggle('scrolled', scrollY > 10), { passive: true });
$('#navToggle').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
$$('#navLinks a').forEach((a) => a.addEventListener('click', () => $('#navLinks').classList.remove('open')));

// ---------- Hotels ----------
async function loadHotels() {
  state.hotels = await api('/hotels');
  buildAreaMap();
  $('#hotelGrid').innerHTML = state.hotels.map((h) => `
    <button class="hotel-card" data-hotel="${esc(h.hotelId)}">
      <img src="${esc(h.imageUrl || PLACEHOLDER)}" alt="${esc(h.name)}" loading="lazy">
      <div class="hc-body">
        <span class="hc-area">${esc(h.area)}</span>
        <h3>${esc(h.name)}</h3>
        <div class="stars">${'★'.repeat(h.rating)}<span style="opacity:.35">${'★'.repeat(5 - h.rating)}</span></div>
        <p>${esc(h.description)}</p>
      </div>
    </button>`).join('');
  $('#hotelFilter').innerHTML = '<option value="">Semua hotel</option>' +
    state.hotels.map((h) => `<option value="${esc(h.hotelId)}">${esc(h.name)}</option>`).join('');
}

$('#hotelGrid').addEventListener('click', (e) => {
  const card = e.target.closest('.hotel-card'); if (!card) return;
  setHotel(state.hotel === card.dataset.hotel ? '' : card.dataset.hotel);
  $('#rooms').scrollIntoView({ behavior: 'smooth' });
});
$('#hotelFilter').addEventListener('change', (e) => setHotel(e.target.value));
$('#showWisataBtn').addEventListener('click', () => $('#wisataRecommendations').scrollIntoView({ behavior: 'smooth' }));
let wisataRequestId = 0;
let wisataDestinations = [];
let wisataSelected = null;
let wisataQuote = null;
let wisataTicketIdempotencyKey = '';

// Rekomendasi bersumber dari API Wisata, tanpa berpindah halaman.
$('#wisataRecommendationList').addEventListener('click', (e) => {
  const button = e.target.closest('[data-wisata-detail]');
  if (!button) return;
  const i = Number(button.dataset.wisataDetail);
  const d = wisataDestinations[i];
  if (!Number.isInteger(i) || !d) return;
  wisataSelected = d;
  wisataQuote = null;
  openModal(`
    <div class="wisata-detail">
      ${d.imageUrl ? `<img class="wisata-detail-image" src="${esc(d.imageUrl)}" alt="${esc(d.name)}">` : ''}
      <div class="wisata-detail-content">
        <span class="kicker">Jelajahi ${esc(d.city || 'Yogyakarta')}</span>
        <h2>${esc(d.name)}</h2>
        <p>${esc(d.description || 'Informasi destinasi belum tersedia.')}</p>
        <div class="wisata-detail-price"><span>Harga tiket mulai dari</span>
          <strong>${d.price == null ? 'Harga belum tersedia' : rupiah(d.price)}</strong></div>
        <p class="wisata-detail-source">Informasi destinasi disediakan oleh Wisata Jogja.</p>
        <div class="wisata-detail-actions">
          <button class="btn btn-primary" type="button" data-wisata-tickets>Cek tiket & ketersediaan</button>
          <button class="btn btn-light" type="button" data-close>Kembali</button>
        </div>
      </div>
    </div>`);
});

// Kuota/harga ditanyakan kepada server Wisata melalui backend JogjaStay.
// Form kontak tidak ditampilkan sampai partner Wisata mendukung reservasi PENDING yang persisten.
modal.addEventListener('click', async (e) => {
  const start = e.target.closest('[data-wisata-tickets]');
  if (start && wisataSelected) {
    wisataQuote = null;
    const d = wisataSelected;
    openModal(`<div class="wisata-ticket-panel">
      <span class="kicker">Pilihan tambahan untuk perjalanan</span>
      <h2>Periksa tiket ${esc(d.name)}</h2>
      <p>Pilih tanggal dan jumlah tiket. Harga serta sisa kuota dihitung oleh layanan Wisata Jogja.</p>
      <form id="wisataAvailabilityForm" class="wisata-ticket-form">
        <label>Tanggal kunjungan<input name="visitDate" type="date" min="${isoOffset(1)}" required></label>
        <label>Jumlah tiket<input name="qty" type="number" min="1" max="20" value="1" required></label>
        <button type="submit" class="btn btn-primary">Cek harga & kuota</button>
      </form>
      <div id="wisataAvailabilityResult" class="wisata-ticket-result" aria-live="polite"></div>
      <div id="wisataTicketBookingSlot"></div>
    </div>`, true);
    return;
  }
});
modal.addEventListener('input', (e) => {
  if (e.target.closest('#wisataAvailabilityForm')) {
    wisataQuote = null;
    const result = $('#wisataAvailabilityResult');
    const booking = $('#wisataTicketBookingSlot');
    if (result) result.textContent = '';
    if (booking) booking.innerHTML = '';
  }
});
modal.addEventListener('submit', async (e) => {
  const check = e.target.closest('#wisataAvailabilityForm');
  if (check) {
    e.preventDefault();
    const d = wisataSelected;
    const result = $('#wisataAvailabilityResult');
    const slot = $('#wisataTicketBookingSlot');
    if (!d || !result || !slot) return;
    wisataQuote = null;
    slot.innerHTML = '';
    const form = new FormData(check);
    const visitDate = String(form.get('visitDate') || '');
    const qty = Number(form.get('qty'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || !Number.isSafeInteger(qty) || qty < 1 || qty > 20) {
      result.textContent = 'Tanggal atau jumlah tiket tidak valid.';
      return;
    }
    result.textContent = 'Memeriksa ketersediaan…';
    try {
      const query = new URLSearchParams({ date: visitDate, qty: String(qty) });
      const quote = await api(`/wisata/destinations/${encodeURIComponent(d.wisataId)}/availability?${query}`);
      // Abaikan respons jika modal atau nilai form sudah berubah.
      if (!$('#wisataAvailabilityForm') || $('#wisataAvailabilityForm') !== check ||
          check.elements.visitDate.value !== visitDate || Number(check.elements.qty.value) !== qty) return;
      wisataQuote = quote.available ? quote : null;
      result.innerHTML = `<div class="wisata-quote">
        <b>${quote.available ? 'Tiket tersedia' : 'Kuota tidak mencukupi'}</b>
        <span>${esc(quote.date)} · ${qty} tiket · sisa kuota ${Number(quote.remaining)}</span>
        <strong>${rupiah(quote.total)} total</strong>
      </div>`;
      if (!quote.available) return;
      const capability = await api('/wisata/tickets/capability');
      if (!$('#wisataAvailabilityForm') || $('#wisataAvailabilityForm') !== check || wisataQuote !== quote) return;
      if (!capability.bookingAvailable) {
        slot.innerHTML = '<p class="wisata-ticket-note">Pemesanan tiket dari JogjaStay belum tersedia. Saat ini Anda dapat mengecek harga dan kuota langsung dari Wisata Jogja.</p>';
        return;
      }
      wisataTicketIdempotencyKey = crypto.randomUUID();
      slot.innerHTML = `<h3>Pesan tiket wisata</h3>
        <p>Permintaan diteruskan ke Wisata Jogja. Pesanan berstatus menunggu konfirmasi, bukan bukti pembayaran.</p>
        <form id="wisataTicketBookingForm" class="wisata-ticket-form">
          <label>Nama pemesan<input name="name" maxlength="120" required autocomplete="name"></label>
          <label>Email<input name="email" type="email" maxlength="200" required autocomplete="email"></label>
          <label>Telepon (opsional)<input name="phone" type="tel" maxlength="40" autocomplete="tel"></label>
          <button class="btn btn-primary" type="submit">Kirim pemesanan tiket</button>
        </form><div id="wisataBookResult" aria-live="polite"></div>`;
    } catch (err) {
      wisataQuote = null;
      result.textContent = 'Gagal memeriksa tiket: ' + err.message;
    }
    return;
  }
  const form = e.target.closest('#wisataTicketBookingForm');
  if (!form) return;
  e.preventDefault();
  if (!wisataQuote || !wisataSelected) return;
  const button = form.querySelector('button[type=submit]');
  const feedback = $('#wisataBookResult');
  button.disabled = true;
  feedback.textContent = 'Mengirim permintaan pemesanan…';
  const data = new FormData(form);
  try {
    const booked = await api('/wisata/tickets/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': wisataTicketIdempotencyKey },
      body: JSON.stringify({ destinationId: wisataSelected.wisataId, visitDate: wisataQuote.date,
        qty: wisataQuote.qty, name: String(data.get('name') || ''),
        email: String(data.get('email') || ''), phone: String(data.get('phone') || '') })
    });
    openModal(`<div class="wisata-ticket-panel"><span class="kicker">Permintaan tiket terkirim</span>
      <h2>Kode pemesanan: ${esc(booked.code)}</h2>
      <p>Status: menunggu proses selanjutnya di Wisata Jogja. Tiket belum dinyatakan dibayar atau terkonfirmasi.</p>
      <button class="btn btn-primary" type="button" data-close>Selesai</button></div>`, true);
  } catch (err) {
    feedback.textContent = 'Pemesanan tidak berhasil: ' + err.message;
    button.disabled = false;
  }
});

async function loadWisataRecommendations(hotelId) {
  const panel = $('#wisataRecommendations');
  const list = $('#wisataRecommendationList');
  const context = $('#wisataRecommendationContext');
  const requestId = ++wisataRequestId;
  if (!hotelId) { panel.hidden = true; list.innerHTML = ''; wisataDestinations = []; return; }
  panel.hidden = false;
  const hotel = state.hotels.find((h) => h.hotelId === hotelId);
  context.textContent = `Destinasi di wilayah ${hotel?.city || 'DIY'} (berdasarkan wilayah, bukan jarak).`;
  list.innerHTML = '<p>Memuat rekomendasi wisata…</p>';
  try {
    const result = await api(`/hotels/${encodeURIComponent(hotelId)}/recommendations`);
    if (requestId !== wisataRequestId) return;
    wisataDestinations = Array.isArray(result.destinations) ? result.destinations : [];
    list.innerHTML = wisataDestinations.length ? wisataDestinations.map((d, i) => `
      <article class="hotel-card wisata-recommendation">
        ${d.imageUrl ? `<img src="${esc(d.imageUrl)}" alt="${esc(d.name)}" loading="lazy">` : ''}
        <div class="hc-body"><span class="hc-area">${esc(d.city)}</span><h3>${esc(d.name)}</h3>
          <p>${esc(d.description || 'Informasi destinasi belum tersedia.')}</p>
          <p>${d.price == null ? 'Harga tiket: belum tersedia' : `Harga tiket mulai ${rupiah(d.price)}`}</p>
          <button class="btn btn-light" type="button" data-wisata-detail="${i}">Lihat selengkapnya</button>
        </div>
      </article>`).join('') : '<p>Belum ada destinasi dengan kode wilayah yang cocok.</p>';
  } catch (e) {
    if (requestId !== wisataRequestId) return;
    wisataDestinations = [];
    list.innerHTML = `<p class="hint">Rekomendasi belum tersedia: ${esc(e.message)}. Katalog hotel tetap dapat digunakan.</p>`;
  }
}
function setHotel(id) {
  state.hotel = id; $('#hotelFilter').value = id;
  $$('.hotel-card').forEach((c) => c.classList.toggle('active', c.dataset.hotel === id));
  renderRooms();
  $('#showWisataBtn').hidden = !id;
  loadWisataRecommendations(id);
}
$('#typeChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  state.type = chip.dataset.type;
  $$('#typeChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
  renderRooms();
});

// ---- Filter panel toggle ----
$('#filterToggle').addEventListener('click', () => {
  const panel = $('#filterPanel');
  const btn = $('#filterToggle');
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  panel.hidden = open;
});

// ---- Area chips ----
$('#areaChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  state.area = chip.dataset.area;
  $$('#areaChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
  // When area selected, reset hotel filter to avoid conflict
  if (state.area) { state.hotel = ''; $('#hotelFilter').value = ''; $$('.hotel-card').forEach((c) => c.classList.remove('active')); loadWisataRecommendations(''); $('#showWisataBtn').hidden = true; }
  renderRooms();
});

// ---- Price presets ----
$('#filterPanel').addEventListener('click', (e) => {
  const preset = e.target.closest('.chip-sm'); if (!preset) return;
  $$('.chip-sm').forEach((c) => c.classList.remove('active'));
  preset.classList.add('active');
  const min = parseInt(preset.dataset.min) || 0;
  const max = parseInt(preset.dataset.max) || 0;
  state.priceMin = min; state.priceMax = max;
  $('#priceMin').value = min || '';
  $('#priceMax').value = max || '';
  renderRooms();
});

// ---- Price inputs ----
function onPriceInput() {
  const min = parseInt($('#priceMin').value) || 0;
  const max = parseInt($('#priceMax').value) || 0;
  state.priceMin = min; state.priceMax = max;
  // Clear preset active if manual input
  $$('.chip-sm').forEach((c) => {
    const cMin = parseInt(c.dataset.min) || 0;
    const cMax = parseInt(c.dataset.max) || 0;
    c.classList.toggle('active', cMin === min && cMax === max);
  });
  renderRooms();
}
$('#priceMin').addEventListener('change', onPriceInput);
$('#priceMax').addEventListener('change', onPriceInput);

// ---- Reset filter ----
$('#filterReset').addEventListener('click', () => {
  state.area = ''; state.priceMin = 0; state.priceMax = 0; state.hotel = ''; state.type = '';
  loadWisataRecommendations(''); $('#showWisataBtn').hidden = true;
  $$('#areaChips .chip').forEach((c) => c.classList.toggle('active', c.dataset.area === ''));
  $$('#typeChips .chip').forEach((c) => c.classList.toggle('active', c.dataset.type === ''));
  $$('.chip-sm').forEach((c) => c.classList.remove('active'));
  $$('.hotel-card').forEach((c) => c.classList.remove('active'));
  $('#hotelFilter').value = '';
  $('#priceMin').value = ''; $('#priceMax').value = '';
  renderRooms();
});

// ---- Area filter lookup (map hotelId → city from hotel list) ----
const HOTEL_AREA = {};
function buildAreaMap() { state.hotels.forEach((h) => { HOTEL_AREA[h.hotelId] = h.city || ''; }); }

// Helper to update filter badge count
function updateFilterBadge() {
  let count = 0;
  if (state.area) count++;
  if (state.hotel) count++;
  if (state.priceMin || state.priceMax) count++;
  const badge = $('#filterBadge');
  badge.hidden = count === 0;
  badge.textContent = count;
}

// ---------- Rooms ----------
async function loadRooms() {
  try {
    state.rooms = await api(`/rooms?checkIn=${state.checkIn}&checkOut=${state.checkOut}`);
    const n = state.rooms[0] ? state.rooms[0].nights : 0;
    $('#stayInfo').innerHTML = `<b>${fmtDate(state.checkIn)} – ${fmtDate(state.checkOut)}</b> · ${n} malam · ${state.guests} tamu`;
    renderRooms();
  } catch (e) {
    $('#roomGrid').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function availBadge(r) {
  if (r.unitsAvailable === 0) return '<span class="badge badge-avail badge-bad">Penuh</span>';
  if (r.unitsAvailable <= 2) return `<span class="badge badge-avail badge-warn">Sisa ${r.unitsAvailable} kamar</span>`;
  return `<span class="badge badge-avail badge-ok">${r.unitsAvailable} kamar tersedia</span>`;
}

function renderRooms() {
  updateFilterBadge();
  const list = state.rooms.filter((r) => {
    if (state.type && r.roomType !== state.type) return false;
    if (state.hotel && r.hotelId !== state.hotel) return false;
    if (state.area) {
      const hotelCity = HOTEL_AREA[r.hotelId] || '';
      if (hotelCity !== state.area) return false;
    }
    if (state.priceMin && r.pricePerNight < state.priceMin) return false;
    if (state.priceMax && r.pricePerNight > state.priceMax) return false;
    return true;
  });
  // Update count text
  const countEl = $('#filterCount');
  if (countEl) countEl.textContent = `${list.length} kamar ditemukan`;
  if (!list.length) { $('#roomGrid').innerHTML = '<div class="empty">Tidak ada kamar yang cocok dengan filter ini.</div>'; return; }
  $('#roomGrid').innerHTML = list.map((r) => {
    const tooSmall = r.capacity < state.guests;
    const disabled = r.unitsAvailable === 0 || tooSmall;
    const extra = r.facilities.length - 4;
    return `
    <article class="room-card">
      <div class="room-media">
        <img src="${esc(r.imageUrl || PLACEHOLDER)}" alt="Kamar ${esc(r.roomType)} ${esc(r.hotelName)}" loading="lazy">
        <span class="badge badge-type ${esc(r.roomType)}">${esc(r.roomType)}</span>
        ${availBadge(r)}
      </div>
      <div class="room-body">
        <div class="room-hotel">${ICON.pin}${esc(r.hotelName)} · ${esc(r.hotelArea)}</div>
        <h3>${esc(r.roomType)} Room</h3>
        <p class="room-desc">${esc(r.description)}</p>
        <div class="specs">
          <span>${ICON.size}${r.sizeM2} m²</span><span>${ICON.bed}${esc(r.bedType)}</span><span>${ICON.user}Maks ${r.capacity}</span>
        </div>
        <div class="facilities">${r.facilities.slice(0, 4).map((f) => `<span>${esc(f)}</span>`).join('')}${extra > 0 ? `<span>+${extra} lainnya</span>` : ''}</div>
        <div class="room-foot">
          <div class="price">
            <b>${rupiah(r.pricePerNight)}</b> <small>/ malam</small>
            <span class="total">Total ${rupiah(r.totalPrice)} · ${r.nights} malam</span>
          </div>
          <button class="btn btn-primary" data-book="${esc(r.roomId)}" ${disabled ? 'disabled' : ''}>
            ${r.unitsAvailable === 0 ? 'Penuh' : tooSmall ? `Maks ${r.capacity} org` : 'Pilih'}
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

$('#roomGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-book]'); if (b) openBooking(state.rooms.find((r) => r.roomId === b.dataset.book));
});

// ---------- Search ----------
function syncDates() {
  $('#checkIn').min = isoOffset(0);
  $('#checkOut').min = addDays($('#checkIn').value || isoOffset(0), 1);
  if ($('#checkOut').value <= $('#checkIn').value) $('#checkOut').value = addDays($('#checkIn').value, 1);
}
$('#checkIn').addEventListener('change', syncDates);
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  state.checkIn = $('#checkIn').value; state.checkOut = $('#checkOut').value; state.guests = +$('#guestCount').value;
  loadRooms().then(() => $('#rooms').scrollIntoView({ behavior: 'smooth' }));
});

// ---------- Booking ----------
function openBooking(r) {
  openModal(`
    <div class="bm">
      <aside class="bm-side">
        <img src="${esc(r.imageUrl || PLACEHOLDER)}" alt="">
        <div class="bm-side-body">
          <span class="badge badge-brand" style="align-self:flex-start">${esc(r.roomType)}</span>
          <h3>${esc(r.hotelName)}</h3>
          <div class="specs"><span>${ICON.size}${r.sizeM2} m²</span><span>${ICON.bed}${esc(r.bedType)}</span><span>${ICON.user}Maks ${r.capacity}</span></div>
          <div class="facilities">${r.facilities.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
          <div class="summary">
            <div><span>Check-in</span><b>${fmtDate(state.checkIn)}</b></div>
            <div><span>Check-out</span><b>${fmtDate(state.checkOut)}</b></div>
            <div><span>${rupiah(r.pricePerNight)} × ${r.nights} malam</span><span>${rupiah(r.totalPrice)}</span></div>
            <div class="tot"><span>Total</span><span>${rupiah(r.totalPrice)}</span></div>
          </div>
        </div>
      </aside>
      <div class="bm-form">
        <h2>Lengkapi pesanan</h2>
        <p>Simpan kode reservasi dan kode akses privat untuk melihat atau membatalkan pencatatan.</p>
        <form class="form" id="bookForm" novalidate>
          <label class="field"><span>Nama lengkap tamu *</span><input name="guestName" required placeholder="Budi Santoso" autocomplete="name"></label>
          <div class="row2">
            <label class="field"><span>Email</span><input name="guestEmail" type="email" placeholder="opsional" autocomplete="email"></label>
            <label class="field"><span>No. HP</span><input name="guestPhone" type="tel" placeholder="opsional" autocomplete="tel"></label>
          </div>
          <label class="field"><span>Jumlah tamu</span>
            <select name="guests">${Array.from({ length: r.capacity }, (_, i) => i + 1).map((n) =>
              `<option value="${n}" ${n === Math.min(state.guests, r.capacity) ? 'selected' : ''}>${n} orang</option>`).join('')}</select>
          </label>
          <p class="hint">Pencatatan ini hanya untuk pengujian alur interoperabilitas. Tidak membuat reservasi resmi pada hotel, tidak ada tagihan atau transfer uang.</p>
          <div class="form-error" id="bookErr"></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" id="bookBtn">Catat rencana menginap</button>
        </form>
      </div>
    </div>`);

  const form = $('#bookForm');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.guestName.value.trim();
    if (!name) { $('#bookErr').textContent = 'Nama tamu wajib diisi.'; form.guestName.focus(); return; }
    const btn = $('#bookBtn'); btn.disabled = true; btn.textContent = 'Memproses…'; $('#bookErr').textContent = '';
    try {
      const res = await api('/hotel-bookings', { method: 'POST', body: JSON.stringify({
        hotelId: r.hotelId, roomId: r.roomId, guestName: name, guestEmail: form.guestEmail.value, guestPhone: form.guestPhone.value,
        guests: +form.guests.value, checkIn: state.checkIn, checkOut: state.checkOut }) });
      store.add(res.bookingId, name, res.accessToken);
      showSuccess(res, r, name);
      loadRooms(); renderRecent();
    } catch (err) {
      $('#bookErr').textContent = err.message;
      btn.disabled = false; btn.textContent = 'Coba lagi';
      if (err.code === 'ROOM_UNAVAILABLE') loadRooms();
    }
  });
}

function showSuccess(res, r, name) {
  const payBtnHtml = `<button class="btn btn-primary" id="goManage">Kelola booking</button>`;
  openModal(`
    <div class="success">
      <div class="check">${ICON.check}</div>
      <h2>Rencana menginap tercatat</h2>
      <p>Ini merupakan pencatatan perjalanan untuk pengujian sistem, bukan konfirmasi hotel. Tidak ada pembayaran yang diperlukan. Simpan kode berikut:</p>
      <div class="code-box"><b>${esc(res.bookingId)}</b><button class="copy" id="copyCode">Salin</button></div>
      <div class="hint" style="margin:12px 0">Kode akses privat untuk mengelola booking (simpan baik-baik):</div>
      <div class="code-box" style="overflow-wrap:anywhere"><small>${esc(res.accessToken || 'Tidak tersedia untuk booking partner')}</small><button class="copy" id="copyAccessCode">Salin kode akses</button></div>
      <div class="summary">
        <div><span>Tamu</span><b>${esc(name)}</b></div>
        <div><span>Kamar</span><b>${esc(r.roomType)} · ${esc(r.hotelName)}</b></div>
        <div><span>Menginap</span><b>${fmtDate(state.checkIn)} – ${fmtDate(state.checkOut)}</b></div>
        <div class="tot"><span>Perkiraan biaya</span><span>${rupiah(res.totalPrice)}</span></div>
      </div>
      <div class="btns">
        <button class="btn btn-light" data-close>Tutup</button>
        ${payBtnHtml}
      </div>
    </div>`, true);
  $('#copyCode').onclick = () => navigator.clipboard?.writeText(res.bookingId).then(() => toast('Kode booking disalin'));
  $('#copyAccessCode').onclick = () => navigator.clipboard?.writeText(res.accessToken || '').then(() => toast('Kode akses privat disalin'));
  $('#goManage').onclick = () => { closeModal(); lookup(res.bookingId, name, true); };
}

// ---------- Manage booking ----------
function renderRecent() {
  const list = store.get();
  $('#recentBookings').innerHTML = list.length
    ? 'Booking Anda di perangkat ini: ' + list.map((b) => `<button data-id="${esc(b.id)}" data-name="${esc(b.name)}">${esc(b.id)}</button>`).join('')
    : '';
}
$('#recentBookings').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (b) lookup(b.dataset.id, b.dataset.name, false);
});
$('#lookupForm').addEventListener('submit', (e) => {
  e.preventDefault(); lookup($('#lookupId').value.trim().toUpperCase(), $('#lookupName').value.trim(), false);
});

async function lookup(id, name, scroll) {
  $('#lookupId').value = id; $('#lookupName').value = name;
  $('#lookupToken').value = bookingToken(id);
  const out = $('#lookupResult');
  try {
    const b = await api(`/hotel-bookings/${encodeURIComponent(id)}`, { headers: bookingHeaders(id) });
    out.innerHTML = bookingCard(b);
    bindBookingActions(b);
  } catch (e) {
    out.innerHTML = `<div class="err-box">Booking tidak ditemukan atau kode akses privat tidak valid. Periksa kembali kode booking dan kode akses.</div>`;
  }
  if (scroll) $('#manage').scrollIntoView({ behavior: 'smooth' });
}

function statusBadges(b) {
  const ST = { confirmed: ['badge-ok', 'Confirmed'], checked_in: ['badge-brand', 'Sedang menginap'], checked_out: ['badge-muted', 'Selesai'], cancelled: ['badge-bad', 'Dibatalkan'] };
  const [cls0, lab] = ST[b.status] || ['badge-muted', b.status];
  const st = `<span class="badge ${cls0}">${lab}</span>`;
  const p = b.payment.status;
  const cls = p === 'paid' ? 'badge-ok' : p === 'unpaid' ? 'badge-warn' : 'badge-brand';
  return st + ` <span class="badge ${cls}">${PAY_LABEL[p] || p}</span>`;
}

function bookingCard(b) {
  const c = b.cancellation;
  let notice = '';
  if (b.status === 'cancelled') {
    notice = b.payment.refundAmount > 0
      ? `<div class="notice notice-ok">${ICON.check}<div>Pencatatan dibatalkan. Nilai pengembalian <b>${rupiah(b.payment.refundAmount)}</b> hanyalah catatan sistem; tidak ada transfer uang.</div></div>`
      : `<div class="notice notice-bad">${ICON.info}<div>Booking dibatalkan${b.payment.paidAmount > 0 ? ' tanpa refund sesuai kebijakan pembatalan' : ''}.</div></div>`;
  } else if (c.allowed) {
    const tone = c.refundPercent === 100 ? 'info' : c.refundPercent === 50 ? 'warn' : 'bad';
    notice = `<div class="notice notice-${tone}">${ICON.info}<div>${b.payment.paidAmount > 0
      ? `Jika dibatalkan hari ini, refund <b>${c.refundPercent}%</b> (${rupiah(c.refundAmount)}).`
      : 'Booking belum dibayar, pembatalan tidak dikenai biaya.'} ${c.daysBeforeCheckIn > 0 ? `Check-in ${c.daysBeforeCheckIn} hari lagi.` : ''}</div></div>`;
  }
  const payLine = b.status === 'cancelled'
    ? `<div><small>Catatan pengembalian</small><div class="amount">${rupiah(b.payment.refundAmount)}</div></div>`
    : b.payment.status === 'paid'
      ? `<div><small>Catatan pembayaran (bukan transaksi)</small><div class="amount">${rupiah(b.payment.paidAmount)}</div></div>`
      : `<div><small>Perkiraan biaya</small><div class="amount">${rupiah(b.totalPrice)}</div></div>`;
  const actions = b.status === 'confirmed' ? `
      
      ${c.allowed ? '<button class="btn btn-ghost" id="actCancel" style="color:var(--bad);border-color:var(--bad)">Batalkan booking</button>' : ''}` : '';
  return `
    <div class="bk">
      <div class="bk-top">
        <img src="${esc(b.roomImageUrl || PLACEHOLDER)}" alt="">
        <div class="bk-main">
          <div class="bk-code"><b>${esc(b.bookingId)}</b>${statusBadges(b)}</div>
          <h3>${esc(b.roomType)} Room · ${esc(b.hotelName)}</h3>
          <div class="sub">Dipesan ${fmtDate(b.createdAt.slice(0, 10))}</div>
        </div>
      </div>
      <div class="bk-grid">
        <div><small>Tamu</small><b>${esc(b.guestName)}</b></div>
        <div><small>Menginap</small><b>${fmtDate(b.checkIn)} – ${fmtDate(b.checkOut)}</b></div>
        <div><small>Lama inap</small><b>${b.nights} malam</b></div>
        <div><small>Jumlah tamu</small><b>${b.guests} orang</b></div>
      </div>
      <div class="bk-pay">${payLine}<div class="bk-actions">${actions}</div></div>
      ${notice}
    </div>`;
}

function bindBookingActions(b) {
  const cancel = $('#actCancel');
  if (cancel) cancel.onclick = () => openCancel(b);
}

function openCancel(b) {
  const c = b.cancellation, paid = b.payment.paidAmount > 0;
  openModal(`
    <div class="dialog">
      <h2>Batalkan booking?</h2>
      <p>${esc(b.bookingId)} · ${fmtDate(b.checkIn)} – ${fmtDate(b.checkOut)}</p>
      <div class="refund-box">
        ${paid ? `<small>Estimasi refund (${c.refundPercent}%)</small><div class="big">${rupiah(c.refundAmount)}</div>
          <div class="meter"><i style="width:${c.refundPercent}%;${c.refundPercent < 100 ? 'background:var(--warn)' : ''}"></i></div>
          <small>dari ${rupiah(b.payment.paidAmount)} yang sudah dibayar</small>`
        : '<b>Booking belum dibayar</b><br><small>Tidak ada biaya pembatalan.</small>'}
      </div>
      <label class="field form"><span>Alasan (opsional)</span>
        <select id="cancelReason"><option>Rencana perjalanan berubah</option><option>Menemukan akomodasi lain</option><option>Salah pilih tanggal/kamar</option><option>Lainnya</option></select>
      </label>
      <p class="hint" style="font-size:.8rem;color:var(--muted)">${esc(c.policy)}</p>
      <div class="form-error" id="cancelErr"></div>
      <div class="btns"><button class="btn btn-light" data-close>Kembali</button><button class="btn btn-danger" id="cancelGo">Ya, batalkan</button></div>
    </div>`, true);
  $('#cancelGo').onclick = async () => {
    const btn = $('#cancelGo'); btn.disabled = true; btn.textContent = 'Memproses…';
    try {
      const res = await api(`/hotel-bookings/${b.bookingId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...bookingHeaders(b.bookingId) }, body: JSON.stringify({ reason: $('#cancelReason').value }) });
      closeModal();
      toast('Pencatatan reservasi dibatalkan');
      lookup(b.bookingId, b.guestName, false); loadRooms();
    } catch (e) { $('#cancelErr').textContent = e.message; btn.disabled = false; btn.textContent = 'Coba lagi'; }
  };
}

// ---------- Init ----------
(async function init() {
  $('#checkIn').value = isoOffset(1); $('#checkOut').value = isoOffset(3); syncDates();
  state.checkIn = $('#checkIn').value; state.checkOut = $('#checkOut').value; state.guests = +$('#guestCount').value;
  renderRecent();
  try { await loadHotels(); } catch (e) { $('#hotelGrid').innerHTML = `<div class="empty">Gagal memuat hotel: ${esc(e.message)}</div>`; }
  loadRooms();
})();
