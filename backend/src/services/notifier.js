import nodemailer from "nodemailer";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";

function createTransporter() {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

const transporter = createTransporter();

async function sendMail({ to, subject, text, html }) {
  if (!transporter || !config.smtp.from) {
    logger.warn({ to, subject }, "smtp is not configured, email send skipped");
    return {
      stub: true,
      to,
      subject,
    };
  }

  return transporter.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html,
  });
}

export async function sendPromoCodeEmail({ to, code, title }) {
  return sendMail({
    to,
    subject: `Твой приз: ${title}`,
    text: `Твой промокод: ${code}`,
    html: `<p>Твой приз <strong>${title}</strong>.</p><p>Промокод: <strong>${code}</strong></p>`,
  });
}

export async function sendGuideEmail({ to, title, pdfUrl }) {
  return sendMail({
    to,
    subject: `Твой приз: ${title}`,
    text: `Гайд доступен по ссылке: ${pdfUrl}`,
    html: `<p>Твой гайд готов.</p><p><a href="${pdfUrl}">${pdfUrl}</a></p>`,
  });
}

export async function sendPhysicalConfirmationEmail({ to, title }) {
  return sendMail({
    to,
    subject: `Мы приняли заявку на приз: ${title}`,
    text: `Мы приняли заявку на твой приз "${title}" и скоро обработаем отправку.`,
    html: `<p>Мы приняли заявку на приз <strong>${title}</strong> и скоро обработаем отправку.</p>`,
  });
}
