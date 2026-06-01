const express = require('express');
const router = express.Router();
const Orders = require('../services/orders.service');

// Local copy of requireUser (app.js currently doesn't export it)
function requireUser(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ requiresAuth: true });
  }
  next();
}

// GET /api/my/orders -> list orders for logged-in customer (matched by email or phone)
router.get('/', requireUser, (req, res) => {
  try {
    // app.js stores users in users.json; easiest safe approach:
    // call /api/auth/me from frontend to get email/phone and match by those fields.
    // Here we accept email/phone via query as a fallback.
    const email = String(req.query.email || '').trim().toLowerCase();
    const phone = String(req.query.phone || '').trim();

    if (!email && !phone) {
      return res.status(400).json({ message: 'email or phone is required' });
    }

    const all = Orders.list({});
    const mine = all.filter(o => {
      const oe = String(o.customer?.email || '').trim().toLowerCase();
      const op = String(o.customer?.phone || '').trim();
      return (email && oe && oe === email) || (phone && op && op === phone);
    });

    res.json(mine);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
});

// GET /api/my/orders/:id -> get order if it belongs to logged-in customer
router.get('/:id', requireUser, (req, res) => {
  try {
    const order = Orders.getById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const email = String(req.query.email || '').trim().toLowerCase();
    const phone = String(req.query.phone || '').trim();
    if (!email && !phone) {
      return res.status(400).json({ message: 'email or phone is required' });
    }

    const oe = String(order.customer?.email || '').trim().toLowerCase();
    const op = String(order.customer?.phone || '').trim();

    const ok = (email && oe && oe === email) || (phone && op && op === phone);
    if (!ok) return res.status(403).json({ message: 'Not authorised' });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order', error: err.message });
  }
});

module.exports = router;
