import { createCards } from "@/src/utils/cardHelpers";
import { Card, CardType, Rarity, Symbol, MagicSubtype, Color } from "@/src/types/cards";

export const CARDS_KD00: Card[] = createCards([
  {
    name: "อะไรวะ !",
    type: CardType.Magic,
    subtype: MagicSubtype.React,
    soi: 0,
    print: "KD00-00A",
    rare: Rarity.C,
    mainEffect: "เมื่อ Avatar ฝ่ายเราออกจาก Avatar Zone : ผู้เล่นทุกคนทำทุกอย่างตามลำดับดังนี้\n1) นำการ์ดบนมือทั้งหมดเข้า Deck แล้วสับ\n2) จั่วการ์ดคนละ 4 ใบ\n3) แสดงการ์ด Avatar ที่อยู่บนมือ ผู้เล่นคนไหนมีจำนวนน้อยสุดทำความเสียหายใส่ LIFE Card ตนเอง 2 ครั้ง",
    gem: 2,
    symbol: Symbol.Mage,
  },
  {
    name: "เบียดเบียนผู้อื่น",
    type: CardType.Magic,
    subtype: MagicSubtype.Normal,
    soi: 0,
    print: "KD00-00B",
    rare: Rarity.C,
    mainEffect: "ผู้เล่นทุกคนเลือก สุ่มหยิบการ์ดจากบนมือของผู้เล่น ทางซ้าย 1 ใบ จากนั้น นำการ์ดที่หยิบได้มาแสดงพร้อมกัน\nผู้เล่นที่แสดงการ์ดที่มี Cost น้อยที่สุด 1 คน ต้องเลือก เนรเทศการ์ดบนมือ ตนเอง 1 ใบ\nผู้เล่นที่มีแสดงการ์ดที่มี Cost เยอะที่สุด 1 คน เลือกการ์ด จากในโซน เนรเทศ กลับเข้าใต้ Deck\nผู้เล่นที่ได้ผล Cost เท่ากัน ทิ้งการ์ดที่หยิบมาทั้งคู่ลงนรก\nผู้เล่นที่ไม่สามารถแสดง การ์ดที่มี Cost ได้ ทิ้งการ์ดจากบนมือ เพิ่ม 2 ใบ\nจากนั้นคืนการ์ดใบที่หยิบมาให้เจ้าของเดิม",
    gem: 1,
    symbol: Symbol.Hell,
  },
  {
    name: "โอน้อยออกแห่งโชคชะตา",
    type: CardType.Magic,
    subtype: MagicSubtype.Normal,
    soi: 0,
    print: "KD00-00C",
    rare: Rarity.C,
    mainEffect: "ผู้เล่นทุกคนทำการโอน้อยออก จนกว่าจะเหลือผู้เล่นเพียง 2 คน จากนั้นให้ ผู้เล่นทั้ง 2 คนทำการเป่ายิงฉุบ ผู้ที่แพ้จะต้องหงาย LIFE Card ใบบนสุด 1 ใบ หากอยู่ในสถานะ สาหัส แล้ว จะถือว่าแพ้เกมทันที",
    gem: 1,
    symbol: Symbol.Mage,
  },
  {
    name: "ขอมือเธอหน่อย~",
    type: CardType.Magic,
    subtype: MagicSubtype.Normal,
    soi: 0,
    print: "KD00-00D",
    rare: Rarity.C,
    mainEffect: "ผู้เล่นที่มีการ์ดบนมือมีเยอะที่สุดทิ้งการ์ดบนมือ 2 ใบ : ผู้เล่นทุกคนจั่วการ์ดให้เท่ากับผู้เล่นที่มีการ์ดบนมือเยอะที่สุด",
    gem: 2,
    symbol: Symbol.Mage,
  },
]);
