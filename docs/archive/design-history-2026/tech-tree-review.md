# Current Tech Tree Review

Generated from `packages/server/data/tech-tree.json` on 2026-03-21.

Total techs: 50

## Tier 1

### Agriculture (`agriculture`)
- Cost: 2000 GOLD · 40 FOOD
- Time: 30 min
- Requirements: None
- Description: Turns dirt into policy and policy into bread.
- Benefits: FARM output +15%
- Unlocks Next: Irrigation (T2), Pottery (T2)

### Fishing (`fishing`)
- Cost: 2000 GOLD · 30 FOOD
- Time: 30 min
- Requirements: None
- Description: A net, a tide, and suddenly dinner has a schedule.
- Benefits: FISH output +15%
- Unlocks Next: Cartography (T1), Animal Husbandry (T2)

### Toolmaking (`toolmaking`)
- Cost: 2000 GOLD · 40 SUPPLY
- Time: 35 min
- Requirements: None
- Description: Civilization begins the moment someone sharpens the boring stick.
- Benefits: Settlement speed +10%
- Unlocks Next: Leatherworking (T1), Masonry (T1), Mining (T1), Bronze Working (T2), Road Building (T2)

### Tribal Warfare (`tribal-warfare`)
- Cost: 2500 GOLD · 25 IRON
- Time: 35 min
- Requirements: None
- Description: Arguments, but with drums and better posture.
- Benefits: Attack +5%
- Unlocks Next: Bronze Working (T2), Mercenary Contracts (T3)

### Trade (`trade`)
- Cost: 2500 GOLD · 25 CRYSTAL
- Time: 35 min
- Requirements: None
- Description: Why raid it when you can invoice it?
- Benefits: Town gold output +10%
- Unlocks Next: Ledger Keeping (T2), Mercenary Contracts (T3)

### Masonry (`masonry`)
- Cost: 2500 GOLD · 35 IRON
- Time: 40 min
- Requirements: toolmaking
- Description: Because 'please do not invade' works better in stone.
- Benefits: Unlocks Forts | Fort defense +10%
- Unlocks Next: Fortified Walls (T2), Iron Working (T3), Heavy Masonry (T4)

### Leatherworking (`leatherworking`)
- Cost: 2500 GOLD · 35 SUPPLY
- Time: 40 min
- Requirements: toolmaking
- Description: Turns hides into straps, and straps into military confidence.
- Benefits: Unlocks Siege Outposts | Outpost attack +10%
- Unlocks Next: Siegecraft (T3), Chainmail (T4)

### Mining (`mining`)
- Cost: 2500 GOLD · 25 IRON
- Time: 40 min
- Requirements: toolmaking
- Description: Sooner or later, empire becomes a hole in the ground with a payroll.
- Benefits: Passive unlock / no explicit numeric effect
- Unlocks Next: No downstream techs

### Cartography (`cartography`)
- Cost: 2500 GOLD · 25 CRYSTAL
- Time: 40 min
- Requirements: fishing
- Description: A map is just ambition with cleaner lines.
- Benefits: Vision radius +1 | Unlocks Observatory
- Unlocks Next: Road Building (T2), Signal Fires (T2), Surveying (T3)

## Tier 2

### Irrigation (`irrigation`)
- Cost: 5000 GOLD · 90 FOOD
- Time: 60 min
- Requirements: agriculture
- Description: Convincing water to report for work on time.
- Benefits: Town food upkeep -10%
- Unlocks Next: Crop Rotation (T3), Granaries (T3)

### Pottery (`pottery`)
- Cost: 4500 GOLD · 70 FOOD
- Time: 50 min
- Requirements: agriculture
- Description: The ancient art of storing things instead of losing them.
- Benefits: Town gold cap +25%
- Unlocks Next: Granaries (T3)

### Animal Husbandry (`animal-husbandry`)
- Cost: 4500 GOLD · 60 FOOD
- Time: 50 min
- Requirements: fishing
- Description: A bold experiment in outsourcing labor to creatures with opinions.
- Benefits: Settled food upkeep -10%
- Unlocks Next: Crop Rotation (T3)

### Bronze Working (`bronze-working`)
- Cost: 6000 GOLD · 90 IRON
- Time: 75 min
- Requirements: tribal-warfare, toolmaking
- Description: When sharper metal starts winning philosophical debates.
- Benefits: Attack +10%
- Unlocks Next: Iron Working (T3), Siegecraft (T3)

