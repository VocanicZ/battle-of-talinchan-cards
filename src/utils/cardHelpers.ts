import {
  CARDS_BT01,
  CARDS_BT02,
  CARDS_BT03,
  CARDS_BT04,
  CARDS_BT05,
  CARDS_BT06,
  CARDS_BT07,
  CARDS_BT08,
  CARDS_CC01,
  CARDS_CC02,
  CARDS_ODY1,
  CARDS_PRE0,
  CARDS_PRMO,
  CARDS_SD01,
  CARDS_SD02,
  CARDS_SD03,
  CARDS_SD04,
  CARDS_SD05,
  CARDS_SD06,
  CARDS_SD07,
  CARDS_SL01,
} from '../cards';
import type {
  Card,
  CardType,
  Color,
  MagicSubtype,
  Rarity,
  Symbol,
} from '../types/cards';

/**
 * Type for card definitions that can include multiple rarities
 */
export type CardDefinition = Card & { variants?: Rarity[] };

/**
 * Helper to create multiple cards from a single definition with variants
 * @param definitions - Array of card definitions
 * @returns Flattened array of cards
 */
export function createCards(definitions: CardDefinition[]): Card[] {
  return definitions.flatMap((def) => {
    const { variants, ...base } = def;
    const cards = [base as Card];
    if (variants) {
      for (const rarity of variants) {
        cards.push({ ...base, rare: rarity } as Card);
      }
    }
    return cards;
  });
}

// Map of set codes to their card arrays
const SET_MAP: Record<string, Card[]> = {
  BT01: CARDS_BT01,
  BT02: CARDS_BT02,
  BT03: CARDS_BT03,
  BT04: CARDS_BT04,
  BT05: CARDS_BT05,
  BT06: CARDS_BT06,
  BT07: CARDS_BT07,
  BT08: CARDS_BT08,
  CC01: CARDS_CC01,
  CC02: CARDS_CC02,
  ODY1: CARDS_ODY1,
  PRE0: CARDS_PRE0,
  PRMO: CARDS_PRMO,
  SD01: CARDS_SD01,
  SD02: CARDS_SD02,
  SD03: CARDS_SD03,
  SD04: CARDS_SD04,
  SD05: CARDS_SD05,
  SD06: CARDS_SD06,
  SD07: CARDS_SD07,
  SL01: CARDS_SL01,
};

/**
 * Get all cards from all sets
 * @returns Array of all cards
 */
export function getAllCards(): Card[] {
  return Object.values(SET_MAP).flat();
}

/**
 * Get cards from a specific set
 * @param setCode - Set code (e.g., 'BT01', 'BT02', 'SD01')
 * @returns Array of cards from the specified set, or empty array if set not found
 */
export function getCardsBySet(setCode: string): Card[] {
  const normalizedSetCode = setCode.toUpperCase();
  return SET_MAP[normalizedSetCode] || [];
}

/**
 * Search cards by name (case-insensitive, partial match)
 * @param query - Search query string
 * @returns Array of cards matching the query
 */
