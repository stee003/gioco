// game/npcs.js — the five friends of the Quiet: hand-drawn characters and their
// dialogue state machines. Dialogue = array of localized keys, with optional
// effects applied when the line is shown.
import { noise1 } from '../core/utils.js';

// ---------------------------------------------------------------- drawing
export function drawNpc(c, p, world, time) {
  const boil = Math.floor(time * 7);
  const n = s => noise1(s + boil * 3.1, 77) * 1.3;
  c.save();
  c.translate(p.x, p.y);
  const DRAW = {
    wick: (c) => {
      const bob = Math.sin(time * 1.8) * 2;
      c.translate(0, bob);
      // moth-keeper: lanky, cloak, antennae, hand-lantern
      c.fillStyle = '#4a4258';
      c.beginPath();
      c.moveTo(-8, 0); c.quadraticCurveTo(-11, -26, -6, -34);
      c.lineTo(6, -34); c.quadraticCurveTo(11, -26, 8, 0);
      c.closePath(); c.fill();
      // head
      c.fillStyle = '#cfc0a0';
      c.beginPath(); c.ellipse(0, -40 + n(1), 7, 8, 0, 0, 7); c.fill();
      // antennae
      c.strokeStyle = '#cfc0a0'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-3, -46); c.quadraticCurveTo(-8, -56 + n(2), -12, -52); c.stroke();
      c.beginPath(); c.moveTo(3, -46); c.quadraticCurveTo(8, -58 + n(3), 12, -54); c.stroke();
      // eyes (kind, closed most of the time)
      c.strokeStyle = '#2c2418'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-4, -40); c.lineTo(-1, -40); c.stroke();
      c.beginPath(); c.moveTo(1, -40); c.lineTo(4, -40); c.stroke();
      // lantern arm
      c.strokeStyle = '#4a4258'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(6, -26); c.lineTo(13, -20); c.stroke();
      c.fillStyle = `rgba(255,200,120,${.8 + Math.sin(time * 6) * .15})`;
      c.shadowColor = '#ffb877'; c.shadowBlur = 10;
      c.beginPath(); c.arc(13, -16, 4, 0, 7); c.fill();
      c.shadowBlur = 0;
    },
    sedge: (c) => {
      // elder grown into moss, sitting in a root nook
      c.fillStyle = '#5e7e52';
      c.beginPath(); c.ellipse(0, -6, 20, 8, 0, 0, 7); c.fill();
      c.fillStyle = '#7fae5e';
      c.beginPath(); c.ellipse(-4, -14 + n(1), 12, 9, 0, 0, 7); c.fill();
      // face
      c.fillStyle = '#cfc0a0';
      c.beginPath(); c.ellipse(3, -24, 7, 8, 0, 0, 7); c.fill();
      c.strokeStyle = '#2c2418'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(1, -25, 2, .2, Math.PI - .2); c.stroke(); // closed happy eye
      c.beginPath(); c.arc(7, -25, 2, .2, Math.PI - .2); c.stroke();
      // smile
      c.beginPath(); c.arc(4, -20, 2.6, .1, Math.PI - .1); c.stroke();
      // little sprout on head
      c.strokeStyle = '#9fd47a'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(0, -32); c.quadraticCurveTo(-2 + n(2), -40, 2, -42); c.stroke();
      c.fillStyle = '#d2f7a8';
      c.beginPath(); c.ellipse(2, -42, 2.4, 1.6, .6, 0, 7); c.fill();
    },
    understudy: (c) => {
      const bob = Math.sin(time * 2.2) * 2.4;
      c.translate(0, bob);
      // performer: ragged tutu cloak, mask with a crack
      c.fillStyle = '#6a4a58';
      c.beginPath();
      c.moveTo(-9, 0);
      for (let i = 0; i < 5; i++) {
        c.quadraticCurveTo(-6 + i * 4.5, -6, -4 + i * 4.5, 0);
      }
      c.lineTo(9, 0); c.lineTo(5, -30); c.lineTo(-5, -30);
      c.closePath(); c.fill();
      // torso
      c.fillStyle = '#8a5a70';
      c.fillRect(-5, -32, 10, 14);
      // mask head
      c.fillStyle = '#e8d8c8';
      c.beginPath(); c.ellipse(0, -40 + n(1), 8, 9.4, 0, 0, 7); c.fill();
      c.strokeStyle = '#5a4a3a'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-2, -48); c.lineTo(1, -42); c.lineTo(-2, -36); c.stroke(); // the crack
      // painted eyes
      c.fillStyle = '#2c2418';
      c.beginPath(); c.ellipse(-3.4, -41, 1.6, 2.4, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(3.4, -41, 1.6, 2.4, 0, 0, 7); c.fill();
      // nervous hands
      c.strokeStyle = '#8a5a70'; c.lineWidth = 2.4;
      const tw = Math.sin(time * 9) * 1.6;
      c.beginPath(); c.moveTo(-5, -22); c.lineTo(-8, -16 + tw); c.stroke();
      c.beginPath(); c.moveTo(5, -22); c.lineTo(8, -16 - tw); c.stroke();
    },
    murmur: (c) => {
      // hollow robe, no body, a floating borrowed mask
      const fy = Math.sin(time * 1.4) * 3;
      c.fillStyle = '#26223a';
      c.beginPath();
      c.moveTo(-10, 0); c.quadraticCurveTo(-13, -30, 0, -34 + fy);
      c.quadraticCurveTo(13, -30, 10, 0);
      c.closePath(); c.fill();
      c.strokeStyle = '#161426'; c.lineWidth = 2; c.stroke();
      // emptiness inside
      c.fillStyle = '#0a0814';
      c.beginPath(); c.ellipse(0, -22 + fy, 7, 9, 0, 0, 7); c.fill();
      // the mask hovering in the dark
      c.save();
      c.translate(Math.sin(time * .9) * 2, -22 + fy);
      c.fillStyle = '#cfc0a0';
      c.beginPath(); c.ellipse(0, 0, 5.4, 6.4, 0, 0, 7); c.fill();
      c.fillStyle = '#161426';
      c.beginPath(); c.ellipse(-2, -1, 1.2, 1.8, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(2, -1, 1.2, 1.8, 0, 0, 7); c.fill();
      c.restore();
      // little drifting echo sparks
      for (let i = 0; i < 3; i++) {
        const a = time * 1.6 + i * 2.1;
        c.fillStyle = 'rgba(191,232,255,.6)';
        c.beginPath(); c.arc(Math.cos(a) * 14, -22 + Math.sin(a) * 10, 1.6, 0, 7); c.fill();
      }
    },
    archivist: (c) => {
      const fy = Math.sin(time * 1.1) * 3;
      c.translate(0, fy);
      // drowned scholar: dripping robe, spectral, holds a ledger
      c.fillStyle = 'rgba(58,90,96,.85)';
      c.beginPath();
      c.moveTo(-10, 4); c.quadraticCurveTo(-12, -28, 0, -34);
      c.quadraticCurveTo(12, -28, 10, 4);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(191,232,255,.85)';
      c.beginPath(); c.ellipse(0, -40, 7, 8, 0, 0, 7); c.fill();
      // stern eyes
      c.fillStyle = '#122228';
      c.fillRect(-4, -42, 3, 1.6); c.fillRect(1, -42, 3, 1.6);
      // drip
      if (Math.sin(time * 2) > .7) {
        c.fillStyle = 'rgba(122,224,208,.7)';
        c.beginPath(); c.arc(6, -28 + ((time * 40) % 20), 1.4, 0, 7); c.fill();
      }
      // ledger
      c.save(); c.translate(9, -18); c.rotate(.2);
      c.fillStyle = '#d8c79a';
      c.fillRect(-5, -7, 10, 14);
      c.strokeStyle = '#6a5a3a'; c.strokeRect(-5, -7, 10, 14);
      c.restore();
    },
  };
  (DRAW[p.npc] || DRAW.wick)(c);
  c.restore();
}

