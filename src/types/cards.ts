import { Color, CardType, MagicSubtype, Rarity, Symbol } from './base';

export * from './base';

export interface DeckEntry {
  card: Card;
  quantity: number;
}

/**
 * Base properties for all cards.
 * Allowing string literals for backward compatibility during migration.
 */
export interface BaseCard {
  name: string;
  type: CardType | string;
  print: string;
  rare: Rarity | string;
  dropRate?: string;
  soi: number;
  customLimit?: number;
  ex?: string;
}

/**
 * Cards that can be played (Avatar, Magic, Construct)
 * These share symbols, costs, and effects.
 */
export interface PlayableCard extends BaseCard {
  symbol: Symbol | string;
  cost?: number;
  mainEffect?: string;
}

/**
 * Cards that participate in combat (Avatar, Construct)
 * These have colors, gems, and power.
 */
export interface CombatCard extends PlayableCard {
  color?: Color | string;
  gem?: number;
  gemColor?: Color | string;
  power?: number;
}

export interface AvatarCard extends CombatCard {
  type: CardType.Avatar | 'Avatar';
}

export interface MagicCard extends PlayableCard {
  type: CardType.Magic | 'Magic';
  subtype: MagicSubtype | string;
}

export interface LifeCard extends BaseCard {
  type: CardType.Life | 'Life';
  favorText: string;
  mainEffect?: string;
}

export interface ConstructCard extends CombatCard {
  type: CardType.Construct | 'Construct';
}

export type Card = AvatarCard | MagicCard | LifeCard | ConstructCard;
