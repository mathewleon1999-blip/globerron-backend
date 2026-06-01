const express = require("express")
const router = express.Router()

const adminAuth = require("../middleware/adminAuth")

const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  aiPartFinder,
  semanticSearch,
  buildEmbeddingsIndex,
} = require("../controllers/products.controller")

router.get("/", getAllProducts)

// Smart search / AI endpoints (defined before "/:id")
router.get("/search", searchProducts)
router.get("/semantic-search", semanticSearch)
router.post("/ai/part-finder", aiPartFinder)
router.post("/semantic-index/build", adminAuth, buildEmbeddingsIndex)

router.get("/:id", getProductById)

router.post("/", adminAuth, createProduct)
// IMPORTANT:
// Admin UI (public/admin.js) uses the JSON-based CRUD implemented in src/app.js (/api/products).
// This router is mounted at /api/products too, but its controller-based CRUD is DB-oriented and
// may return 501 in deployments without DB product CRUD configured.
// To avoid breaking admin edits, disable controller-based CRUD endpoints here.
// (Search/AI endpoints above remain available.)
//
// router.put("/:id", adminAuth, updateProduct)
// router.delete("/:id", adminAuth, deleteProduct)

module.exports = router
