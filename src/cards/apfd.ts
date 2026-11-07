import { createCards } from "@/src/utils/cardHelpers";
import { Card, CardType, Rarity, Symbol, MagicSubtype, Color } from "@/src/types/cards";

export const CARDS_APFD: Card[] = createCards([
  {
    name: "ความเจริญ",
    type: CardType.Magic,
    subtype: MagicSubtype.Normal,
    soi: 1,
    print: "APFD-001",
    rare: Rarity.SR,
    mainEffect: "จั่วการ์ดจาก Deck เรา 2 ใบ",
    gem: 1,
    symbol: Symbol.Mage,
  },
  {
    name: "ชายจากอนาคต",
    type: CardType.Magic,
    subtype: MagicSubtype.Normal,
    soi: 1,
    print: "APFD-002",
    rare: Rarity.SR,
    mainEffect: "เมื่อมีการใช้ Magic Card : ยกเลิกการใช้ Magic Card ใบนั้น",
    gem: 0,
    symbol: Symbol.Mage,
    dropRate: "1 / กล่อง",
  },
]);