export function searchCards(query: string): Card[] {
  if (!query.trim()) {
    return [];
  }
  const lowerQuery = query.toLowerCase();
  return getAllCards().filter((card) =>
    card.name.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Filter options for card filtering
 */
export interface FilterOptions {
  type?: CardType | CardType[];
  color?: Color | Color[];
  rarity?: Rarity | Rarity[];
  symbol?: Symbol | Symbol[];
  cost?: number | { min?: number; max?: number };
  gem?: number | { min?: number; max?: number };
  gemColor?: Color | Color[];
  power?: number | { min?: number; max?: number };
  setCode?: string | string[];
  name?: string;
  ex?: string;
  mainEffect?: string;
  search?: string;
  dropRate?: string;
  soi?: number | { min?: number; max?: number };
  customLimit?: number | { min?: number; max?: number };
  subtype?: MagicSubtype | MagicSubtype[];
  favorText?: string;
}

/**
 * Filter cards by various criteria
 * @param filters - Filter options object
 * @returns Array of cards matching all filter criteria
 */
export function filterCards(filters: FilterOptions): Card[] {
  let cards = getAllCards();

  // Filter by type
  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    cards = cards.filter((card) => types.includes(card.type as CardType));
  }

  // Filter by color
  if (filters.color) {
    const colors = Array.isArray(filters.color)
      ? filters.color
      : [filters.color];
    cards = cards.filter((card) => {
      if ('color' in card && card.color) {
        return colors.includes(card.color as Color);
      }
      return false;
    });
  }

  // Filter by rarity
  if (filters.rarity) {
    const rarities = Array.isArray(filters.rarity)
      ? filters.rarity
      : [filters.rarity];
    cards = cards.filter((card) => rarities.includes(card.rare as Rarity));
  }

  // Filter by symbol
  if (filters.symbol) {
    const symbols = Array.isArray(filters.symbol)
      ? filters.symbol
      : [filters.symbol];
    cards = cards.filter((card) => {
      if ('symbol' in card) {
        return symbols.includes(card.symbol as Symbol);
      }
      return false;
    });
  }

  // Filter by cost
  if (filters.cost !== undefined) {
    if (typeof filters.cost === 'number') {
      cards = cards.filter((card) => {
        if ('cost' in card) {
          return (card.cost ?? 0) === filters.cost;
        }
        return false;
      });
    } else {
      const { min, max } = filters.cost;
      cards = cards.filter((card) => {
        if ('cost' in card) {
          const cost = card.cost ?? 0;
          if (min !== undefined && cost < min) return false;
          if (max !== undefined && cost > max) return false;
          return true;
        }
        return false;
      });
    }
  }

  // Filter by gem
  if (filters.gem !== undefined) {
    if (typeof filters.gem === 'number') {
      cards = cards.filter((card) => {
        if ('gem' in card) {
          return (card.gem ?? 0) === filters.gem;
        }
        return false;
      });
    } else {
      const { min, max } = filters.gem;
      cards = cards.filter((card) => {
        if ('gem' in card) {
          const gem = card.gem ?? 0;
          if (min !== undefined && gem < min) return false;
          if (max !== undefined && gem > max) return false;
          return true;
        }
        return false;
      });
    }
  }

  // Filter by gem color
  if (filters.gemColor) {
    const gemColors = Array.isArray(filters.gemColor)
      ? filters.gemColor
      : [filters.gemColor];
    cards = cards.filter((card) => {
      if ('gemColor' in card && card.gemColor) {
        return gemColors.includes(card.gemColor as Color);
      }
      return false;
    });
  }

  // Filter by power
  if (filters.power !== undefined) {
    if (typeof filters.power === 'number') {
      cards = cards.filter((card) => {
        if ('power' in card) {
          return (card.power ?? 0) === filters.power;
        }
        return false;
      });
    } else {
      const { min, max } = filters.power;
      cards = cards.filter((card) => {
        if ('power' in card) {
          const power = card.power ?? 0;
          if (min !== undefined && power < min) return false;
          if (max !== undefined && power > max) return false;
          return true;
        }
        return false;
      });
    }
  }

  // Filter by set code
  if (filters.setCode) {
    const setCodes = Array.isArray(filters.setCode)
      ? filters.setCode
      : [filters.setCode];
    cards = cards.filter((card) => {
      const cardSetCode = card.print.split('-')[0];
      return setCodes.some((code) =>
        cardSetCode.toUpperCase().includes(code.toUpperCase())
      );
    });
  }

  // Filter by name (partial match, case-insensitive)
  if (filters.name) {
    const lowerName = filters.name.toLowerCase();
    cards = cards.filter((card) =>
      card.name.toLowerCase().includes(lowerName)
    );
  }

  // Filter by ex (partial match, case-insensitive)
  if (filters.ex) {
    const lowerEx = filters.ex.toLowerCase();
    cards = cards.filter((card) =>
      card.ex && card.ex.toLowerCase().includes(lowerEx)
    );
  }

  // Filter by mainEffect (partial match, case-insensitive)
  if (filters.mainEffect) {
    const lowerEffect = filters.mainEffect.toLowerCase();
    cards = cards.filter((card) => {
      if ('mainEffect' in card && card.mainEffect) {
        return card.mainEffect.toLowerCase().includes(lowerEffect);
      }
      return false;
    });
  }

  // Filter by dropRate (partial match, case-insensitive)
  if (filters.dropRate) {
    const lowerDropRate = filters.dropRate.toLowerCase();
    cards = cards.filter((card) =>
      card.dropRate && card.dropRate.toLowerCase().includes(lowerDropRate)
    );
  }

  // Filter by soi
  if (filters.soi !== undefined) {
    if (typeof filters.soi === 'number') {
      cards = cards.filter((card) => card.soi === filters.soi);
    } else {
      const { min, max } = filters.soi;
      cards = cards.filter((card) => {
        const soi = card.soi;
        if (min !== undefined && soi < min) return false;
        if (max !== undefined && soi > max) return false;
        return true;
      });
    }
  }

  // Filter by customLimit
  if (filters.customLimit !== undefined) {
    if (typeof filters.customLimit === 'number') {
      cards = cards.filter((card) => card.customLimit === filters.customLimit);
    } else {
      const { min, max } = filters.customLimit;
      cards = cards.filter((card) => {
        const customLimit = card.customLimit ?? Infinity;
        if (min !== undefined && customLimit < min) return false;
        if (max !== undefined && customLimit > max) return false;
        return true;
      });
    }
  }

  // Filter by subtype
  if (filters.subtype) {
    const subtypes = Array.isArray(filters.subtype)
      ? filters.subtype
      : [filters.subtype];
    cards = cards.filter((card) => {
      if ('subtype' in card && card.subtype) {
        return subtypes.includes(card.subtype as MagicSubtype);
      }
      return false;
    });
  }

  // Filter by favorText (partial match, case-insensitive)
  if (filters.favorText) {
    const lowerFavorText = filters.favorText.toLowerCase();
    cards = cards.filter((card) => {
      if ('favorText' in card && card.favorText) {
        return card.favorText.toLowerCase().includes(lowerFavorText);
      }
      return false;
    });
  }

  // Global search across multiple fields
  if (filters.search) {
    const lowerSearch = filters.search.toLowerCase();
    cards = cards.filter((card) => {
      const inName = card.name.toLowerCase().includes(lowerSearch);
      const inEx = card.ex && card.ex.toLowerCase().includes(lowerSearch);
      const inEffect =
        'mainEffect' in card &&
        card.mainEffect &&
        card.mainEffect.toLowerCase().includes(lowerSearch);
      const inPrint = card.print.toLowerCase().includes(lowerSearch);
      const inFavorText =
        'favorText' in card &&
        card.favorText &&
        card.favorText.toLowerCase().includes(lowerSearch);
      return inName || inEx || inEffect || inPrint || inFavorText;
    });
  }

  return cards;
}

/**
 * Get a specific card by print code
 * @param printCode - Print code (e.g., 'BT01-001')
 * @returns Card with matching print code, or undefined if not found
 */
export function getCardByPrint(printCode: string): Card | undefined {
  return getAllCards().find((card) => card.print === printCode);
}

/**
 * Get unique cards (deduplicated by name/print, keeping one variant)
 * @returns Array of unique cards
 */
export function getUniqueCards(): Card[] {
  const seen = new Set<string>();
  const unique: Card[] = [];

  for (const card of getAllCards()) {
    const key = `${card.name}-${card.print}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(card);
    }
  }

  return unique;
}

/**
 * Get available set codes
 * @returns Array of available set codes
 */
export function getAvailableSetCodes(): string[] {
  return Object.keys(SET_MAP);
}