// ---------------------------------------------------------------- dialogue
// returns array of steps: {d: key} or {d: key, set: flag} / {shop: true} / {give:...}
export function talk(npcId, world) {
  const fl = {
    has: f => world.flags.has(f),
    add: f => world.addFlag(f),
  };
  const rand = a => a[Math.floor(Math.random() * a.length)];
  switch (npcId) {
    case 'wick':
    case 'wick2': {
      if (npcId === 'wick2' && !fl.has('met_wick2')) {
        return [{ d: 'd.wick.rootwife', set: 'met_wick2' }, { d: 'd.wick.tram' }];
      }
      if (!fl.has('met_wick')) return [{ d: 'd.wick.1', set: 'met_wick' }, { d: 'd.wick.2' }];
      if (world.has('boss_rootwife') && !fl.has('told_rootwife')) return [{ d: 'd.wick.rootwife', set: 'told_rootwife' }];
      return [{ d: rand(['d.wick.3', 'd.wick.tram', 'd.wick.late']) }];
    }
    case 'murmur': {
      if (!fl.has('met_murmur')) return [{ d: 'd.murmur.1', set: 'met_murmur' }, { d: 'd.murmur.2', shop: true }];
      return [{ d: rand(['d.murmur.2', 'd.murmur.bye']), shop: true }];
    }
    case 'sedge': {
      if (!fl.has('met_sedge')) return [{ d: 'd.sedge.1', set: 'met_sedge' }, { d: 'd.sedge.quest', set: 'quest_sedge' }];
      if (fl.has('quest_sedge') && world.has('has_seed') && !fl.has('quest_sedge_done')) {
        return [{ d: 'd.sedge.done', set: 'quest_sedge_done', clearItem: 'has_seed', reward: 120, bloom: true }];
      }
      if (fl.has('quest_sedge_done')) return [{ d: 'd.sedge.after' }];
      return [{ d: 'd.sedge.waiting' }];
    }
    case 'understudy':
    case 'understudy2': {
      if (npcId === 'understudy2') {
        return [{ d: fl.has('quest_understudy_done') ? 'd.understudy.after' : 'd.understudy.1' }];
      }
      if (!fl.has('met_understudy')) return [{ d: 'd.understudy.1', set: 'met_understudy' }, { d: 'd.understudy.quest', set: 'quest_understudy' }];
      if (fl.has('quest_understudy') && world.has('has_ariamask') && !fl.has('quest_understudy_done')) {
        return [{ d: 'd.understudy.done', set: 'quest_understudy_done', clearItem: 'has_ariamask', reward: 150 }];
      }
      if (fl.has('quest_understudy_done')) return [{ d: 'd.understudy.after' }];
      return [{ d: 'd.understudy.waiting' }];
    }
    case 'archivist': {
      if (!fl.has('met_archivist')) return [{ d: 'd.archivist.1', set: 'met_archivist' }, { d: 'd.archivist.quest', set: 'quest_archivist' }];
      const codexes = [...world.flags].filter(f => f.startsWith('codex_')).length;
      if (fl.has('quest_archivist') && codexes >= 3 && !fl.has('quest_archivist_done')) {
        return [{ d: 'd.archivist.done', set: 'quest_archivist_done', reward: 200 }];
      }
      if (fl.has('quest_archivist_done')) return [{ d: 'd.archivist.after' }];
      return [{ d: 'd.archivist.waiting' }];
    }
  }
  return [];
}
