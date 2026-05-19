import { createCards } from "@/src/utils/cardHelpers";
import { Card, CardType, Rarity, Symbol, MagicSubtype, Color } from '@/src/types/cards';

export const CARDS_BT10: Card[] = createCards([
  {
    name: 'ชิโยเมะ นินจาสาว',
    type: CardType.Avatar,
    soi: 3,
    print: 'BT10-006',
    rare: Rarity.R,
    mainEffect:
      'สั่งใช้ จากบนมือ ใน Main Phase ผู้เล่นใดก็ได้ : เลือก Avatar "นินจา" 1 ใบ ที่ไม่ได้ชื่อ ชิโยเมะ นินจาสาว บน Avatar Zone เรา นำกลับขึ้นมือ และ อัญเชิญ การ์ดใบนี้ลงบน Avatar Zone ฝ่ายเรา สามารถอัญเชิญ ชิโยเมะ นินจาสาว ด้วยวิธีนี้ ได้เพียง 1 ครั้งต่อ 1 เทิร์น เท่านั้น\nอัตโนมัติ เมื่อ Avatar ใบนี้ถูกอัญเชิญด้วยความสามารถตัวเอง : เลือก Avatar บน Avatar Zone ฝ่ายตรงข้าม 1 ใบ POWER -3 จนจบเทิร์นนั้น',
    cost: 2,
    gem: 3,
    power: 2,
    symbol: Symbol.Foreigner,
    color: Color.Red,
  },
  {
    name: "สิ่งปฏิกูลมีชีวิต",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-017",
    rare: Rarity.C,
    mainEffect:
      `คำสั่งเสีย : สอดแนม 3 ใบ เลือก Avatar "สิ่งปฏิกูล" 1 ใบ จากที่ สอดแนม นำขึ้นมือ การ์ดที่เหลือ ส่งลง นรก ถ้าความสามารถนี้ทำงานในเทิร์นของเรา อัญเชิญ Avatar ที่เลือกลงบน Avatar Zone เราแทน`,
    cost: 1,
    gem: 1,
    power: 1,
    symbol: Symbol.WonderAnimal,
    color: Color.Blue,
  },
  {
    name: "สิ่งปฏิกูลสีเงิน",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-018",
    rare: Rarity.C,
    mainEffect:
      `คำสั่งเสีย : เลือก Avatar 1 ใบ บน Avatar Zone ฝ่ายตรงข้าม Avatar ใบที่เลือก POWER -1 ถ้าความสามารถนี้ทำงานในเทิร์นของเรา Avatar ใบที่เลือก POWER -3 แทน`,
    cost: 1,
    gem: 1,
    power: 1,
    symbol: Symbol.WonderAnimal,
    color: Color.Blue,
  },
  {
    name: "ราชาสิ่งปฏิกูล",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-019",
    rare: Rarity.C,
    mainEffect:
      `พอดี จุตี : ถ้า นรกเรา มี การ์ด "สิ่งปฏิกูล" ตั้งแต่ 5 ใบขึ้นไป เลือก Avatar ของฝ่ายตรงข้าม 1 ใบ เปลี่ยน Symbol ของ Avatar ใบนั้นเป็น {symbol สัตว์มหัศจรรย์} และเปลี่ยนชื่อของ Avatar ใบนั้นเป็น "สิ่งปฏิกูล" และมี POWER 1
      อัตโนมัติ ถ้า Avatar ใบนี้ถูกอัญเชิญมาด้วยความสามารถของการ์ด "สิ่งปฏิกูล" : ทำความสามารถ พอดี จุตี
      เทิร์นละครั้ง สั่งใช้ : ทำลาย "สิ่งปฏิกูล" 1 ใบ บน Avatar Zone ผู้เล่นใดก็ได้ ถ้าทำลายสำเร็จ สุ่มทิ้งการ์ดบนมือ ผู้เล่นฝ่ายตรงข้าม 1 ใบ`,
    cost: 5,
    gem: 2,
    power: 4,
    symbol: Symbol.WonderAnimal,
    color: Color.Blue,
  },
  {
    name: 'ผู้คุมกฎแห่งภาคีมะม่วง',
    type: CardType.Avatar,
    soi: 3,
    print: 'BT10-040',
    rare: Rarity.UR,
    mainEffect:
      'จุติ : นำ Avatar "มะม่วง" ที่เป็น {symbol ต้นไม้} และไม่ใช่ {only} 1 ใบ จาก Deck มาวางไว้บน Magic Zone ฝ่ายเรา ถ้า Avatar ใบนั้นคือ ต้นมะม่วง สามารถนำ "มะม่วง" ที่เป็น {symbol ต้นไม้} อีก 1 ใบ จาก Deck หรือ นรก มาวางไว้ บน Magic Zone ฝ่ายเรา จากนั้น สับ Deck\nคำสั่งเสีย ถ้าถูกทำลายจากการ์ดฝ่ายตรงข้ามหรือการ์ด "มะม่วง" นำการ์ดใบนี้ ไปวางไว้บน Magic Zone เรา',
    cost: 5,
    gem: 1,
    power: 4,
    symbol: Symbol.Tree,
    color: Color.Green,
  },
  {
    name: 'ราชันย์ตั๊กแตนศตวรรษ',
    type: CardType.Avatar,
    soi: 3,
    print: 'BT10-044',
    rare: Rarity.SR,
    mainEffect:
      'จุติ เลือกปฏิบัติ :\n1) นำ "บัลลังก์ตั๊กแตนศตวรรษ" 1 ใบจากนรกเรา มาสวมใส่การ์ดใบนี้\n2) หงาย LIFE Card ใบบนสุด ของฝ่ายเรา 1 ใบ นำ "บัลลังก์ตั๊กแตนศตวรรษ" 1 ใบ จาก Deck ขึ้นมือ จากนั้นสับ Deck\nต่อเนื่อง เมื่อ Avatar ใบนั้น สวมใส่ "บัลลังก์ตั๊กแตนศตวรรษ" จะได้รับ\n{red "อัตโนมัติ ในช่วงเริ่ม Main Phase เราเลือก LIFE Card ที่หงายอยู่ของเรา 1 ใบ : ใช้ผลความสามารถการ์ดที่เลือก จนจบเทิร์น หากความสามารถนั้น ระบุว่า "ใน Main Phase ถัดไป" ให้ทำความสามารถในเทิร์นนี้"}',
    cost: 4,
    gem: 3,
    power: 2,
    symbol: Symbol.Insect,
    color: Color.Green,
  },
  {
    name: "ทะลวงส้วม",
    type: CardType.Magic,
    subtype: MagicSubtype.Normal,
    cost: 1,
    print: "BT10-062",
    soi: 3,
    symbol: Symbol.Mage,
    mainEffect:
      `เซ่นไหว้ Avatar "สิ่งปฏิกูล" 1 ใบ : จั่วการ์ด 3 ใบ จากนั้นทิ้งการ์ดบนมือ 1 ใบ`,
    rare: Rarity.C,
  },
  {
    name: "จอมเวทย์ เดสสึหวา",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-026",
    rare: Rarity.SR,
    mainEffect:
     `จุติ ทิ้งการ์ด "คาถา" หรือ Avatar "จอมเวทย์" 1 ใบ จากมือ : จั่วการ์ด 2 ใบ
     อัตโนมัติ เมื่อมีการใช้ผลของ Magic "คาถา" เลือก Avatar "จอมเวทย์" 1 ใบ บน Avatar Zone ฝ่ายเรา POWER +1
     [Link จอมเวทย์ โกลเด้น]
     ต่อเนื่อง ผู้เล่นฝ่ายตรงข้าม ไม่สามารถเลือกเป้าหมายโจมตีได้ นอกจากการ์ดใบนี้
     เทิร์นละครั้ง อัตโนมัติ เมื่อ Avatar ใบนี้ตกเป็นเป้าหมายการโจมตี : จั่วการ์ด 1 ใบ`,
    cost: 2,
    gem: 2,
    power: 1,
    symbol: Symbol.Foreigner,
    color: Color.Purple,
  },
  {
    name: "จอมเวทย์ โกลเด้น",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-025",
    rare: Rarity.R,
    mainEffect:
      "[Link จอมเวทย์ เดสสึหวา]\nอัตโนมัติ เมื่อเข้าสู่สถานะ [Link] : ก่อสร้าง Construct \"จอมเวทย์\" 1 ใบ จากใน Deck หรือ นรก เรา ลง Construct Zone ถ้าเลือกจาก Deck ให้สับ Deck\สั่งใช้ เมื่อ Avatar \"จอมเวทย์\" ใบอื่นบน Avatar Zone เรากำลังจะออกจากสนามด้วยการ์ดฝ่ายตรงข้าม : สามารถทำลายการ์ดใบนี้ได้",
    cost: 2,
    gem: 4,
    power: 1,
    symbol: Symbol.Human,
    color: Color.Purple,
  },
  {
    name: "นักข่าวสาว เดย์วัน",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-045",
    rare: Rarity.R,
    mainEffect:
      "เมื่อการ์ดใบนี้ถูกใช้เป็น Cost เพื่ออัญเชิญ Avatar \"ตำรวจ\" : สอดแนม Deck ฝ่ายตรงข้าม 1 ใบ และนำกลับไปไว้เดิม\nต่อเนื่อง ตราบเท่าที่ Avatar Zone ฝ่ายเรามี \"ตำรวจ\" การ์ดใบบนสุดของ Deck ฝ่ายตรงข้าม จะถูกหงายหน้า และ Avatar ใบนี้จะไม่สามารถถูกโจมตี\n#เมื่อการ์ดใบนี้ถูกใช้เป็น Cost เพื่ออัญเชิญ Avatar \"ตำรวจ\" การ์ดใบนี้จะถือว่ามี GEM 5 ไร้สี",
    cost: 1,
    gem: 1,
    power: 1,
    symbol: Symbol.Human,
    color: Color.Green,
  },
  {
    name: "พระอีสาน",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-033",
    rare: Rarity.SR,
    mainEffect:
      "สั่งใช้ จากบนมือเมื่อ Avatar \"อีสานสลิงเกอร์\" ฝ่ายเรา ต่อสู้ ทิ้งการ์ดใบนี้จากบนมือ : Avatar \"อีสานสลิงเกอร์\" ฝ่ายเรา ที่ต่อสู้ POWER +1 จนจบการต่อสู้",
    cost: 6,
    gem: 3,
    power: 1,
    symbol: Symbol.God,
    color: Color.Purple,
  },
  {
    name: "แก๊ง Super Card",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-035",
    rare: Rarity.UR,
    mainEffect:
      "ต่อเนื่อง ในช่วง Draw Phase ถ้ามีการ์ดในมือ 3 ใบหรือมากกว่า จั่วการ์ด 2 ใบ แทน การจั่ว 1 ใบ",
    cost: 8,
    gem: 2,
    power: 3,
    symbol: Symbol.Human,
    color: Color.Purple,
  },
  {
    name: "เซนเซไฮ",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-048",
    rare: Rarity.C,
    mainEffect:
      `สามัคคี
      อัตโนมัติ เมื่อ Avatar ใบนี้ใช้ความสามารถ สามัคคี : Avatar ที่ รับ สามัคคี ได้รับ 
      {red "อัตโนมัติ เมื่อ Avatar ใบนี้ทำลาย Avatar ฝ่ายตรงข้าม จากการต่อสู้ : หงาย LIFE Card ใบบนสุดของฝ่ายตรงข้าม 1 ใบ"} จนจบเทิร์น
      คำสั่งเสีย : ทิ้งการ์ด บนมือ 3 ใบ ถ้าการ์ดบนมือมีน้อยกว่า 3 ใบ ให้ทิ้งการ์ดทั้งหมดแทน หรือ หงาย LIFE Card ใบบนสุดของเรา 1 ใบ`,
    cost: 4,
    gem: 1,
    power: 1,
    symbol: Symbol.Human,
    color: Color.Green,
  },
  {
    name: "1 - 2 - 2",
    type: CardType.Magic,
    subtype: MagicSubtype.Normal,
    cost: 1,
    print: "BT10-057",
    soi: 3,
    symbol: Symbol.Mage,
    mainEffect:
      "ถ้าจะใช้การ์ดใบนี้จะต้องใช้เป็นใบแรกสุดของ Main Phase เท่านั้น\nจั่วการ์ด 3 ใบ จากนั้น ผู้ใช้ได้รับ {red \"ไม่สามารถนำการ์ดจากใน Deck ขึ้นมือด้วยความสามารถของ Avatar , Magic และ Construct และใน Draw Phase ถัดไปของเรา เราจะไม่ได้จั่วการ์ด\"} จนจบเทิร์นถัดไปของเรา",
    rare: Rarity.C,
  },
  {
    name: "ไอ้นัท - คนบ้าจั่ว",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-008",
    rare: Rarity.C,
    mainEffect:
      "เทิร์นละครั้ง อัตโนมัติ เมื่อ Avatar ใบนี้ โจมตี : จั่วการ์ด 1 ใบ",
    cost: 4,
    gem: 2,
    power: 2,
    symbol: Symbol.Human,
    color: Color.Red,
  },
  {
    name: "ผู้ขุดหาความว่างเปล่า แบงค์ Miner",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-038",
    rare: Rarity.UR,
    variants: [Rarity.SCR],
    mainEffect:
      "ต่อเนื่อง Avatar ในนี้ ได้รับความสามารถตามจำนวน Avatar \"แบงค์\" ที่ชื่อต่างกันในนรกเรา\n- 4 ชื่อ อัตโนมัติ เมื่อ Avatar ใบนี้โจมตี : เนรเทศ การ์ดใบบนสุดของ Deck ฝ่ายตรงข้าม 2 ใบ\n- 8 ชื่อ ต่อเนื่อง Avatar ใบนี้ไม่รับผลของ Magic Card",
    cost: 5,
    gem: 2,
    power: 4,
    symbol: Symbol.Hell,
    color: Color.Purple,
  },
  {
    name: "มาโกะ มารดาแห่งภาคีมะม่วง",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-039",
    rare: Rarity.SR,
    cost: 10,
    gem: 2,
    power: 6,
    symbol: Symbol.Tree,
    color: Color.Green,
    ex: "Only #1",
    mainEffect:
    `สั่งใช้ จากบน Magic Zone : ส่ง Avatar "มะม่วง" ที้เป็น {symbol ต้นไม้} ใบอื่น 5 ใบ บน Magic Zone เรา ลงนรก อัญเชิญ จุติ การ์ดใบนี้
    จุติ : นำ Avatar "มะม่วง" ที้ป็น {symbol ต้นไม้} กี่ใบก็ได้ จากนรกเรา ที่ชื่อไม่ซ้ำกัน จากนรกเรา มาวางไว้บน Magic Zone เรา
    ต่อเนื่อง POWER +1 ตามจำนวน ต้นมะม่วง บน Magic Zone เรา
    เทิร์นละครั้ง สั่งใช้ : อัญเชิญ จุติ Avatar "มะม่วง" 1 ใบ จาก Magic Zone เรา ลงบน Avatar Zone ฝ่ายเรา`
  },
  {
    name: "นักรบทองแห่งภาคีมะม่วง",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-041",
    rare: Rarity.R,
    cost: 3,
    gem: 2,
    power: 3,
    symbol: Symbol.Tree,
    color: Color.Green,
    mainEffect:
    `โล่มนุษย์
    อัตโนมัติ ในช่วง End Phase ถ้าบน Magic Zone เรามี ต้นมะม่วง : เปลี่ยน Avatar ใบนี้เป็นสภาพตื่น และ/หรือ POWER +2 จนถึง Draw Phase ต่อไปของเรา
    คำสั่งเสีย : ถ้าถูกทำลายจาก Avatar Zone โดยการ์ดฝ่ายตรงข้าม หรือการ์ด "มะม่วง" นำการ์ดใบนี้ไปวางไว้บน Magic Zone เรา`
  },
  {

    name: "ผู้พิทักษ์แห่งภาคีมะม่วง",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-042",
    rare: Rarity.C,
    cost: 1,
    gem: 3,
    power: 1,
    symbol: Symbol.Tree,
    color: Color.Green,
    mainEffect:
    `ต่อเนื่อง ตราบเท่าที่การ์ดใบนี้อยู่บน Magic Zone Avatar ต้นมะม่วง ทุกใบบน Magic Zone เราจะไม่ถูกทำลายจากความสามารถการ์ดฝ่ายตรงข้าม
    คำสั่งเสีย : ถ้าถูกทำลายจาก Avatar Zone โดยการ์ดฝ่ายตรงข้ามหรือการ์ด "มะม่วง" นำการ์ดใบนี้ไปวางไว้บน Magic Zone เรา`
  },
  {
    name: "ไปคุยกับรากมะม่วง",
    type: CardType.Magic,
    soi: 3,
    print: "BT10-063",
    cost: 2,
    subtype: MagicSubtype.React,
    symbol: Symbol.Mage,
    rare: Rarity.C,
    mainEffect: `ทำลาย Avatar "มะม่วง" ที่เป็น {symbol ต้นไม้} 1 ใบ Avatar Zone เรา : ทำลาย การ์ด 1 ใบบน สนาม ฝ่ายตรงข้าม`
  },
  {
    name: "ตำรวจเอไอ มุเค",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-007",
    rare: Rarity.R,
    mainEffect:
      `เทิร์นละครั้ง สั่งใช้ : ประกาศประเภทของการ์ดใบบนสุดของ Deck ฝ่ายตรงข้าม จากนั้น สอดแนม Deck ฝ่ายตรงข้าม 1 ใบ
- ถ้าการ์ดใบนั้นเป็นประเภทที่เราประกาศไว้ข้างต้นเลือก Avatar ของฝ่ายตรงข้าม 1 ใบ POWER -2 จนจบเทิร์น และส่งการ์ดที่ สอดแนม ลงนรก
- ถ้าการ์ดที่ สอดแนม ไม่ใช่ประเภทการ์ดที่ประกาศนำการ์ดที่ สอดแนม ไว้ที่เดิมแลพ Avatar ใบนี้ POWER -2 จนจบเทิร์น`,
    cost: 3,
    gem: 3,
    power: 2,
    symbol: Symbol.Robot,
    color: Color.Red,
  },
  {
    name: "ตำรวจพ่อลูกอ่อน คามุ",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-046",
    rare: Rarity.C,
    mainEffect:
      `เทิร์นละครั้ง อัตโนมัติ เมื่อจบการต่อสู้ที่ Avatar ใบนี้โจมตี : ประกาศประเภทของการ์ดใบบนสุดของ Deck ฝ่ายตรงข้าม จากนั้น สอดแนม Deck ฝ่ายตรงข้าม 1 ใบ
- ถ้าการ์ดใบนั้นเป็นประเภทที่เราประกาศไว้ข้างต้น เปลี่ยน Avatar ใบนี้เป็นสภาพตื่น และส่งการ์ดที่ สอดแนม ลงนรก
- ถ้าการ์ด สอดแนม ไม่ใช่ประเภทที่ประกาศนำการ์ดที่ สอดแนม ไว้ที่เดิม`,
    cost: 4,
    gem: 1,
    power: 3,
    symbol: Symbol.Human,
    color: Color.Green,
  },
  {
    name: "ตำรวจสัมภเวสี ทาย",
    type: CardType.Avatar,
    soi: 3,
    print: "BT10-034",
    rare: Rarity.C,
    mainEffect:
      `จุติ : แสดงการ์ด "ตำรวจ" 1 ใบบนมือเรา และ สอดแนม Deck ฝ่ายตรงข้าม 2 ใบ ทิ้งการ์ดจากที่ สอดแนม 1 ใบ ลงนรก อีกใบนำไปวางไว้บนสุดของ Deck`,
    cost: 4,
    gem: 2,
    power: 2,
    symbol: Symbol.Ghost,
    color: Color.Purple,
  }
]);
