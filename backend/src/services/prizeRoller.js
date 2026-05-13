export function rollPrize(prizes, random = Math.random) {
  const activePrizes = prizes.filter((prize) => prize.active);

  if (activePrizes.length === 0) {
    throw new Error("No active prizes available");
  }

  const totalWeight = activePrizes.reduce((sum, prize) => sum + prize.weight, 0);
  let cursor = random() * totalWeight;

  for (const prize of activePrizes) {
    cursor -= prize.weight;
    if (cursor <= 0) {
      return prize;
    }
  }

  return activePrizes[activePrizes.length - 1];
}
