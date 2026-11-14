// Copy this file to src/config.js and put your own key from https://api.nasa.gov there.
// src/config.js is git-ignored so the key is not uploaded.
const CONFIG = { nasaApiKey: 'DEMO_KEY' };

if (typeof module !== 'undefined') module.exports = CONFIG;
