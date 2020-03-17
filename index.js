require('dotenv').config();
const WebSocket = require('ws');
const qs = require('querystring');
const FormData = require('form-data');

const axios = require('./axios');
const bot = require('./bot');

let slackname = {}, stod = [], dtos = [], ssd = [], sds = [], dsd = [], dds = [];
let recent = new Array(1000), ri = 0;
let slack, discord;

const res = {
  slack: {
    send: (channel, text) => slack.send(JSON.stringify({
      id: 0,
      type: 'message',
      channel,
      text,
    })),
  },
  discord: {
    send: (channel, content) => axios.post(`https://discordapp.com/api/channels/${channel}/messages`, { content }),
  },
};

function append(data) {
  if (ri === recent.length) ri = 0;
  recent[ri] = data;
  ri += 1;
}

const discord_queue = [];
let discord_awake;
(async () => {
  while (true) {
    await new Promise((resolve) => {
      discord_awake = resolve;
    });
    while (discord_queue.length) {
      const [ts, ...data] = discord_queue.shift();
      while (true) {
        try {
          const fd = new FormData();
          data.forEach(e => fd.append(...e));
          const { id } = (await axios.post(`https://discordapp.com/api/channels/${process.env.DCHANNEL}/messages`, fd, { headers: fd.getHeaders() })).data;
          append([ts, id]);
          break;
        } catch (err) {
          if (err.response && err.response.status === 429) {
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
    bot.signal('slack.userlist', data.members);
  });

  axios.get(`https://slack.com/api/im.list?token=${process.env.STOKEN}`).then(({ data }) => bot.signal('slack.imlist', data.ims));

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
        let { ok, reply_to, type, subtype, channel, user, text, files, message, ts } = JSON.parse(data);
        if (ok) append([ts, reply_to]);
        if (type === 'message' && channel === process.env.SCHANNEL && (!subtype || subtype === 'message_changed')) {
          if (subtype) {
            ({ user, text, ts } = message);
            if (user === process.env.SUSER) return;
          }
          stod.forEach(([u, v]) => {
            text = text.split(u).join(v);
          });
          const content = `<${slackname[user]}> ${text}`;
          if (!subtype) {
            if (!files) {
              discord_queue.push([ts, ['content', content]]);
              discord_awake();
              if (text[0] === '!') bot.run(res, user, ...text.split(/\s+/))
            }
            else {
              files.forEach((file) => {
                if (file.size > +process.env.LIMIT) {
                  discord_queue.push([ts, ['content', `${content}\n${file.url_private}`]]);
                  discord_awake();
                }
                else {
                  axios.get(file.url_private, { responseType: 'stream' }).then(({ data }) => {
                    discord_queue.push([ts, ['content', content], ['file', data, file.title]]);
                    discord_awake();
                  });
                }
              });
            }
          }
          else {
            const p = recent.find(e => e && e[0] === ts);
            if (p) {
              const [, id] = p;
              axios.patch(`https://discordapp.com/api/channels/${process.env.DCHANNEL}/messages/${id}`, { content });
            }
          }
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
  const msg = new Set(['MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE']);
  let alive = true, ping;
  discord = new WebSocket('wss://gateway.discord.gg/?v=6&encoding=json');
  discord.on('message', (data) => {
    try {
      let { op, d, s, t } = JSON.parse(data);
      if (op === 0) {
        if (d.channel_id === process.env.DCHANNEL && (!d.author || !d.author.bot) && msg.has(t)) {
          const { id } = d;
          let text;
          if (t === 'MESSAGE_DELETE') {
            text = '<>';
          }
          else if (!('content' in d)) {
            return;
          }
          else {
            text = d.content;
            dtos.forEach(([u, v]) => {
              text = text.split(u).join(v);
            });
            text = [`<${d.member.nick || d.author.username}> ${text.replace( /<:([a-z0-9\_]+):[0-9]{18}>/gm, ":$1:")}`, ...d.attachments.map(({ url }) => url)].join('\n');
          }
          if (t === 'MESSAGE_CREATE') {
            slack.send(JSON.stringify({
              id,
              type: 'message',
              channel: process.env.SCHANNEL,
              text,
            }));
            if (d.content[0] === '!') bot.run(res, d.author.id, ...d.content.split(/\s+/));
          }
          else {
            const p = recent.find(e => e && e[1] === id);
            if (p) {
              const [ts] = p;
              axios.post(`https://slack.com/api/chat.update`, qs.stringify({
                token: process.env.STOKEN,
                channel: process.env.SCHANNEL,
                text,
                ts,
              }));
            }
          }
        }
        if (t === 'GUILD_CREATE') {
          dsd = [];
          dds = [];
          d.emojis.forEach(({ name, id }) => {
            dsd.push([`:${name}:`, `<:${name}:${id}>`]);
          });
          d.members.forEach(({ user, nick }) => {
            const name = nick || user.username;
            dds.push([`<@${user.id}>`, `&lt;@!${name}&gt;`]);
            dds.push([`<@!${user.id}>`, `&lt;@!${name}&gt;`]);
            dsd.push([`<@!${name}>`, `<@${user.id}>`]);
          });
          stod = ssd.concat(dsd);
          dtos = sds.concat(dds);
          bot.signal('discord.userlist', d.members);
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
