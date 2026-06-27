// =====================================================================
// units.js — unit type definitions (stats, costs, visuals, descriptions).
// Add a new unit by adding an entry here; systems read these generically.
// =====================================================================

export const UNITS = {
  peasant: {
    name: 'Peasant', radius: 10, hp: 30, speed: 70,
    damage: 3, range: 14, attackCd: 1.2,
    cost: { gold: 50, wood: 0, supply: 1 },
    buildTime: 8,
    canGather: true, canBuild: true,
    color: { player: '#c9b682', enemy: '#aa8866' },
    desc: 'Worker. Gathers gold/wood and constructs buildings.',
  },
  footman: {
    name: 'Footman', radius: 11, hp: 70, speed: 65,
    damage: 9, range: 16, attackCd: 1.0,
    cost: { gold: 100, wood: 0, supply: 1 },
    buildTime: 10,
    color: { player: '#3d6cc8', enemy: '#c8443d' },
    desc: 'Sword infantry. Reliable melee.',
  },
  archer: {
    name: 'Archer', radius: 10, hp: 45, speed: 70,
    damage: 7, range: 140, attackCd: 1.4, ranged: true,
    cost: { gold: 80, wood: 50, supply: 1 },
    buildTime: 12,
    color: { player: '#4a8c4a', enemy: '#8c4a3a' },
    desc: 'Ranged. Strong from a distance, fragile up close.',
  },
  knight: {
    name: 'Knight', radius: 13, hp: 130, speed: 75,
    damage: 16, range: 18, attackCd: 1.1,
    cost: { gold: 200, wood: 50, supply: 2 },
    buildTime: 18,
    color: { player: '#2a3a6c', enemy: '#6c2a2a' },
    desc: 'Heavy cavalry. Tough and devastating, but costly.',
  },
};