### Fortified Walls (`fortified-walls`)
- Cost: 6000 GOLD · 90 IRON
- Time: 75 min
- Requirements: masonry
- Description: A polite reminder that entry is now a managed privilege.
- Benefits: Fort defense +15%
- Unlocks Next: Fortification Doctrine (T3)

### Road Building (`road-building`)
- Cost: 6000 GOLD · 90 SUPPLY
- Time: 70 min
- Requirements: toolmaking, cartography
- Description: Mud loses most debates once roads arrive.
- Benefits: Settlement speed +15%
- Unlocks Next: Fortification Doctrine (T3), Merchant Guilds (T3), Surveying (T3), Navigation (T4), Relay Roads (T4)

### Ledger Keeping (`ledger-keeping`)
- Cost: 5500 GOLD · 70 CRYSTAL
- Time: 60 min
- Requirements: trade
- Description: Gold behaves much better once someone starts counting it.
- Benefits: Town gold cap +25%
- Unlocks Next: Merchant Guilds (T3), Coinage (T4)

### Signal Fires (`signal-fires`)
- Cost: 5500 GOLD · 60 CRYSTAL
- Time: 55 min
- Requirements: cartography
- Description: Smoke, but make it strategic.
- Benefits: Vision radius +1 | Unlocks Reveal Empire
- Unlocks Next: Beacon Towers (T4), Navigation (T4), Cryptography (T5)

## Tier 3

### Granaries (`granaries`)
- Cost: 9000 GOLD · 140 FOOD
- Time: 120 min
- Requirements: irrigation, pottery
- Description: Because winter always arrives with excellent timing and poor manners.
- Benefits: Town food upkeep -6% | Town gold cap +20%
- Unlocks Next: Watermills (T4)

### Crop Rotation (`crop-rotation`)
- Cost: 9500 GOLD · 150 FOOD
- Time: 130 min
- Requirements: irrigation, animal-husbandry
- Description: Even fields perform better when they are not doing the same thing forever.
- Benefits: FARM output +4%
- Unlocks Next: Civil Survey (T4)

### Mercenary Contracts (`mercenary-contracts`)
- Cost: 9500 GOLD · 110 CRYSTAL · 50 IRON
- Time: 125 min
- Requirements: trade, tribal-warfare
- Description: Loyalty is expensive, but so is losing.
- Benefits: Attack +5%
- Unlocks Next: Standing Army (T4)

### Iron Working (`iron-working`)
- Cost: 10000 GOLD · 160 IRON
- Time: 135 min
- Requirements: bronze-working, masonry
- Description: The moment metal stops being useful and starts being persuasive.
- Benefits: Attack vs settled +15% | Attack vs forts +15%
- Unlocks Next: Chainmail (T4), Standing Army (T4)

### Fortification Doctrine (`fortification-doctrine`)
- Cost: 9500 GOLD · 130 IRON · 80 SUPPLY
- Time: 125 min
- Requirements: fortified-walls, road-building
- Description: A full philosophy built around not dying on your own land.
- Benefits: Settled defense +10% | Fort defense +10%
- Unlocks Next: Heavy Masonry (T4)

### Siegecraft (`siegecraft`)
- Cost: 10000 GOLD · 120 SUPPLY · 80 IRON
- Time: 135 min
- Requirements: leatherworking, bronze-working
- Description: For when knocking politely has clearly failed.
- Benefits: Outpost attack +20%
- Unlocks Next: Logistics (T5)

### Merchant Guilds (`merchant-guilds`)
- Cost: 9500 GOLD · 120 CRYSTAL · 80 SUPPLY
- Time: 120 min
- Requirements: ledger-keeping, road-building
- Description: At last, the traders unionize and the treasury smiles.
- Benefits: Town gold output +15%
- Unlocks Next: Coinage (T4), Relay Roads (T4), Banking (T5)

### Surveying (`surveying`)
- Cost: 9000 GOLD · 100 CRYSTAL · 90 SUPPLY
- Time: 110 min
- Requirements: cartography, road-building
- Description: Nothing says empire like measuring land you do not fully own yet.
- Benefits: Vision radius +1
- Unlocks Next: Beacon Towers (T4), Civil Survey (T4)

