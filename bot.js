const crypto = require('crypto');

const axios = require('./axios');

const users = {};
const dms = {};

const signalHandler = {
  'slack.userlist': e => e.forEach(({ id, name, profile }) => {
    users[id] = profile.display_name || name;
  }),
  'slack.imlist': e => e.forEach(({ user, id }) => {
    dms[user] = id;
  }),
  'discord.userlist': e => e.forEach(({ user, nick }) => {
    users[user.id] = nick || user.username;
  }),
};

function DM(res, who, what) {
  if (who in dms) (who[0] === 'U' ? res.slack : res.discord).send(dms[who], what);
  else {
    if (who[0] === 'U') {
      axios.post(`https://slack.com/api/im.open?token=${process.env.STOKEN}&user=${who}`).then(({ data }) => {
        if (data.ok) {
          dms[who] = data.channel.id;
          res.slack.send(dms[who], what);
        }
      });
    }
    else {
      axios.post('https://discordapp.com/api/users/@me/channels', { recipient_id: who }).then(({ data }) => {
        dms[who] = data.id;
        res.discord.send(dms[who], what);
      });
    }
  }
}

function CM(res, what) {
  res.slack.send(process.env.SCHANNEL, what);
  res.discord.send(process.env.DCHANNEL, what);
}


function emojify(num) {
  const inum = num | 0;
  if (1 <= inum && inum <= 6) return [':one:', ':two:', ':three:', ':four:', ':five:', ':star:'][inum-1];
  return num;
}

function random(n) {
  const m = 256 / n | 0;
  while (true) {
    const t = crypto.randomBytes(1)[0] / m | 0;
    if (t < n) return t;
  }
}

function mention(u) {
  return u[0] === 'U'
    ? { slack: `<@${u}>`, discord: `<@!${users[u]}>` }
    : { slack: `&lt;@!${users[u]}&gt;`, discord: `<@${u}>` };
}

const bluff = {
  state: 0,
  pp: [],
};

function bluffRound(res) {
  bluff.pp = bluff.pp.filter(([x, y]) => y > 0);
  if (bluff.pp.length < 2) {
    const u = mention(bluff.pp[0][0]);
    res.slack.send(process.env.SCHANNEL, `승자: ${u.slack}`);
    res.discord.send(process.env.DCHANNEL, `승자: ${u.discord}`);
    bluff.state = 0;
    bluff.pp = [];
    return;
  }
  const u = mention(bluff.pp[0][0]);
  res.slack.send(process.env.SCHANNEL, `라운드 시작! ${u.slack}의 차례 (${bluff.pp.map(([x, y]) => `${users[x]}: ${y}`).join(', ')}, 총 ${bluff.pp.reduce((s, [, t]) => s + t, 0)}개)`);
  res.discord.send(process.env.DCHANNEL, `라운드 시작! ${u.discord}의 차례 (${bluff.pp.map(([x, y]) => `${users[x]}: ${y}`).join(', ')}, 총 ${bluff.pp.reduce((s, [, t]) => s + t, 0)}개)`);
  bluff.dice = {};
  bluff.pp.forEach(([x, y]) => {
    const d = bluff.dice[x] = [];
    for (let i = 0; i < y; i += 1) d.push(random(6) + 1);
    d.sort();
    DM(res, x, d.map(emojify).join(' '));
  });
}

const commandHandler = {
  '!join': (res, who) => {
    if (bluff.state || bluff.pp.includes(who)) return;
    bluff.pp.push(who);
    CM(res, `현재 ${bluff.pp.length}명 (${bluff.pp.map(e => users[e]).join(', ')})`);
  },
  '!start': (res, who) => {
    if (bluff.state || !bluff.pp.includes(who)) return;
    for (let i = 1; i < bluff.pp.length; i += 1) {
      const j = random(i + 1);
      const t = bluff.pp[i];
      bluff.pp[i] = bluff.pp[j];
      bluff.pp[j] = t;
    }
    bluff.state = 1;
    bluff.pp = bluff.pp.map(e => [e, 5]);
    bluffRound(res);
  },
  '!bet': (res, who, ...args) => {
    if (!bluff.state || who !== bluff.pp[0][0] || args.length !== 2) return;
    const x = +args[0] | 0, y = +args[1] | 0;
    if (x < 1 || x > 6 || y < 1) return;
    const [, tx, ty] = bluff.last || [0, 0, 0];
    if ((x === 6 ? y + y - 1 : y) * 10 + x <= (tx === 6 ? ty + ty - 1 : ty) * 10 + tx) return;
    bluff.pp.push(bluff.pp.shift());
    bluff.last = [who, x, y];
    const u = mention(bluff.pp[0][0]);
    res.slack.send(process.env.SCHANNEL, `${users[who]}의 베팅: ${emojify(x)}${'이가'[52 >> x & 1]} ${y}개, ${u.slack}의 차례`);
    res.discord.send(process.env.DCHANNEL, `${users[who]}의 베팅: ${emojify(x)}${'이가'[52 >> x & 1]} ${y}개, ${u.discord}의 차례`);
  },
  '!bluff': (res, who, ...args) => {
    if (!bluff.state || who !== bluff.pp[0][0] || !bluff.last || args.length !== 0) return;
    const [tw, tx, ty] = bluff.last;
    delete bluff.last;
    const cnt = Object.values(bluff.dice).reduce((s, e) => e.reduce((s, t) => s + (t === 6 || t === tx), s), 0);
    const text = `${users[who]}의 도전: ${emojify(tx)}${'이가'[52 >> tx & 1]} ${cnt}개 (차이: ${ty - cnt})\n${bluff.pp.map(([e]) => `${users[e]}: ${bluff.dice[e].map(emojify).join(' ')}`).join('\n')}`;
    if (ty < cnt) bluff.pp.find(([e]) => e === who)[1] -= cnt - ty;
    else if (ty > cnt) bluff.pp.find(([e]) => e === tw)[1] -= ty - cnt;
    else bluff.pp.forEach((e) => {
      if (e[0] != tw) e[1] -= 1;
    });
    bluffRound(res);
    CM(res, text);
  },
};

module.exports = {
  signal: (sig, ...args) => signalHandler[sig](...args),
  run: (res, who, what, ...args) => what in commandHandler && commandHandler[what](res, who, ...args),
};
