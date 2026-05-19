# Card Database Reference

## Card Properties

All cards share these base properties:
- `name`: Card name (Thai)
- `type`: Card type (Avatar, Magic, Life, Construct)
- `print`: Print code (e.g., 'BT01-001')
- `rare`: Rarity (SR, UR, PR, etc.)
- `soi`: Set of interest / Sequence number
- `dropRate`: The drop rate of the card (e.g., '1/24')
- `customLimit`: Deck construction limit for this specific card
- `ex`: Extension/Extra field (e.g., 'Only #1')

### Avatar & Construct Cards
- `color`: Primary color
- `symbol`: Card symbol (tribe/category)
- `cost`: Play cost
- `gem`: Gem count
- `gemColor`: Color of the gem
- `power`: Combat power
- `mainEffect`: Card text/abilities

### Magic Cards
- `symbol`: Card symbol
- `cost`: Play cost
- `subtype`: Modification, React, Normal, or Land
- `mainEffect`: Card effect

### Life Cards
- `favorText`: Flavor text (often contains lore or special triggers)
- `mainEffect`: Burst effect when flipped

## Filter Options

The `filterCards` function supports the following options:

| Option | Type | Description |
| :--- | :--- | :--- |
| `type` | `CardType \| CardType[]` | Filter by card type |
| `color` | `Color \| Color[]` | Filter by primary color |
| `rarity` | `Rarity \| Rarity[]` | Filter by rarity (e.g., UR, SR) |
| `symbol` | `Symbol \| Symbol[]` | Filter by card symbol (tribe) |
| `cost` | `number \| { min?, max? }` | Filter by play cost |
| `gem` | `number \| { min?, max? }` | Filter by gem count |
| `gemColor` | `Color \| Color[]` | Filter by gem color |
| `power` | `number \| { min?, max? }` | Filter by combat power |
| `setCode` | `string \| string[]` | Filter by set prefix (e.g., 'BT01') |
| `name` | `string` | Partial match on card name |
| `ex` | `string` | Partial match on extension text |
| `mainEffect` | `string` | Partial match on main effect text |
| `dropRate` | `string` | Partial match on drop rate |
| `soi` | `number \| { min?, max? }` | Filter by sequence number (soi) |
| `customLimit` | `number \| { min?, max? }` | Filter by deck limit |
| `subtype` | `MagicSubtype \| MagicSubtype[]` | Filter by magic subtype |
| `favorText` | `string` | Partial match on flavor text |
| `search` | `string` | Global search across name, ex, effect, print, and favorText |

## Enums

### Color
- `Red`: 'แดง'
- `Blue`: 'ฟ้า'
- `Green`: 'เขียว'
- `Purple`: 'ม่วง'
- `Black`: 'ดำ'
- `None`: 'ไม่มีสี'

### CardType
- `Avatar`, `Magic`, `Life`, `Construct`

### MagicSubtype
- `Modification`, `React`, `Normal`, `Land`

### Rarity
- `SR`, `UR`, `PR`, `CBR`, `C`, `SCR`, `R`, `USEC`

### Symbols (Tribes)
- `God`: 'เทพ'
- `Giant`: 'ยักษ์'
- `Mage`: 'จอมเวทย์'
- `Human`: 'คน'
- `Insect`: 'แมลง'
- `Animal`: 'สัตว์'
- `Hell`: 'นรก'
- `Ghost`: 'ผี'
- `Robot`: 'หุ่นยนต์'
- `Fish`: 'ปลา'
- `Building`: 'สิ่งก่อสร้าง'
- `Tree`: 'ต้นไม้'
- `Pret`: 'เปรต'
- `Alien`: 'เอเลี่ยน'
- `Hermit`: 'ฤษี'
- `Lizard`: 'กะปอม'
- `Soldier`: 'ทหาร'
- `Cyber`: 'ไซเบอร์'
- ...and others.
