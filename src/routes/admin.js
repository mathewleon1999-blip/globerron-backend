const list = document.getElementById("product-list")
const form = document.getElementById("add-form")

const nameInput = document.getElementById("product-name")
const priceInput = document.getElementById("product-price")
const categoryInput = document.getElementById("product-category")
const stockInput = document.getElementById("product-stock")

async function loadProducts() {
  const res = await fetch("/api/products")
  const products = await res.json()

  list.innerHTML = ""

  products.forEach(p => {
    const div = document.createElement("div")
    div.className = "admin-product"
    div.innerHTML = `
      <strong>${p.name}</strong> — AED ${p.price} (${p.category})
      <br>
      <button onclick="editProduct(${p.id})">Edit</button>
      <button onclick="deleteProduct(${p.id})">Delete</button>
    `
    list.appendChild(div)
  })
}

form.addEventListener("submit", async e => {
  e.preventDefault()

  const product = {
    name: nameInput.value.trim(),
    price: Number(priceInput.value),
    category: categoryInput.value,
    inStock: stockInput.checked
  }

  if (!product.name || !product.price || !product.category) {
    alert("Please fill all fields")
    return
  }

  await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product)
  })

  form.reset()
  loadProducts()
})

async function deleteProduct(id) {
  await fetch(`/api/products/${id}`, { method: "DELETE" })
  loadProducts()
}

async function editProduct(id) {
  const name = prompt("New product name")
  const price = prompt("New price")

  if (!name || !price) return

  await fetch(`/api/products/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      price: Number(price)
    })
  })

  loadProducts()
}

loadProducts()
