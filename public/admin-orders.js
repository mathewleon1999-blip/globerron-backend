(function(){
  const tbody = document.getElementById('orders');
  const searchEl = document.getElementById('search');
  const filterEl = document.getElementById('filterStatus');
  const refreshBtn = document.getElementById('refresh');

  const modal = document.getElementById('orderModal');
  const orderBody = document.getElementById('orderBody');
  const closeModalBtn = document.getElementById('closeModal');
  const setNewBtn = document.getElementById('setNew');
  const setPackedBtn = document.getElementById('setPacked');
  const setShippedBtn = document.getElementById('setShipped');
  const setDeliveredBtn = document.getElementById('setDelivered');

  let all = [];
  let current = null;

  async function authFetch(url, options={}){
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login.html';
      throw new Error('Not authorised');
    }
    return res;
  }

  function row(order){
    const tr = document.createElement('tr');

    // Backward/forward compatible field mapping (prevents "undefined" in UI/CSV)
    const orderId = order.orderId ?? order.id ?? '';
    const customerName = order.customer?.fullName
      ?? order.customerName
      ?? order.customer?.name
      ?? order.name
      ?? '';

    const phoneRaw = order.customer?.phone
      ?? order.customerPhone
      ?? order.phone
      ?? order.customer?.contact
      ?? order.contact
      ?? '';
    const phone = String(phoneRaw || '').trim();
    const location = [
      order.address?.city ?? order.city,
      order.address?.area ?? order.area,
      order.address?.street ?? order.street,
      order.address?.building ?? order.building,
    ].filter(Boolean).join(', ');

    const amount = order.totalAmount ?? order.amount ?? 0;
    const status = order.orderStatus ?? order.status ?? 'Pending';
    const created = order.orderDate ?? order.createdAt ?? order.created ?? '';

    tr.innerHTML = `
      <td>${orderId || '-'}</td>
      <td>${customerName || '-'}</td>
      <td>${phone || '-'}</td>
      <td>${location || '-'}</td>
      <td>AED ${Number(amount||0).toFixed(2)}</td>
      <td><span class="status ${status}">${status}</span></td>
      <td>${created ? new Date(created).toLocaleString() : '-'}</td>
      <td><button class="btn" data-id="${orderId}">View</button></td>
    `;
    tr.querySelector('button').addEventListener('click', ()=> open(orderId));
    return tr;
  }

  function render(list){
    tbody.innerHTML = '';
    list.forEach(o => tbody.appendChild(row(o)));
  }

  async function load(){
    const params = new URLSearchParams();
    if (filterEl.value) params.set('status', filterEl.value);

    const [newRes, legacyRes] = await Promise.all([
      authFetch('/api/orders' + (params.toString()? ('?'+params.toString()):'')),
      authFetch('/api/orders-legacy')
    ]);

    const [newOrders, legacyOrders] = await Promise.all([
      newRes.json(),
      legacyRes.json()
    ]);

    // MERGE_NEW_AND_LEGACY: de-duplicate by orderId/id
    const map = new Map();
    [...(newOrders || []), ...(legacyOrders || [])].forEach(o => {
      const key = o?.orderId ?? o?.id;
      if (!key) return;
      map.set(String(key), o);
    });
    all = Array.from(map.values());

    applyFilter();
  }

  function applyFilter(){
    const q = searchEl.value.toLowerCase().trim();
    const filtered = all.filter(o => {
      const orderId = String(o.orderId ?? o.id ?? '').toLowerCase();
      const name = String(
        o.customer?.fullName
        ?? o.customerName
        ?? o.customer?.name
        ?? o.name
        ?? ''
      ).toLowerCase();

      const phone = String(
        o.customer?.phone
        ?? o.customerPhone
        ?? o.phone
        ?? o.customer?.contact
        ?? o.contact
        ?? ''
      ).toLowerCase();
      const city = String(o.address?.city ?? o.city ?? '').toLowerCase();
      const itemsText = Array.isArray(o.items)
        ? o.items.map(i => `${i.productName ?? i.name ?? ''} ${i.partNumber ?? ''}`).join(' ').toLowerCase()
        : '';
      return orderId.includes(q) || name.includes(q) || phone.includes(q) || city.includes(q) || itemsText.includes(q);
    });
    render(filtered);
  }

  async function open(id){
    if (!id) return;

    const res = await authFetch('/api/orders/' + id);
    const o = await res.json();
    current = o;

    const orderId = o.orderId ?? o.id ?? '';
    const dateVal = o.orderDate ?? o.createdAt ?? o.created ?? '';
    const status = o.orderStatus ?? o.status ?? 'Pending';
    const total = o.totalAmount ?? o.amount ?? 0;

    const customerName = o.customer?.fullName
      ?? o.customerName
      ?? o.customer?.name
      ?? o.name
      ?? '';

    const phone = String(
      o.customer?.phone
      ?? o.customerPhone
      ?? o.phone
      ?? o.customer?.contact
      ?? o.contact
      ?? ''
    ).trim();

    const email = o.customer?.email ?? o.customerEmail ?? o.email ?? '';

    const addr = o.address || {};
    const items = (o.items||[])
      .map(i=>`<li>${i.productName||''} (${i.partNumber||''}) x ${i.quantity} - AED ${Number(i.price||0).toFixed(2)}</li>`)
      .join('');

    const hasCoords = addr.latitude !== undefined && addr.longitude !== undefined && addr.latitude !== '' && addr.longitude !== '';
    const mapUrl = hasCoords
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${addr.latitude},${addr.longitude}`)}`
      : null;

    orderBody.innerHTML = `
      <div><strong>Order:</strong> ${orderId || '-'}</div>
      <div><strong>Date:</strong> ${dateVal ? new Date(dateVal).toLocaleString() : '-'}</div>
      <hr>
      <div><strong>Customer:</strong> ${customerName || '-'}
        ${phone ? ` | <a href="https://wa.me/${encodeURIComponent(phone)}" target="_blank">WhatsApp</a>` : ''}
        ${email ? ` | <a href="mailto:${email}">Email</a>` : ''}
      </div>
      <div><strong>Address:</strong> ${[addr.building, addr.street, addr.area, addr.city, addr.country].filter(Boolean).join(', ')}${addr.postalCode ? ` - ${addr.postalCode}` : ''}</div>
      <div><strong>Location:</strong> ${hasCoords ? `${addr.latitude}, ${addr.longitude}` : '-'} ${mapUrl ? `| <a href="${mapUrl}" target="_blank" class="btn">Open in Google Maps</a>` : ''}</div>
      <hr>
      <div><strong>Items</strong></div>
      <ul>${items || '<li>-</li>'}</ul>
      <div style="margin-top:6px"><strong>Total:</strong> AED ${Number(total||0).toFixed(2)}</div>
      <div style="margin-top:6px"><strong>Status:</strong> ${status}</div>
    `;

    modal.style.display = 'flex';
  }

  async function setStatus(status){
    if (!current) return;
    const id = current.orderId ?? current.id;
    if (!id) return;

    await authFetch('/api/orders/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await load();
    await open(id);
  }

  searchEl.addEventListener('input', applyFilter);
  filterEl.addEventListener('change', load);
  refreshBtn.addEventListener('click', load);
  closeModalBtn.addEventListener('click', ()=> modal.style.display = 'none');
  setNewBtn.addEventListener('click', ()=> setStatus('New'));
  setPackedBtn.addEventListener('click', ()=> setStatus('Packed'));
  setShippedBtn.addEventListener('click', ()=> setStatus('Shipped'));
  setDeliveredBtn.addEventListener('click', ()=> setStatus('Delivered'));

  load();
})();
