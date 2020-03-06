require('dotenv').config();
const WebSocket = require('ws');
const qs = require('querystring');
const http = require('http');
const https = require('https');
const axios = require('axios').create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: {
    authorization: `Bot ${process.env.DTOKEN}`,
    cookie: process.env.COOKIE,
  },
});

let slackname = {}, stod = [['&lt;', '<'], ['&gt;', '>']], dtos = [];
axios.get(`https://slack.com/api/users.list?token=${process.env.STOKEN}`).then(({ data }) => {
  data.members.forEach(({ id, name, profile }) => {
    nick = profile.display_name || name;
    slackname[id] = nick;
    stod.push([`<@${id}>`, `<@!${nick}>`]);
    dtos.push([`<@!${nick}>`, `<@${id}>`]);
  });
});

let slack, discord;
axios.get(`https://slack.com/api/rtm.connect?token=${process.env.STOKEN}`).then(({ data }) => {
  console.log('Slack Connected');
  slack = new WebSocket(data.url);
  slack.on('message', (data) => {
    try {
      let { type, subtype, channel, user, text } = JSON.parse(data);
      if (type === 'message' && !subtype && channel === process.env.SCHANNEL) {
        stod.forEach(([u, v]) => {
          text = text.split(u).join(v);
        });
        axios.post(`https://discordapp.com/api/channels/${process.env.DCHANNEL}/messages`, {
          content: `<${slackname[user]}> ${text}`,
          tts: false,
        });
      }
    } catch (err) {
      console.error(err, data);
    }
  });
  setInterval(() => slack.send('{"id":0,"type":"ping"}'), 10000);
});

let last_s;
discord = new WebSocket('wss://gateway.discord.gg/?v=6&encoding=json');
discord.on('message', (data) => {
  try {
    let { op, d, s, t } = JSON.parse(data);
    last_s = s;
    if (op === 0) {
      if (t === 'MESSAGE_CREATE' && d.channel_id == process.env.DCHANNEL && !d.author.bot) {
        let text = d.content;
        dtos.forEach(([u, v]) => {
          text = text.split(u).join(v);
        });
        slack.send(JSON.stringify({
          type: 'message',
          channel: process.env.SCHANNEL,
          text: `<${d.member.nick || d.author.username}> ${text}`,
        }));
      }
      if (t === 'GUILD_CREATE') {
        d.members.forEach(({ user, nick }) => {
          const name = nick || user.username;
          dtos.push([`<@!${user.id}>`, `&lt;@!${name}&gt;`]);
          stod.push([`<@!${name}>`, `<@!${user.id}>`]);
        });
      }
    }
    if (op === 10) {
      discord.send(JSON.stringify({
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
      setInterval(() => discord.send(JSON.stringify({ op: 1, d: s })), d.heartbeat_interval);
    }
  } catch (err) {
    console.error(err, data);
  }
});
