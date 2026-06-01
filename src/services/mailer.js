const nodemailer = require("nodemailer")

function createTransporter() {
  // Recommended approach for Gmail:
  // - Set EMAIL_SERVICE=gmail
  // - Set EMAIL_USER=youraddress@gmail.com
  // - Set EMAIL_PASS=<Gmail App Password> (not your normal account password)
  // If 2FA is enabled, create an App Password: https://myaccount.google.com/apppasswords
  const service = process.env.EMAIL_SERVICE

  // If explicitly configured to use Gmail service, use Nodemailer's service config
  if (service) {
    return nodemailer.createTransport({
      service,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })
  }

  // Generic SMTP configuration
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: Boolean(process.env.EMAIL_SECURE === "true"),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })
}

const transporter = createTransporter()

async function sendMail({ to, subject, text, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email is not configured (EMAIL_USER/EMAIL_PASS)")
  }

  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER

  // Validate SMTP connectivity/auth early and provide actionable hints for common Gmail failures
  try {
    await transporter.verify()
  } catch (e) {
    const msg = e && e.message ? e.message : String(e)
    const code = e && e.code ? e.code : ""
    const responseCode = e && e.responseCode ? String(e.responseCode) : ""

    if (code === "EAUTH" || responseCode === "535") {
      throw new Error(
        "Email auth failed (EAUTH/535). If using Gmail, EMAIL_PASS must be a Gmail App Password (not your normal password). " +
          "Enable 2-Step Verification, then create an App Password: https://myaccount.google.com/apppasswords. " +
          "Original error: " +
          msg
      )
    }

    throw new Error("Email transport verify failed: " + msg)
  }

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  })
}

module.exports = { transporter, sendMail }