## Tier 4

### Watermills (`watermills`)
- Cost: 14000 GOLD · 220 FOOD
- Time: 210 min
- Requirements: granaries
- Description: The river finally joins the payroll.
- Benefits: Fed town gold output +15%
- Unlocks Next: State Granaries (T5), Urban Markets (T6)

### Civil Survey (`civil-survey`)
- Cost: 14000 GOLD · 200 FOOD · 120 CRYSTAL
- Time: 200 min
- Requirements: crop-rotation, surveying
- Description: Now expansion arrives with paperwork and suspicious accuracy.
- Benefits: Settled food upkeep -10% | Settlement speed +10%
- Unlocks Next: Civil Service (T5), State Granaries (T5)

### Standing Army (`standing-army`)
- Cost: 15000 GOLD · 220 IRON
- Time: 225 min
- Requirements: iron-working, mercenary-contracts
- Description: A permanent answer to temporary neighbors.
- Benefits: Attack +12% | Defense +8%
- Unlocks Next: Steelworking (T5)

### Heavy Masonry (`heavy-masonry`)
- Cost: 14500 GOLD · 230 IRON
- Time: 215 min
- Requirements: fortification-doctrine, masonry
- Description: When your walls begin to take their job personally.
- Benefits: Fort iron upkeep -20% | Fort defense +10%
- Unlocks Next: Engineering (T5)

### Relay Roads (`relay-roads`)
- Cost: 14500 GOLD · 210 SUPPLY
- Time: 205 min
- Requirements: road-building, merchant-guilds
- Description: The empire starts moving like it has somewhere to be.
- Benefits: Settlement speed +20% | Town gold cap +10%
- Unlocks Next: Engineering (T5), Logistics (T5)

### Navigation (`navigation`)
- Cost: 14500 GOLD · 180 CRYSTAL · 180 SUPPLY
- Time: 205 min
- Requirements: road-building, signal-fires
- Description: At last, the sea becomes a route instead of a rude suggestion.
- Benefits: Unlocks Naval Infiltration
- Unlocks Next: No downstream techs

### Beacon Towers (`beacon-towers`)
- Cost: 14000 GOLD · 180 CRYSTAL
- Time: 200 min
- Requirements: signal-fires, surveying
- Description: At last, a skyline that warns people properly.
- Benefits: Vision radius +1
- Unlocks Next: Cryptography (T5), Grand Cartography (T6)

### Coinage (`coinage`)
- Cost: 15000 GOLD · 180 CRYSTAL · 100 FOOD
- Time: 220 min
- Requirements: ledger-keeping, merchant-guilds
- Description: Standardized money: fewer arguments, better greed.
- Benefits: Town gold output +15% | Harvest cap +10%
- Unlocks Next: Banking (T5), Civil Service (T5)

### Chainmail (`chainmail`)
- Cost: 15000 GOLD · 180 IRON · 120 SUPPLY
- Time: 220 min
- Requirements: iron-working, leatherworking
- Description: Thousands of tiny rings agreeing to keep organs inside.
- Benefits: Settled defense +10%
- Unlocks Next: Steelworking (T5)

## Tier 5

### Engineering (`engineering`)
- Cost: 24000 GOLD · 360 IRON · 220 SUPPLY
- Time: 360 min
- Requirements: heavy-masonry, relay-roads
- Description: At this point, the empire runs on levers, pulleys, and audacity.
- Benefits: Fort iron upkeep -20% | Settlement speed +10%
- Unlocks Next: Steel (T6), Supply Trains (T6)

### Banking (`banking`)
- Cost: 24000 GOLD · 320 CRYSTAL · 180 FOOD
- Time: 330 min
- Requirements: coinage, merchant-guilds
- Description: Money now has a house, rules, and very firm opinions.
- Benefits: Town gold output +25%
- Unlocks Next: Bureaucracy (T6), Central Banking (T6)

### State Granaries (`state-granaries`)
- Cost: 22000 GOLD · 380 FOOD
- Time: 330 min
- Requirements: watermills, civil-survey
- Description: Hunger meets bureaucracy and somehow loses.
- Benefits: Town food upkeep -6%
- Unlocks Next: Frontier Administration (T6)

