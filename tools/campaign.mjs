import { ArenaSim } from '../src/sim.js';
import { HULLS } from '../src/catalog.js';
import { normalizeProgress, awardRun, buyTraining, recordVictory, partsBalance } from '../src/progression.js';
import { runBattle } from './battle-policy.mjs';

export function spendTraining(progress) {
  for (let level = 1; level <= 3; level++) for (const track of ['gunnery', 'hull', 'handling']) {
    if (progress.training[track] < level) progress = buyTraining(progress, track);
  }
  return progress;
}

// A complete fresh save journey. Every defeat is retained; retry seeds follow a
// fixed sequence, and training is purchased only with earnings from these battles.
export function playCampaign(initial = normalizeProgress(), baseSeed = 101) {
  let progress = initial, serial = 0;
  const runs = [];
  for (let stage = 0; stage < 6; stage++) {
    let won = false;
    for (let attempt = 0; attempt < 12 && !won; attempt++) {
      progress = spendTraining(progress);
      const seed = baseSeed + stage + serial++ * 997;
      const sim = new ArenaSim(seed, { stage, voyage: progress.voyage, hull: HULLS[Math.min(progress.cleared, 6)].id, training: progress.training });
      let highestEnemies = 0, shots = 0, bosses = 0, maxShells = 0;
      runBattle(sim, s => s.aiCommand(s.unit('p0')), () => {
        highestEnemies = Math.max(highestEnemies, sim.living(1).length);
        maxShells = Math.max(maxShells, sim.projectiles.length);
        shots += sim.events.filter(e => e.type === 'shot').length;
        bosses += sim.events.filter(e => e.type === 'boss').length;
      });
      won = sim.outcome === 'victory';
      progress = awardRun(progress, `campaign:${serial}`, sim.loot);
      if (won) progress = recordVictory(progress, stage, progress.voyage);
      runs.push({ stage: stage + 1, attempt: attempt + 1, seed, outcome: sim.outcome, seconds: Math.round(sim.time),
        hull: sim.playerHull.id, training: { ...progress.training }, upgrades: sim.upgrades, choices: sim.upgradesChosen,
        parts: sim.loot, balance: partsBalance(progress), kills: sim.score[0], bosses, shots, highestEnemies, maxShells });
    }
    if (!won) break;
  }
  return { progress, runs };
}
