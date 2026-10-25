// utils/settings.js - reads settings from the environment (the .env file) and checks them.

// How many proxies sit between the internet and our app. 0 means none (your own computer).
// On a hosting service it is usually 1. A wrong number lets visitors fake their IP address,
// so we accept only a whole number from 0 to 5 and refuse anything else.
function readTrustProxyHops(text) {
  if (text === undefined || text === '') {
    return 0;
  }
  if (!/^[0-5]$/.test(text)) {
    throw new Error('TRUST_PROXY_HOPS must be a whole number from 0 to 5');
  }
  return Number(text);
}

module.exports = {
  readTrustProxyHops,
};