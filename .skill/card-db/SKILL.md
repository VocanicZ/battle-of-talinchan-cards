---
name: card-db
description: Interface with the Battle of Talinchan card database. Use when searching for card information, filtering cards by attributes (color, cost, type, etc.), or retrieving card details from the project's data.
---

# Card Database Skill

This skill allows you to query the Battle of Talinchan card database using the project's internal helper functions. **MANDATE: Always use these helper functions via `tsx` scripts instead of manual `grep` or `awk` searching across card files.**

## Quick start

To find a card by name:
```typescript
import { searchCards } from './src/utils/cardHelpers.ts';
const results = searchCards('นนทก');
console.log(results);
```

To filter cards by color and type:
```typescript
import { filterCards } from './src/utils/cardHelpers.ts';
import { Color, CardType } from './src/types/cards.ts';
const redAvatars = filterCards({ color: Color.Red, type: CardType.Avatar });
console.log(redAvatars);
```

## Workflows

### Searching for Cards
1. Use `searchCards(query: string)` for partial name matching.
2. Use `getCardByPrint(printCode: string)` for exact matches using the print code (e.g., 'BT01-001').
3. **Preferred:** Use `filterCards({ search: 'query' })` for a multi-field search (name, ex, effect, print).

### Filtering Cards
Use `filterCards(filters: FilterOptions)` to find cards matching specific criteria.
Available filter options:
- `type`: CardType | CardType[]
- `color`: Color | Color[]
- `rarity`: Rarity | Rarity[]
- `symbol`: Symbol | Symbol[]
- `cost`: number | { min?: number; max?: number }
- `gem`: number | { min?: number; max?: number }
- `power`: number | { min?: number; max?: number }
- `gemColor`: Color | Color[]
- `setCode`: string | string[]
- `name`: string (partial match)
- `ex`: string (partial match)
- `mainEffect`: string (partial match)
- `dropRate`: string (partial match)
- `soi`: number | { min?: number; max?: number }
- `customLimit`: number | { min?: number; max?: number }
- `subtype`: MagicSubtype | MagicSubtype[]
- `favorText`: string (partial match)
- `search`: string (multi-field global search)

### Database Maintenance
- When adding new cards, ensure they are added to the corresponding set file in `src/cards/`.
- Register new sets in `src/utils/cardHelpers.ts` by updating the `SET_MAP`.

## Advanced Features

See [REFERENCE.md](REFERENCE.md) for detailed property definitions and type information.

