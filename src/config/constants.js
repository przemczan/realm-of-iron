// =====================================================================
// constants.js — world dimensions, factions, and game-wide tunables.
// Pure data. No logic imports this module's behavior; change values here
// to retune the game without touching systems.
// =====================================================================

export const TILE = 32;
export const MAP_W = 64; // tiles
export const MAP_H = 44; // tiles
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const FACTION = {
  PLAYER: 'player',
  ENEMY: 'enemy',
  NEUTRAL: 'neutral',
};

// ---------------------------------------------------------------------
// Camera / input tuning
// ---------------------------------------------------------------------
export const CAMERA = {
  panSpeed: 600,       // px/sec
  fastMultiplier: 1.6, // when Shift held
  edgeScrollMargin: 24,
};

// ---------------------------------------------------------------------
// Starting economy
// ---------------------------------------------------------------------
export const STARTING_RESOURCES = {
  player: { gold: 350, wood: 150, supply: 0, maxSupply: 10 },
  enemy: { gold: 350, wood: 150, supply: 0, maxSupply: 10 },
};

export const BASE_MAX_SUPPLY = 10;
export const SUPPLY_HARD_CAP = 100;

// ---------------------------------------------------------------------
// Resource placement (the "fair, walk-to-gather" start)
// ---------------------------------------------------------------------
//
// Each base is guaranteed ONE gold mine and ONE small forest, placed a
// fixed distance away so peasants must actually travel to gather rather
// than standing still next to the Town Hall. "~10 peasants away" — a
// peasant is ~20px across, so ~10 diameters ≈ 200px ≈ ~6 tiles.
//
// Bump STARTING_PATCH_GAP_TILES up for longer hauls, down for faster
// early economy. Everything else about the start stays balanced because
// both factions are generated from the same template.
export const RESOURCE_PLACEMENT = {
  STARTING_PATCH_GAP_TILES: 12,  // 2× further — peasants must make a real trip
  STARTING_GOLD_GAP_TILES: 12,   // gold specifically (same as above, explicit)
  STARTING_FOREST_GAP_TILES: 6,  // forest stays at the original distance
  STARTING_FOREST_TREES: 7,      // trees in each base's guaranteed forest
  STARTING_FOREST_SPREAD: 2,     // scatter radius (tiles) of that forest
  MIN_GAP_FROM_ANY_BASE: 5,      // no *other* resource may spawn this close
  GOLD_AMOUNT: 6000,             // 3× original (2000)
  CONTESTED_GOLD_AMOUNT: 7500,   // 3× original (2500)
  TREE_AMOUNT: 400,              // 2× original (200)
};

// ---------------------------------------------------------------------
// Resource gathering economy
// ---------------------------------------------------------------------
export const GATHER = {
  gold: { haul: 10, cooldown: 1.4 },
  wood: { haul: 8, cooldown: 1.8 },
};
