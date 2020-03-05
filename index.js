require('dotenv').config();
const WebSocket = require('ws');
const qs = require('querystring');
const http = require('http');
const https = require('https');
const axios = require('axios').create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { cookie: process.env.COOKIE },
});

const ws = new WebSocket('wss://gateway.discord.gg/?v=6&encoding=json');
let last_s;
ws.on('message', (data) => {
  let { op, d, s, t } = JSON.parse(data);
  last_s = s;
  if (op === 0 && t === 'MESSAGE_CREATE') {
    axios.post('https://acmicpc.slack.com/api/chat.postMessage', qs.stringify({
      channel: process.env.SCHANNEL,
      token: process.env.TOKEN,
      text: `<${d.member.nick}> ${d.content}`,
    }));
  }
  if (op === 10) {
    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: process.env.DTOKEN,
        properties: {
          '$os': 'linux',
          '$browser': 'disco',
          '$device': 'disco',
        },
      },
    }));
    setInterval(() => ws.send(JSON.stringify({ op: 1, d: s })), d.heartbeat_interval);
  }
});
