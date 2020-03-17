const http = require('http');
const https = require('https');
module.exports = require('axios').create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: {
    authorization: `Bot ${process.env.DTOKEN}`,
    cookie: process.env.COOKIE,
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});
