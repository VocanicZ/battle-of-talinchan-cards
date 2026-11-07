import { createCards } from "@/src/utils/cardHelpers";
import { Card, CardType, Rarity, Symbol, MagicSubtype, Color } from "@/src/types/cards";

export const CARDS_STOR: Card[] = createCards([
  {
    name: "วีรบุรุษปากซอย",
    type: CardType.Avatar,
    soi: 1,
    print: "STOR-001",
    rare: Rarity.SR,
    mainEffect: "จุติ (เมื่อ Avatar ตัวนี้ถูกอัญเชิญลงสนามแบบจ่าย Cost) : นำ Avatar ชื่อ \"กุ่ย\",\"ฮอล\" หรือ \"นาย\" ได้สูงสุด 3 ใบจากนรกเราขึ้นมือ",
    cost: 6,
    gem: 2,
    gemColor: Color.None,
    power: 6,
    symbol: Symbol.Human,
    color: Color.Blue,
    ex: "Only #1",
    dropRate: "1 / กล่อง",
  },
]);
