// =====================================================================
// ui/hud.js — the in-match DOM interface around the canvas.
//
// Top resource bar, the selection readout, and the context-sensitive
// command grid (build / train buttons). Reads GameState every frame but
// only rebuilds DOM when the meaningful "signature" of the selection or
// build mode changes — so buttons aren't destroyed mid-click and the
// per-frame cost stays low.
// =====================================================================

import { FACTION } from '../config/constants.js';
import { UNITS } from '../config/units.js';
import { BUILDINGS } from '../config/buildings.js';
import { gameOptions } from '../core/options.js';
import { startBuildMode } from '../input/commands.js';
import { trainUnit } from '../systems/production.js';

export class Hud {
  constructor(state) {
    this.state = state;
    this.lastSelSig = '';
    this.lastCmdSig = '';

    this.el = {
      gold: document.getElementById('r-gold'),
      wood: document.getElementById('r-wood'),
      supply: document.getElementById('r-supply'),
      status: document.getElementById('status-msg'),
      selInfo: document.getElementById('sel-info'),
      cmdGrid: document.getElementById('cmd-grid'),
      buildHint: document.getElementById('build-hint'),
    };

    this._wireStaticControls();
  }

  setState(state) {
    this.state = state;
    this.lastSelSig = '\u0000';
    this.lastCmdSig = '\u0000';
  }

  _wireStaticControls() {
    let helpVisible = false;
    const help = document.getElementById('help');
    document.getElementById('help-toggle').addEventListener('click', () => {
      helpVisible = !helpVisible;
      help.style.display = helpVisible ? 'block' : 'none';
    });
    const edgeOpt = document.getElementById('opt-edge-scroll');
    edgeOpt.checked = gameOptions.edgeScroll;
    edgeOpt.addEventListener('change', e => { gameOptions.edgeScroll = e.target.checked; });
  }

  // Called every frame from the main loop.
  update() {
    const f = this.state.factions.player;
    this.el.gold.textContent = Math.floor(f.gold);
    this.el.wood.textContent = Math.floor(f.wood);
    this.el.supply.textContent = `${f.supply}/${f.maxSupply}`;
    this.el.status.textContent = this.state.statusMsg;
    this.el.buildHint.classList.toggle('show', !!this.state.buildMode);

    const selSig = this._selectionSignature();
    if (selSig !== this.lastSelSig) {
      this.lastSelSig = selSig;
      this._rebuildSelectionPanel();
    } else {
      this._updateSelectionLive();
    }

    const cmdSig = this._commandSignature();
    if (cmdSig !== this.lastCmdSig) {
      this.lastCmdSig = cmdSig;
      this._rebuildCommandPanel();
    } else {
      this._updateCommandStates();
    }
  }

  _selectedEntities() {
    return [...this.state.selected].map(id => this.state.getEntity(id)).filter(Boolean);
  }

  _selectionSignature() {
    const ids = [...this.state.selected].sort((a, b) => a - b);
    return ids.map(id => {
      const e = this.state.getEntity(id);
      if (!e) return 'x';
      let s = e.id + '.' + e.kind + '.' + e.type;
      if (e.kind === 'building') s += '.' + (e.isComplete ? 'c' : 'b');
      return s;
    }).join('|');
  }

  _commandSignature() {
    const ids = [...this.state.selected].sort((a, b) => a - b);
    let sig = (this.state.buildMode ? 'bm:' + this.state.buildMode.type : 'nb') + '|';
    for (const id of ids) {
      const e = this.state.getEntity(id);
      if (!e) { sig += 'x;'; continue; }
      sig += e.kind + '.' + e.type;
      if (e.kind === 'building') sig += '.' + (e.isComplete ? 'c' : 'b');
      sig += ';';
    }
    return sig;
  }

  _rebuildSelectionPanel() {
    const sel = this._selectedEntities();
    const selInfo = this.el.selInfo;
    if (!sel.length) {
      selInfo.innerHTML = 'Nothing selected. <span style="color:#888;">Left-click a unit, drag to box-select.</span>';
      return;
    }
    if (sel.length === 1) {
      const e = sel[0];
      const def = e.kind === 'unit' ? UNITS[e.type] : (e.kind === 'building' ? BUILDINGS[e.type] : null);
      if (def) {
        const rangeTxt = e.kind === 'unit'
          ? `<div style="color:#5a4731;">DMG ${UNITS[e.type].damage} • Range ${UNITS[e.type].ranged ? Math.floor(UNITS[e.type].range / 10) + ' tiles' : 'melee'}</div>`
          : '';
        selInfo.innerHTML = `
          <div class="big" id="sel-name">${def.name}</div>
          <div>HP: <span id="sel-hp-text">${Math.floor(e.hp)}</span> / ${Math.floor(e.maxHp)}</div>
          <div class="sel-hp-bar"><div class="sel-hp-fill" id="sel-hp-fill" style="width:${(e.hp / e.maxHp) * 100}%"></div></div>
          ${rangeTxt}
          <div id="sel-extra" style="color:#3a5a8a;"></div>
          <div style="color:#5a4731;font-style:italic;font-size:12px;margin-top:4px;">${def.desc || ''}</div>
        `;
      } else {
        selInfo.innerHTML = `<div class="big">${e.type === 'gold' ? 'Gold Mine' : 'Tree'}</div><div>Remaining: <span id="sel-extra">${e.amount}</span></div>`;
      }
    } else {
      const counts = {};
      for (const e of sel) {
        const name = e.kind === 'unit' ? UNITS[e.type].name : BUILDINGS[e.type].name;
        counts[name] = (counts[name] || 0) + 1;
      }
      selInfo.innerHTML = `<div class="big">${sel.length} selected</div>` +
        Object.entries(counts).map(([k, v]) => `<div>${v}× ${k}</div>`).join('');
    }
  }

