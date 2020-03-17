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

const bluff = {
  state: 0,
  pp: [],
};
function bluffRound(res) {
  bluff.pp = bluff.pp.filter(([x, y]) => y > 0);
  if (bluff.pp.length < 2) {
    CM(res, `승자: ${users[bluff.pp[0][0]]}`);
    bluff.state = 0;
    bluff.pp = [];
    return;
  }
  CM(res, `라운드 시작! ${users[bluff.pp[0][0]]}의 차례 (${bluff.pp.map(([x, y]) => `${users[x]}: ${y}`).join(', ')})`);
  bluff.dice = {};
  bluff.pp.forEach(([x, y]) => {
    const d = bluff.dice[x] = [];
    for (let i = 0; i < y; i += 1) d.push((Math.random() * 6 | 0) + 1);
    DM(res, x, d.join(' '));
  });
}

const commandHandler = {
  '!test': (res, who) => DM(res, who, users[who]),
  '!bluff': (res, who, cmd, ...args) => {
    if (bluff.state) {
      if (who != bluff.pp[0][0]) return;
      if (cmd === 'bluff' && bluff.last) {
        const [tw, tx, ty] = bluff.last;
        delete bluff.last;
        const cnt = Object.values(bluff.dice).reduce((s, e) => e.reduce((s, t) => s + (t === 6 || t === tx), s), 0);
        CM(res, `${users[who]}의 도전: ${tx}${'이가'[52 >> tx & 1]} ${cnt}개 (차이: ${ty - cnt})\n${bluff.pp.map(([e]) => `${users[e]}: ${bluff.dice[e].join(' ')}`).join('\n')}`);
        if (ty < cnt) bluff.pp.find(([e]) => e === who)[1] -= cnt - ty;
        else if (ty > cnt) bluff.pp.find(([e]) => e === tw)[1] -= ty - cnt;
        else bluff.pp.forEach((e) => {
          if (e[0] != tw) e[1] -= 1;
        });
        bluffRound(res);
      }
      if (cmd === 'bet') {
        const x = +args[0] | 0, y = +args[1] | 0;
        if (x >= 1 && x <= 6 && y >= 1) {
          const [, tx, ty] = bluff.last || [0, 0, 0];
          if ((x === 6 ? y + y - 1 : y) * 10 + x > (tx === 6 ? ty + ty - 1 : ty) * 10 + tx) {
            bluff.pp.push(bluff.pp.shift());
            bluff.last = [who, x, y];
            CM(res, `${users[who]}의 베팅: ${x}${'이가'[52 >> x & 1]} ${y}개, ${users[bluff.pp[0][0]]}의 차례`);
            return;
          }
        }
      }
      return;
    }
    if (cmd === 'join') {
      if (!bluff.pp.includes(who)) {
        bluff.pp.push(who);
        CM(res, `블러프 현재 ${bluff.pp.length}명 (${bluff.pp.map(e => users[e]).join(', ')})`);
      }
    }
    if (cmd === 'start' && bluff.pp.includes(who)) {
      for (let i = 1; i < bluff.pp.length; i += 1) {
        const j = Math.random() * (i + 1) | 0;
        const t = bluff.pp[i];
        bluff.pp[i] = bluff.pp[j];
        bluff.pp[j] = t;
      }
      bluff.state = 1;
      bluff.pp = bluff.pp.map(e => [e, 5]);
      bluffRound(res);
    }
  },
};

module.exports = {
  signal: (sig, ...args) => signalHandler[sig](...args),
  run: (res, who, what, ...args) => what in commandHandler && commandHandler[what](res, who, ...args),
};
