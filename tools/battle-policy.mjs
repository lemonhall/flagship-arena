// Acceptance policy: normal steering/fire inputs and only offered upgrades.
// No health, damage, victory or spawn state is changed by this driver.
export function chooseBuild(sim) {
  const player = sim.unit('p0');
  const order = player.hp < player.maxHp * .55
    ? ['hull', 'battery', 'heated', 'chain', 'loader', 'powder', 'counter', 'payload']
    : ['battery', 'heated', 'chain', 'loader', 'powder', 'counter', 'payload', 'hull'];
  return order.find(id => sim.upgradeChoices.includes(id)) || sim.upgradeChoices[0];
}

export function runBattle(sim, command = s => s.aiCommand(s.unit('p0')), onStep = () => {}) {
  for (let steps = 0; sim.outcome === 'active' && steps < 22000; steps++) {
    if (sim.upgradeChoices.length) sim.chooseUpgrade(chooseBuild(sim));
    sim.step(1 / 60, command(sim));
    onStep(sim);
  }
  return sim;
}