  _updateSelectionLive() {
    const sel = this._selectedEntities();
    if (sel.length !== 1) return;
    const e = sel[0];
    const hpText = document.getElementById('sel-hp-text');
    const hpFill = document.getElementById('sel-hp-fill');
    if (hpText) hpText.textContent = Math.floor(e.hp);
    if (hpFill) hpFill.style.width = ((e.hp / e.maxHp) * 100) + '%';
    const extra = document.getElementById('sel-extra');
    if (!extra) return;
    if (e.kind === 'building' && !e.isComplete) {
      extra.style.color = '#a05030';
      extra.textContent = `Building... ${Math.floor((e.buildProgress / e.buildTotal) * 100)}%`;
    } else if (e.kind === 'building' && e.productionQueue && e.productionQueue.length) {
      const def = UNITS[e.productionQueue[0]];
      const pct = Math.floor((e.productionTimer / def.buildTime) * 100);
      extra.style.color = '#3a5a8a';
      extra.textContent = `Training: ${def.name} ${pct}%${e.productionQueue.length > 1 ? ' (+' + (e.productionQueue.length - 1) + ' queued)' : ''}`;
    } else if (e.kind === 'resource') {
      extra.textContent = e.amount;
    } else {
      extra.textContent = '';
    }
  }

  _rebuildCommandPanel() {
    const grid = this.el.cmdGrid;
    grid.innerHTML = '';
    const sel = this._selectedEntities().filter(e => e.faction === FACTION.PLAYER);
    if (!sel.length) return;

    if (sel.some(e => e.kind === 'unit' && e.type === 'peasant')) {
      this._addBuildButton('townhall');
      this._addBuildButton('barracks');
      this._addBuildButton('farm');
      this._addHintButton('Gather', '(right-click resource)');
      this._addHintButton('Repair', '(right-click building)');
    }

    for (const b of sel.filter(e => e.kind === 'building' && e.isComplete)) {
      const def = BUILDINGS[b.type];
      if (!def.produces) continue;
      for (const ut of def.produces) {
        const u = UNITS[ut];
        const btn = document.createElement('button');
        btn.className = 'cmd-btn';
        btn.dataset.train = ut;
        btn.dataset.buildingId = b.id;
        btn.innerHTML = `Train ${u.name}<span class="cost">${u.cost.gold}g${u.cost.wood ? ' ' + u.cost.wood + 'w' : ''} ★${u.cost.supply}</span>`;
        btn.onclick = () => {
          const bb = this.state.getEntity(parseInt(btn.dataset.buildingId, 10));
          if (bb) trainUnit(this.state, bb, ut);
        };
        grid.appendChild(btn);
      }
    }
    this._updateCommandStates();
  }

  _addBuildButton(buildingType) {
    const def = BUILDINGS[buildingType];
    const btn = document.createElement('button');
    btn.className = 'cmd-btn';
    btn.dataset.build = buildingType;
    btn.innerHTML = `Build ${def.name}<span class="cost">${def.cost.gold}g${def.cost.wood ? ' ' + def.cost.wood + 'w' : ''}</span>`;
    btn.onclick = () => startBuildMode(this.state, buildingType);
    this.el.cmdGrid.appendChild(btn);
  }

  _addHintButton(label, hint) {
    const btn = document.createElement('button');
    btn.className = 'cmd-btn';
    btn.innerHTML = `${label}<br><span style="font-size:9px;">${hint}</span>`;
    btn.disabled = true;
    this.el.cmdGrid.appendChild(btn);
  }

  _updateCommandStates() {
    const f = this.state.factions.player;
    this.el.cmdGrid.querySelectorAll('.cmd-btn').forEach(btn => {
      if (btn.dataset.build) {
        const def = BUILDINGS[btn.dataset.build];
        btn.disabled = !(f.gold >= def.cost.gold && f.wood >= (def.cost.wood || 0));
        btn.classList.toggle('building-mode',
          !!(this.state.buildMode && this.state.buildMode.type === btn.dataset.build));
      } else if (btn.dataset.train) {
        const u = UNITS[btn.dataset.train];
        btn.disabled = !(f.gold >= u.cost.gold && f.wood >= (u.cost.wood || 0) &&
          (f.supply + u.cost.supply <= f.maxSupply));
      }
    });
  }
}
