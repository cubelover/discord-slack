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

let slackname = {}, stod = [], dtos = [], ssd = [], sds = [], dsd = [], dds = [];
let slack, discord;

const discord_queue = [];
let discord_awake;
(async () => {
  while (true) {
    await new Promise((resolve) => {
      discord_awake = resolve;
    });
    while (discord_queue.length) {
      data = discord_queue.shift();
      while (true) {
        try {
          await axios.post(`https://discordapp.com/api/channels/${process.env.DCHANNEL}/messages`, data);
          break;
        } catch (err) {
          if (err.response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, err.response.data.retry_after));
          }
          else {
            console.error(err);
          }
        }
      }
    }
  }
})();

function slack_start() {
  axios.get(`https://slack.com/api/users.list?token=${process.env.STOKEN}`).then(({ data }) => {
    ssd = [['&lt;', '<'], ['&gt;', '>']];
    sds = [];
    data.members.forEach(({ id, name, profile }) => {
      nick = profile.display_name || name;
      slackname[id] = nick;
      ssd.push([`<@${id}>`, `<@!${nick}>`]);
      sds.push([`<@!${nick}>`, `<@${id}>`]);
    });
    stod = ssd.concat(dsd);
    dtos = sds.concat(dds);
  });

  axios.get(`https://slack.com/api/rtm.connect?token=${process.env.STOKEN}`).then(({ data }) => {
    let alive = true, ping;
    slack = new WebSocket(data.url);
    slack.on('open', () => {
      console.log(new Date().toISOString(), 'slack open');
      ping = setInterval(() => {
        if (!alive) {
          slack.terminate();
          return;
        }
        alive = false;
        slack.send('{"id":0,"type":"ping"}');
      }, 10000);
    });
    slack.on('message', (data) => {
      try {
        let { type, subtype, channel, user, text } = JSON.parse(data);
        if (type === 'message' && !subtype && channel === process.env.SCHANNEL) {
          stod.forEach(([u, v]) => {
            text = text.split(u).join(v);
          });
          discord_queue.push({ content: `<${slackname[user]}> ${text}` });
          discord_awake();
        }
        if (type === 'pong') alive = true;
      } catch (err) {
        console.error(err, data);
      }
    });
    slack.on('close', () => {
      clearInterval(ping);
      setTimeout(slack_start, 10000);
    });
  });
}

function discord_start() {
  let last_s, alive = true, ping;
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
          text = text.replace( /<:([a-z0-9\_]+):[0-9]{18}>/gm, ":$1:");
          slack.send(JSON.stringify({
            type: 'message',
            channel: process.env.SCHANNEL,
            text: `<${d.member.nick || d.author.username}> ${text}`,
          }));
        }
        if (t === 'GUILD_CREATE') {
          dsd = [];
          dds = [];
          d.emojis.forEach(({ name, id }) => {
            dsd.push([`:${name}:`, `<:${name}:${id}>`]);
          });
          d.members.forEach(({ user, nick }) => {
            const name = nick || user.username;
            dds.push([`<@!${user.id}>`, `&lt;@!${name}&gt;`]);
            dsd.push([`<@!${name}>`, `<@!${user.id}>`]);
          });
          stod = ssd.concat(dsd);
          dtos = sds.concat(dds);
        }
      }
      if (op === 10) {
        console.log(new Date().toISOString(), 'discord open');
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
        ping = setInterval(() => {
          if (!alive) {
            discord.terminate();
            return;
          }
          alive = false;
          discord.send(JSON.stringify({ op: 1, d: s }));
        }, d.heartbeat_interval);
      }
      if (op === 11) alive = true;
    } catch (err) {
      console.error(err, data);
    }
  });
  discord.on('close', () => {
    clearInterval(ping);
    setTimeout(discord_start, 10000);
  });
}

slack_start();
discord_start();
