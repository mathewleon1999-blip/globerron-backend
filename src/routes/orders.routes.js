const express = require('express');
const router = express.Router();
const Orders = require('../services/orders.service');
const adminAuth = require('../middleware/adminAuth');
const store = require('../storage');

function validateOrderPayload(body) {
  const errors = [];
  const requiredCustomer = ['fullName', 'phone', 'email'];
  const requiredAddress = ['country', 'city', 'area', 'street', 'building', 'postalCode', 'latitude', 'longitude'];

  if (!body.customer) errors.push('customer is required');
  else requiredCustomer.forEach(f => { if (!body.customer[f]) errors.push(`customer.${f} is required`); });

  if (!body.address) errors.push('address is required');
  else requiredAddress.forEach(f => { if (body.address[f] === undefined || body.address[f] === null || body.address[f] === '' ) errors.push(`address.${f} is required`); });

  if (!Array.isArray(body.items) || body.items.length === 0) errors.push('items are required');
  if (body.address) {
    const lat = Number(body.address.latitude);
    const lng = Number(body.address.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) errors.push('address.latitude and address.longitude must be numbers');
  }

  return errors;
}

// Create order
router.post('/', (req, res) => {
  try {
    const errors = validateOrderPayload(req.body || {});
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const totalAmount = (req.body.items || []).reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.price || 0), 0);
    const record = Orders.create({ ...req.body, totalAmount });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create order', error: err.message });
  }
});

// List orders (admin)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status, city, sort } = req.query;

    // Prefer unified storage provider (used by Stripe checkout success)
    if (store?.orders?.list || store?.orders?.listFiltered) {
      let records = []
      if (typeof store.orders.list === 'function') records = await store.orders.list({ status, city, sort })
      else if (typeof store.orders.listFiltered === 'function') records = await store.orders.listFiltered({ status, city, sort })
      else records = []
      return res.json(records)
    }

    // Fallback to legacy Orders service (src/orders.json)
    const records = Orders.list({ status, city, sort });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
});

// Get order by ID (admin)
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '')

    if (store?.orders?.findById) {
      const order = await store.orders.findById(id)
      if (!order) return res.status(404).json({ message: 'Order not found' })
      return res.json(order)
    }

    const order = Orders.getById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order', error: err.message });
  }
});

// Update status (admin)
router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ message: 'status is required' });

    if (store?.orders?.updateById) {
      const existing = await store.orders.findById(id)
      if (existing) {
        const history = Array.isArray(existing.statusHistory) ? existing.statusHistory : []
        history.push({ status: String(status), note: String(note || ''), at: new Date().toISOString() })

        const updated = await store.orders.updateById(id, {
          ...existing,
          status: String(status),
          statusHistory: history,

          // Compatibility: older frontend/admin screens may still read orderStatus
          orderStatus: String(status)
        })
        return res.json(updated)
      }
      // If not found in unified store, fall through to legacy Orders service.
    }

    const updated = Orders.updateStatus(id, status, { note });
    if (!updated) return res.status(404).json({ message: 'Order not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update status', error: err.message });
  }
});

// Update tracking (admin)
router.patch('/:id/tracking', adminAuth, async (req, res) => {
  try {
    const id = String(req.params.id || '')

    if (store?.orders?.updateById) {
      const existing = await store.orders.findById(id)
      if (existing) {
        const patch = {
          carrier: req.body?.carrier,
          trackingNumber: req.body?.trackingNumber,
          trackingUrl: req.body?.trackingUrl,
        }

        const tracking = { ...(existing.tracking || { carrier: '', trackingNumber: '', trackingUrl: '' }) }
        if (patch.carrier !== undefined) tracking.carrier = String(patch.carrier || '')
        if (patch.trackingNumber !== undefined) tracking.trackingNumber = String(patch.trackingNumber || '')
        if (patch.trackingUrl !== undefined) tracking.trackingUrl = String(patch.trackingUrl || '')

        const history = Array.isArray(existing.statusHistory) ? existing.statusHistory : []
        history.push({ status: 'TrackingUpdated', note: `Tracking updated (${tracking.carrier || 'carrier'})`, at: new Date().toISOString() })

        const updated = await store.orders.updateById(id, {
          ...existing,
          tracking,
          statusHistory: history,

          // Compatibility: some older UIs read tracking fields at top-level or expect orderStatus
          orderStatus: existing.orderStatus || existing.status || 'New'
        })

        return res.json(updated)
      }
      // If not found in unified store, fall through to legacy Orders service.
    }

    const updated = Orders.updateTracking(id, req.body || {});
    if (!updated) return res.status(404).json({ message: 'Order not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update tracking', error: err.message });
  }
});

// Public tracking lookup (customer): requires orderId + phone OR orderId + email
router.post('/track', async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!orderId) return res.status(400).json({ message: 'orderId is required' });
    if (!phone && !email) {
      return res.status(400).json({ message: 'phone or email is required' });
    }

    let order = null

    // Prefer unified storage provider
    if (store?.orders?.findById) {
      order = await store.orders.findById(orderId)
    }

    // Fallback to legacy orders service
    if (!order) {
      order = Orders.getById(orderId);
      if (!order) {
        order = Orders.list().find(o => String(o.id || '') === orderId) || null;
      }
    }

    if (!order) return res.status(404).json({ message: 'Order not found' });

    const orderPhoneRaw = String(order?.customer?.phone || '').trim();
    const orderEmail = String(order?.customer?.email || '').trim().toLowerCase();

    const normPhone = (v) => String(v || '').replace(/[^0-9]/g, '');
    const phoneN = normPhone(phone);
    const orderPhoneN = normPhone(orderPhoneRaw);

    // If the order is linked to a logged-in user, allow tracking without phone/email matching.
    // This avoids "Order not found" when the stored phone/email format differs across devices,
    // while still keeping tracking private for logged-out users.
    const ok = (phoneN && orderPhoneN && phoneN === orderPhoneN) || (email && orderEmail && email === orderEmail);
    const isOwner = Boolean(req.session?.userId && (String(order.userId || '') === String(req.session.userId)));
    if (!ok && !isOwner) return res.status(404).json({ message: 'Order not found' });

    const trackingId = String(order.orderId || order.id || orderId);

    // Normalize the response shape expected by the frontend
    // Admin updates the unified storage using `status`.
    // Normalize so frontend always sees the latest status.
    const out = {
      orderId: trackingId,
      orderStatus: order.status || order.orderStatus || 'New',
      orderDate: order.orderDate || order.createdAt || order.created || null,
      tracking: order.tracking || { carrier: '', trackingNumber: '', trackingUrl: '' },
      statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : []
    }

    res.json(out);
  } catch (err) {
    res.status(500).json({ message: 'Failed to track order', error: err.message });
  }
});

module.exports = router;
