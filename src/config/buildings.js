// =====================================================================
// buildings.js — building type definitions.
// Add a new building by adding an entry here; the command panel and
// production system pick it up generically.
// =====================================================================

export const BUILDINGS = {
  townhall: {
    name: 'Town Hall', size: 3, hp: 800,
    cost: { gold: 400, wood: 200 },
    buildTime: 60,
    isDropoff: true,
    produces: ['peasant'],
    color: { player: '#5d7eb8', enemy: '#b85d5d' },
    desc: "Central command. Drops off resources. Trains peasants. Destroying the enemy's wins the game.",
  },
  barracks: {
    name: 'Barracks', size: 3, hp: 500,
    cost: { gold: 200, wood: 80 },
    buildTime: 25,
    produces: ['footman', 'archer', 'knight'],
    color: { player: '#7a5a3a', enemy: '#8a4a3a' },
    desc: 'Trains military units.',
  },
  farm: {
    name: 'Farm', size: 2, hp: 200,
    cost: { gold: 80, wood: 40 },
    buildTime: 15,
    supply: 6,
    color: { player: '#a07a3a', enemy: '#7a5a2a' },
    desc: 'Provides 6 supply for your population.',
  },
};
