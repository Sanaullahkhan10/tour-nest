// utils/email.js - builds and sends the emails of the site (welcome, password reset).
// On your own computer nothing is sent: the email is written in the terminal, so you can copy the link.
// On the live server the settings EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD and EMAIL_FROM are needed.
const nodemailer = require('nodemailer');
const { lifetimeMinutes } = require('./resetToken');

// The address of the website, for the links inside emails. We read it from our own setting and never
// from the request, because a request can carry a fake address (an attacker could then put
// his own link in the reset email).
function readSiteUrl() {
  const setting = process.env.SITE_URL;
  if (setting) {
    return setting.replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing setting SITE_URL');
  }
  return 'http://localhost:' + (process.env.PORT || 3000);
}

// Reads the email settings and says which way to send: "console" (only on your computer) or "smtp".
function readEmailSettings() {
  const host = process.env.EMAIL_HOST;
  if (!host) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email is not set up: missing setting EMAIL_HOST');
    }
    return { mode: 'console', from: process.env.EMAIL_FROM || 'Tour Nest <no-reply@localhost>' };
  }

  const missing = [];
  const names = ['EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
  for (let i = 0; i < names.length; i++) {
    if (!process.env[names[i]]) {
      missing.push(names[i]);
    }
  }
  if (missing.length > 0) {
    throw new Error('Email is not set up: missing setting ' + missing.join(', '));
  }

  const port = Number(process.env.EMAIL_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('EMAIL_PORT must be a port number');
  }
  return {
    mode: 'smtp',
    host: host,
    port: port,
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM,
  };
}

// Sends one email: { to, subject, text, html }. It throws if the email cannot be sent.
async function sendEmail(message) {
  const settings = readEmailSettings();

  if (settings.mode === 'console') {
    // jsonTransport does not send anything. It only builds the email.
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const info = await transport.sendMail({ from: settings.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    console.log('[email not sent: no EMAIL_HOST in .env] to: ' + message.to + ' | subject: ' + message.subject + '\n' + message.text);
    return info;
  }

  // Port 465 starts encrypted. Other ports (587) start plain and must switch to encrypted before the login.
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.port !== 465,
    auth: { user: settings.user, pass: settings.password },
  });
  return transport.sendMail({ from: settings.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
}

// Text that comes from a visitor (a name) must never turn into HTML in an email.
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// The first word of the name, or "there" if the name is empty.
function firstName(user) {
  const words = String((user && user.name) || '').trim().split(/\s+/);
  return words[0] || 'there';
}

function buildWelcomeEmail(user, siteUrl) {
  const name = firstName(user);
  const text = 'Hi ' + name + ',\n\nWelcome to Tour Nest! Your account is ready.\nSee the tours: ' + siteUrl + '\n\nTour Nest is a learning and portfolio project.';
  const html =
    '<p>Hi ' + escapeHtml(name) + ',</p>' +
    '<p>Welcome to Tour Nest! Your account is ready.</p>' +
    '<p><a href="' + escapeHtml(siteUrl) + '">See the tours</a></p>' +
    '<p>Tour Nest is a learning and portfolio project.</p>';
  return { to: user.email, subject: 'Welcome to Tour Nest', text: text, html: html };
}

function buildResetEmail(user, link) {
  const name = firstName(user);
  const text =
    'Hi ' + name + ',\n\nSomebody asked to choose a new password for your Tour Nest account.\n' +
    'Open this link within ' + lifetimeMinutes + ' minutes:\n' + link + '\n\n' +
    'If it was not you, ignore this email. Your password stays the same.';
  const html =
    '<p>Hi ' + escapeHtml(name) + ',</p>' +
    '<p>Somebody asked to choose a new password for your Tour Nest account.</p>' +
    '<p><a href="' + escapeHtml(link) + '">Choose a new password</a> (the link works for ' + lifetimeMinutes + ' minutes)</p>' +
    '<p>If it was not you, ignore this email. Your password stays the same.</p>';
  return { to: user.email, subject: 'Your Tour Nest password reset link', text: text, html: html };
}

function sendWelcomeEmail(user, siteUrl) {
  return sendEmail(buildWelcomeEmail(user, siteUrl));
}

function sendPasswordResetEmail(user, link) {
  return sendEmail(buildResetEmail(user, link));
}

// Runs the sending in the background. The visitor does not wait for the email, and a failed email
// (wrong settings, the mail service is down) never breaks the page or the answer of the API.
// We write only the message of the error, because the full error may hold login details.
function sendInBackground(label, makeEmail) {
  Promise.resolve()
    .then(makeEmail)
    .catch((error) => {
      console.error('Could not send the ' + label + ':', error && error.message);
    });
}

module.exports = {
  readSiteUrl,
  readEmailSettings,
  sendEmail,
  buildWelcomeEmail,
  buildResetEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendInBackground,
};
