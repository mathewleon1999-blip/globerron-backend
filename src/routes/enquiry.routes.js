const express = require("express")
const nodemailer = require("nodemailer")

const router = express.Router()

router.post("/", async (req, res) => {
  try {
    const { items } = req.body

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "No enquiry items provided" })
    }

    const productList = items
      .map(item => `${item.name} - AED ${item.price}`)
      .join("\n")

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })

    await transporter.sendMail({
      from: `"JIEDIZHEN Enquiry" <${process.env.EMAIL_USER}>`,
      to: process.env.ENQUIRY_RECEIVER,
      subject: "New Product Enquiry",
      text: `New enquiry received:\n\n${productList}`
    })

    res.json({ message: "Enquiry sent successfully" })
  } catch (error) {
    console.error("Enquiry error:", error)
    res.status(500).json({ message: "Failed to send enquiry" })
  }
})

module.exports = router
