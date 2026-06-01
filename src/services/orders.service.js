const fs = require('fs');
const path = require('path');

const ORDERS_PATH = path.join(__dirname, '..', 'orders.json');

function normalizeLegacyOrder(o) {
  if (!o || typeof o !== 'object') return null;

  // If it's already in the new schema, keep it.
  if (o.orderId) return o;

  const orderId = o.id || o.orderId || '';
  const created = o.createdAt || o.orderDate || o.created || null;

  // Map legacy/payment statuses to admin statuses.
  const legacyStatus = String(o.orderStatus || o.status || '').toLowerCase();
  const orderStatus = ['new', 'packed', 'shipped', 'delivered'].includes(legacyStatus)
    ? legacyStatus[0].toUpperCase() + legacyStatus.slice(1)
    : (legacyStatus === 'paid' ? 'New' : 'New');

  return {
    orderId,
    orderDate: created || new Date().toISOString(),
    orderStatus,
    paymentStatus: o.paymentStatus || (legacyStatus === 'paid' ? 'Paid' : 'Unpaid'),
    totalAmount: Number(o.totalAmount ?? o.amount ?? 0),
    customer: {
      fullName: o.customer?.fullName ?? o.customerName ?? '',
      phone: o.customer?.phone ?? o.customerPhone ?? '',
      email: o.customer?.email ?? o.customerEmail ?? '',
    },
    address: o.address || null,
    items: Array.isArray(o.items)
      ? o.items.map(i => ({
          productId: i.productId,
          productName: i.productName ?? i.name,
          partNumber: i.partNumber,
          quantity: Number(i.quantity || 0),
          price: Number(i.price || 0),
          subtotal: Number(i.quantity || 0) * Number(i.price || 0),
        }))
      : [],
  };
}

function ensureStore() {
  if (!fs.existsSync(ORDERS_PATH)) {
    fs.writeFileSync(ORDERS_PATH, JSON.stringify([], null, 2), 'utf8');
  }
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(ORDERS_PATH, 'utf8');
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return [];
  } catch (_) {
    return [];
  }
}

function writeAll(orders) {
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2), 'utf8');
}

function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${ts}-${rnd}`;
}

function create(order) {
  const orders = readAll();
  const now = new Date().toISOString();
  const record = {
    orderId: generateOrderId(),
    orderDate: now,
    orderStatus: 'New',
    paymentStatus: order.paymentStatus || 'Unpaid',
    totalAmount: Number(order.totalAmount || 0),
    customer: {
      fullName: order?.customer?.fullName || '',
      phone: order?.customer?.phone || '',
      email: order?.customer?.email || '',
    },
    address: {
      country: order?.address?.country || '',
      city: order?.address?.city || '',
      area: order?.address?.area || '',
      street: order?.address?.street || '',
      building: order?.address?.building || '',
      apartment: order?.address?.apartment || '',
      postalCode: order?.address?.postalCode || '',
      latitude: Number(order?.address?.latitude),
      longitude: Number(order?.address?.longitude),
    },
    items: Array.isArray(order.items) ? order.items.map(i => ({
      productId: i.productId,
      productName: i.productName,
      partNumber: i.partNumber,
      quantity: Number(i.quantity || 0),
      price: Number(i.price || 0),
      subtotal: Number(i.quantity || 0) * Number(i.price || 0),
    })) : [],

    // Order tracking (logistics)
    tracking: {
      carrier: order?.tracking?.carrier || '',
      trackingNumber: order?.tracking?.trackingNumber || '',
      trackingUrl: order?.tracking?.trackingUrl || ''
    },
    statusHistory: [
      { status: 'New', note: 'Order created', at: now }
    ]
  };

  orders.push(record);
  writeAll(orders);
  return record;
}

function list({ status, city, sort = 'orderDate:desc' } = {}) {
  let orders = readAll().map(normalizeLegacyOrder).filter(Boolean);
  if (status) orders = orders.filter(o => o.orderStatus === status);
  if (city) orders = orders.filter(o => (o.address?.city || '').toLowerCase() === city.toLowerCase());

  const [field, dir] = (sort || '').split(':');
  if (field) {
    orders.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      if (dir === 'asc') return av > bv ? 1 : -1;
      return av < bv ? 1 : -1;
    });
  }
  return orders;
}

function getById(id) {
  const key = String(id || '').trim();
  const orders = readAll().map(normalizeLegacyOrder).filter(Boolean);

  // Support lookup by:
  // - new schema orderId (ORD-...)
  // - legacy schema id
  // - Stripe session id (cs_...) stored as legacy id in some deployments
  return orders.find(o => String(o.orderId) === key || String(o.id) === key) || null;
}

function updateStatus(id, status, { note } = {}) {
  const orders = readAll();
  const allowed = ['New', 'Packed', 'Shipped', 'Delivered'];
  if (!allowed.includes(status)) throw new Error('Invalid status');

  // Support both new schema (orderId) and legacy schema (id)
  const idx = orders.findIndex(o => o.orderId === id || o.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();

  if (orders[idx].orderId) {
    orders[idx].orderStatus = status;
    if (!Array.isArray(orders[idx].statusHistory)) orders[idx].statusHistory = [];
    orders[idx].statusHistory.push({ status, note: note || '', at: now });
  } else {
    // Legacy orders don't have logistics statuses; keep legacy status updated too.
    orders[idx].status = status;
  }

  writeAll(orders);
  return normalizeLegacyOrder(orders[idx]);
}

function updateTracking(id, tracking = {}) {
  const key = String(id || '').trim();
  const orders = readAll();
  const idx = orders.findIndex(o => String(o.orderId) === key || String(o.id) === key);
  if (idx === -1) return null;

  // Allow tracking on both:
  // - new schema orders (orderId)
  // - legacy/Stripe orders where id may be a Stripe session id (cs_...)
  // Normalize by creating a tracking object if missing.

  if (!orders[idx].tracking || typeof orders[idx].tracking !== 'object') {
    orders[idx].tracking = { carrier: '', trackingNumber: '', trackingUrl: '' };
  }

  if (tracking.carrier !== undefined) orders[idx].tracking.carrier = String(tracking.carrier || '');
  if (tracking.trackingNumber !== undefined) orders[idx].tracking.trackingNumber = String(tracking.trackingNumber || '');
  if (tracking.trackingUrl !== undefined) orders[idx].tracking.trackingUrl = String(tracking.trackingUrl || '');

  writeAll(orders);

  // Return normalized record regardless of schema
  return normalizeLegacyOrder(orders[idx]);
}

function getTrackingPublic(id) {
  const o = getById(id);
  if (!o) return null;

  return {
    orderId: o.orderId,
    orderStatus: o.orderStatus,
    orderDate: o.orderDate,
    tracking: o.tracking || { carrier: '', trackingNumber: '', trackingUrl: '' },
    statusHistory: Array.isArray(o.statusHistory) ? o.statusHistory : []
  };
}

module.exports = {
  create,
  list,
  getById,
  updateStatus,
  updateTracking,
  getTrackingPublic,
};
