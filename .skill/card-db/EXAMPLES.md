# Usage Examples

## Built-in Examples

The project comes with several pre-configured example scripts that can be run using `pnpm`:

### Search Example
Demonstrates basic card search by name and print code.
```bash
pnpm example:search
```

### Filter Example
Shows complex filtering by type, color, rarity, cost, and symbol.
```bash
pnpm example:filter
```

### Set Example
Shows how to retrieve cards from specific sets.
```bash
pnpm example:set
```

## Command Line Interface (CLI)


Since this project uses TypeScript, you can run queries using `tsx` if it's installed, or by creating a temporary script.

### Search by name
```bash
npx tsx -e "import { searchCards } from './src/utils/cardHelpers.ts'; console.log(searchCards('นนทก'))"
```

### Global Search (Multi-field)
```bash
npx tsx -e "import { filterCards } from './src/utils/cardHelpers.ts'; console.log(filterCards({ search: 'Only #1' }))"
```

### Filter by Gem Color
```bash
npx tsx -e "import { filterCards } from './src/utils/cardHelpers.ts'; import { Color } from './src/types/cards.ts'; console.log(filterCards({ gemColor: Color.Red }))"
```

### Filter by Color and Cost
```bash
npx tsx -e "import { filterCards } from './src/utils/cardHelpers.ts'; import { Color } from './src/types/cards.ts'; console.log(filterCards({ color: Color.Red, cost: 3 }))"
```

## Integrated Scripting

You can create a `query.ts` file in the root directory to perform complex searches:

```typescript
import { filterCards } from './src/utils/cardHelpers.ts';
import { CardType, Color, Rarity } from './src/types/cards.ts';

const mySearch = filterCards({
  type: CardType.Avatar,
  color: [Color.Blue, Color.Green],
  rarity: Rarity.SR,
  ex: 'Only #1'
});

console.log(`Found ${mySearch.length} cards:`);
mySearch.forEach(card => console.log(`${card.print}: ${card.name}`));
```


Then run it with:
```bash
npx tsx query.ts
```