### Steelworking (`steelworking`)
- Cost: 25000 GOLD · 400 IRON
- Time: 375 min
- Requirements: standing-army, chainmail
- Description: Bronze was a phase. This is commitment.
- Benefits: Attack +18%
- Unlocks Next: Arms Guilds (T5), Steel (T6)

### Logistics (`logistics`)
- Cost: 24000 GOLD · 360 SUPPLY
- Time: 345 min
- Requirements: relay-roads, siegecraft
- Description: The glamorous science of making sure the army arrives with lunch.
- Benefits: Outpost supply upkeep -25% | Settlement speed +10%
- Unlocks Next: Arms Guilds (T5), Supply Trains (T6)

### Cryptography (`cryptography`)
- Cost: 22000 GOLD · 260 CRYSTAL
- Time: 315 min
- Requirements: beacon-towers, signal-fires
- Description: Secrets, but organized enough to invoice.
- Benefits: Unlocks Sabotage
- Unlocks Next: Grand Cartography (T6)

### Civil Service (`civil-service`)
- Cost: 23000 GOLD · 240 FOOD · 140 CRYSTAL
- Time: 330 min
- Requirements: coinage, civil-survey
- Description: The empire discovers forms, stamps, and sustainable annoyance.
- Benefits: Settled gold upkeep -20%
- Unlocks Next: Bureaucracy (T6), Central Banking (T6)

### Arms Guilds (`arms-guilds`)
- Cost: 24000 GOLD · 250 IRON · 200 SUPPLY
- Time: 345 min
- Requirements: steelworking, logistics
- Description: Mass production, now with sharper consequences.
- Benefits: Outpost attack +15%
- Unlocks Next: Military Academies (T6)

## Tier 6

### Bureaucracy (`bureaucracy`)
- Cost: 38000 GOLD · 520 FOOD · 220 CRYSTAL
- Time: 600 min
- Requirements: civil-service, banking
- Description: The empire achieves its final form: forms.
- Benefits: Settled gold upkeep -25% | Town gold cap +10%
- Unlocks Next: Frontier Administration (T6)

### Steel (`steel`)
- Cost: 40000 GOLD · 650 IRON
- Time: 630 min
- Requirements: steelworking, engineering
- Description: Harder, louder, and increasingly difficult to argue with.
- Benefits: Attack +20% | Attack vs forts +10%
- Unlocks Next: Military Academies (T6)

### Supply Trains (`supply-trains`)
- Cost: 38000 GOLD · 520 SUPPLY
- Time: 570 min
- Requirements: logistics, engineering
- Description: War, now with timetables.
- Benefits: Outpost gold upkeep -25% | Outpost supply upkeep -15%
- Unlocks Next: No downstream techs

### Central Banking (`central-banking`)
- Cost: 36000 GOLD · 480 CRYSTAL · 250 FOOD
- Time: 540 min
- Requirements: banking, civil-service
- Description: When the treasury stops being a room and becomes a worldview.
- Benefits: Town gold output +20% | Harvest cap +15%
- Unlocks Next: Urban Markets (T6)

### Frontier Administration (`frontier-administration`)
- Cost: 34000 GOLD · 500 FOOD · 180 SUPPLY
- Time: 510 min
- Requirements: bureaucracy, state-granaries
- Description: Expansion, but with clipboards and alarming efficiency.
- Benefits: Settlement speed +20% | Settled food upkeep -10%
- Unlocks Next: No downstream techs

### Military Academies (`military-academies`)
- Cost: 40000 GOLD · 500 IRON · 220 SUPPLY
- Time: 600 min
- Requirements: steel, arms-guilds
- Description: At last, warfare becomes a curriculum.
- Benefits: Attack +10% | Defense +10%
- Unlocks Next: No downstream techs

### Grand Cartography (`grand-cartography`)
- Cost: 34000 GOLD · 420 CRYSTAL
- Time: 510 min
- Requirements: cryptography, beacon-towers
- Description: The world is still dangerous, but now it is labeled.
- Benefits: Vision radius +1
- Unlocks Next: No downstream techs

### Urban Markets (`urban-markets`)
- Cost: 35000 GOLD · 350 FOOD · 280 CRYSTAL
- Time: 525 min
- Requirements: central-banking, watermills
- Description: A city reaches maturity when every problem gains a price tag.
- Benefits: Fed town gold output +15%
- Unlocks Next: No downstream techs
