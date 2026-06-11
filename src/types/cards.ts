import { Color, CardType, MagicSubtype, Rarity, Symbol } from './base';

export * from './base';

export interface DeckEntry {
  card: Card;
  quantity: number;
}

/**
 * Declarative deck-construction constraint (Sin list "Special Conditions").
 * Enforced by the Core deck validator, not by in-game card scripts.
 */
export interface DeckRule {
  kind: 'require_all_avatars_symbol';
  symbol: Symbol | string;
  scope: Array<'main' | 'side'>;
}

/**
 * Base properties for all cards.
 * Every card must contain soi.
 */
export interface BaseCard {
  name: string;
  type: CardType | string;
  print: string;
  rare: Rarity | string;
  dropRate?: string;
  soi: number;
  customLimit?: number;
  deckRule?: DeckRule;
  ex?: string;
}

/**
 * Cards that have gems, symbols and main effects (Avatar, Magic, Construct)
 */
export interface GemCard extends BaseCard {
  gem: number;
  gemColor?: Color | string;
  symbol: Symbol | string;
  mainEffect?: string;
}

/**
 * Magic cards (extends GemCard)
 * No cost, power, or color fields.
 */
export interface MagicCard extends GemCard {
  type: CardType.Magic | 'Magic';
  subtype: MagicSubtype | string;
}

/**
 * Cards that participate in combat (Avatar, Construct)
 * These have colors, costs, and power.
 */
export interface CombatCard extends GemCard {
  color: Color | string;
  cost: number;
  power: number;
}

/**
 * Avatar cards (extends CombatCard)
 * Avatar must have a subtype.
 */
export interface AvatarCard extends CombatCard {
  type: CardType.Avatar | 'Avatar';
  subtype: string;
}

/**
 * Life cards (extends BaseCard)
 * No cost, power, color, gem, or symbol fields.
 */
export interface LifeCard extends BaseCard {
  type: CardType.Life | 'Life';
  favorText?: string;
  mainEffect?: string;
}

/**
 * Construct cards (extends CombatCard)
 */
export interface ConstructCard extends CombatCard {
  type: CardType.Construct | 'Construct';
}

export type Card = AvatarCard | MagicCard | LifeCard | ConstructCard;
