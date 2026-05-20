import { getAllCards } from '../../../src/utils/cardHelpers.ts';

const cards = getAllCards();
const cardsWithLimit = cards.map(c => ({
  print: c.print,
  name: c.name,
  customLimit: c.customLimit,
  ex: (c as any).ex,
  mainEffect: (c as any).mainEffect
}));

console.log(JSON.stringify(cardsWithLimit, null, 2));
