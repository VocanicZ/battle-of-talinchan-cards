import {
  Color,
  CardType,
  MagicSubtype,
  Rarity,
  Symbol,
} from './base';

export const cardTypes: CardType[] = Object.values(CardType);
export const magicSubtypes: MagicSubtype[] = Object.values(MagicSubtype);
export const rarities: Rarity[] = Object.values(Rarity);
export const colors: Color[] = Object.values(Color);
export const gems: number[] = [0, 1, 2, 3, 4];
export const keywords: string[] = [
  'จุติ',
  'คำสั่งเสีย',
  'เซ่นไหว้',
  'สอดแนม',
  'ธรณีสูบ',
  'เลือกปฏิบัติ',
  'สามัคคี',
  'โล่มนุษย์',
  'เตะไข่',
  'เทิร์นละครั้ง',
  'ต่อเนื่อง',
  'สั่งใช้',
  'อัตโนมัติ',
  'พอดี',
  'ลูกฮึด',
  'แทงหลัง',
];

export const keywordColors: Record<
  string,
  'blue' | 'purple' | 'red' | 'green'
> = {
  จุติ: 'blue',
  คำสั่งเสีย: 'blue',
  เซ่นไหว้: 'blue',
  สอดแนม: 'purple',
  ธรณีสูบ: 'purple',
  เลือกปฏิบัติ: 'purple',
  สามัคคี: 'red',
  โล่มนุษย์: 'red',
  เตะไข่: 'red',
  เทิร์นละครั้ง: 'green',
  ต่อเนื่อง: 'green',
  สั่งใช้: 'green',
  อัตโนมัติ: 'green',
  พอดี: 'blue',
  ลูกฮึด: 'red',
  แทงหลัง: 'red',
};

export const symbols: Symbol[] = Object.values(Symbol);

export type SortOption = 'name' | 'type' | 'cost' | 'color' | 'gem' | 'keyword' | 'recommended';
export type SortDirection = 'asc' | 'desc';
