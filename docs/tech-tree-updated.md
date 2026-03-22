# Updated Tech Tree

Generated from `packages/server/data/tech-tree.json` on 2026-03-22.

Total techs: 54

## Tier 1

### Agriculture (`agriculture`)
- Cost: 2000 GOLD · 40 FOOD
- Time: 30 min
- Requirements: None
- Description: Turns dirt into policy and policy into bread.
- Benefits: Unlocks Farmstead
- Unlocks Next: Animal Husbandry (T2), Irrigation (T2), Pottery (T2)

### Cartography (`cartography`)
- Cost: 2500 GOLD · 25 CRYSTAL
- Time: 40 min
- Requirements: trade
- Description: A map is just ambition with cleaner lines.
- Benefits: Unlocks Observatory | Vision radius +1
- Unlocks Next: Road Building (T2), Signal Fires (T2), Surveying (T3)

### Leatherworking (`leatherworking`)
- Cost: 2500 GOLD · 35 SUPPLY
- Time: 40 min
- Requirements: toolmaking
- Description: Turns hides into straps, and straps into military confidence.
- Benefits: Unlocks Camp | Unlocks Siege Outposts
- Unlocks Next: Chainmail (T4), Siegecraft (T3)

### Masonry (`masonry`)
- Cost: 2500 GOLD · 35 IRON
- Time: 40 min
- Requirements: toolmaking
- Description: Because 'please do not invade' works better in stone.
- Benefits: Unlocks Forts
- Unlocks Next: Fortified Walls (T2), Heavy Masonry (T4), Iron Working (T3)

### Mining (`mining`)
- Cost: 2500 GOLD · 25 IRON
- Time: 40 min
- Requirements: toolmaking
- Description: Sooner or later, empire becomes a hole in the ground with a payroll.
- Benefits: Unlocks Mine
- Unlocks Next: No downstream techs

### Toolmaking (`toolmaking`)
- Cost: 2000 GOLD · 40 SUPPLY
- Time: 35 min
- Requirements: None
- Description: Civilization begins the moment someone sharpens the boring stick.
- Benefits: Settlement speed +10%
- Unlocks Next: Bronze Working (T2), Leatherworking (T1), Masonry (T1), Mining (T1), Road Building (T2)

### Trade (`trade`)
- Cost: 2500 GOLD · 25 CRYSTAL
- Time: 35 min
- Requirements: None
- Description: Why raid it when you can invoice it?
- Benefits: Unlocks Market
- Unlocks Next: Cartography (T1), Ledger Keeping (T2), Maritime Trade (T2), Mercenary Contracts (T3)

### Tribal Warfare (`tribal-warfare`)
- Cost: 2500 GOLD · 25 IRON
- Time: 35 min
- Requirements: None
- Description: Arguments, but with drums and better posture.
- Benefits: Attack +5%
- Unlocks Next: Bronze Working (T2), Mercenary Contracts (T3)

## Tier 2

### Animal Husbandry (`animal-husbandry`)
- Cost: 4500 GOLD · 60 FOOD
- Time: 50 min
- Requirements: agriculture
- Description: A bold experiment in outsourcing labor to creatures with opinions.
- Benefits: Settled food upkeep -10%
- Unlocks Next: Crop Rotation (T3)

### Bronze Working (`bronze-working`)
- Cost: 6000 GOLD · 90 IRON
- Time: 1 h 15 min
- Requirements: tribal-warfare, toolmaking
- Description: When sharper metal starts winning philosophical debates.
- Benefits: Attack +10%
- Unlocks Next: Iron Working (T3), Siegecraft (T3)

### Fortified Walls (`fortified-walls`)
- Cost: 6000 GOLD · 90 IRON
- Time: 1 h 15 min
- Requirements: masonry
- Description: A polite reminder that entry is now a managed privilege.
- Benefits: Fort defense +15%
- Unlocks Next: Fortification Doctrine (T3)

### Irrigation (`irrigation`)
- Cost: 5000 GOLD · 90 FOOD
- Time: 1 h
- Requirements: agriculture
- Description: Convincing water to report for work on time.
- Benefits: Town food upkeep -10%
- Unlocks Next: Crop Rotation (T3), Granaries (T3)

### Ledger Keeping (`ledger-keeping`)
- Cost: 5500 GOLD · 70 CRYSTAL
- Time: 1 h
- Requirements: trade
- Description: Gold behaves much better once someone starts counting it.
- Benefits: Town gold cap +25%
- Unlocks Next: Coinage (T4), Merchant Guilds (T3)

### Maritime Trade (`maritime-trade`)
- Cost: 5500 GOLD · 70 CRYSTAL
- Time: 1 h
- Requirements: trade
- Description: A dock becomes a ledger the moment ships start keeping score.
- Benefits: Dock income +50%
- Unlocks Next: Port Infrastructure (T4)

### Pottery (`pottery`)
- Cost: 4500 GOLD · 70 FOOD
- Time: 50 min
- Requirements: agriculture
- Description: The ancient art of storing things instead of losing them.
- Benefits: Town gold cap +25%
- Unlocks Next: Granaries (T3)

### Road Building (`road-building`)
- Cost: 6000 GOLD · 90 SUPPLY
- Time: 1 h 10 min
- Requirements: toolmaking, cartography
- Description: Mud loses most debates once roads arrive.
- Benefits: Settlement speed +15%
- Unlocks Next: Fortification Doctrine (T3), Merchant Guilds (T3), Navigation (T4), Port Infrastructure (T4), Relay Roads (T4), Surveying (T3)

### Signal Fires (`signal-fires`)
- Cost: 5500 GOLD · 60 CRYSTAL
- Time: 55 min
- Requirements: cartography
- Description: Smoke, but make it strategic.
- Benefits: Unlocks Reveal Empire | Vision radius +1
- Unlocks Next: Beacon Towers (T4), Cryptography (T5), Navigation (T4)

## Tier 3

### Crop Rotation (`crop-rotation`)
- Cost: 9500 GOLD · 150 FOOD
- Time: 2 h 10 min
- Requirements: irrigation, animal-husbandry
- Description: Even fields perform better when they are not doing the same thing forever.
- Benefits: FARM output +4%
- Unlocks Next: Civil Survey (T4)

### Fortification Doctrine (`fortification-doctrine`)
- Cost: 9500 GOLD · 130 IRON · 80 SUPPLY
- Time: 2 h 5 min
- Requirements: fortified-walls, road-building
- Description: A full philosophy built around not dying on your own land.
- Benefits: Fort defense +10% | Settled defense +10%
- Unlocks Next: Heavy Masonry (T4)

### Granaries (`granaries`)
- Cost: 9000 GOLD · 140 FOOD
- Time: 2 h
- Requirements: irrigation, pottery
- Description: Because winter always arrives with excellent timing and poor manners.
- Benefits: Town food upkeep -6% | Town gold cap +20%
- Unlocks Next: Watermills (T4)

### Iron Working (`iron-working`)
- Cost: 10000 GOLD · 160 IRON
- Time: 2 h 15 min
- Requirements: bronze-working, masonry
- Description: The moment metal stops being useful and starts being persuasive.
- Benefits: Attack vs settled +15% | Attack vs forts +15%
- Unlocks Next: Chainmail (T4), Standing Army (T4)

### Mercenary Contracts (`mercenary-contracts`)
- Cost: 9500 GOLD · 50 IRON · 110 CRYSTAL
- Time: 2 h 5 min
- Requirements: trade, tribal-warfare
- Description: Loyalty is expensive, but so is losing.
- Benefits: Attack +5%
- Unlocks Next: Standing Army (T4)

### Merchant Guilds (`merchant-guilds`)
- Cost: 9500 GOLD · 80 SUPPLY · 120 CRYSTAL
- Time: 2 h
- Requirements: ledger-keeping, road-building
- Description: At last, the traders unionize and the treasury smiles.
- Benefits: Town gold output +15%
- Unlocks Next: Banking (T5), Coinage (T4), Global Trade Networks (T5), Relay Roads (T4)

### Siegecraft (`siegecraft`)
- Cost: 10000 GOLD · 80 IRON · 120 SUPPLY
- Time: 2 h 15 min
- Requirements: leatherworking, bronze-working
- Description: For when knocking politely has clearly failed.
- Benefits: Outpost attack +20%
- Unlocks Next: Logistics (T5)

### Surveying (`surveying`)
- Cost: 9000 GOLD · 90 SUPPLY · 100 CRYSTAL
- Time: 1 h 50 min
- Requirements: cartography, road-building
- Description: Nothing says empire like measuring land you do not fully own yet.
- Benefits: Vision radius +1
- Unlocks Next: Beacon Towers (T4), Civil Survey (T4), Terrain Engineering (T5)

## Tier 4

### Beacon Towers (`beacon-towers`)
- Cost: 14000 GOLD · 180 CRYSTAL
- Time: 3 h 20 min
- Requirements: signal-fires, surveying
- Description: At last, a skyline that warns people properly.
- Benefits: Vision radius +1
- Unlocks Next: Cryptography (T5), Grand Cartography (T6)

### Chainmail (`chainmail`)
- Cost: 15000 GOLD · 180 IRON · 120 SUPPLY
- Time: 3 h 40 min
- Requirements: iron-working, leatherworking
- Description: Thousands of tiny rings agreeing to keep organs inside.
- Benefits: Settled defense +10%
- Unlocks Next: Steelworking (T5)

### Civil Survey (`civil-survey`)
- Cost: 14000 GOLD · 200 FOOD · 120 CRYSTAL
- Time: 3 h 20 min
- Requirements: crop-rotation, surveying
- Description: Now expansion arrives with paperwork and suspicious accuracy.
- Benefits: Settlement speed +10% | Settled food upkeep -10%
- Unlocks Next: Civil Service (T5), State Granaries (T5)

### Coinage (`coinage`)
- Cost: 15000 GOLD · 100 FOOD · 180 CRYSTAL
- Time: 3 h 40 min
- Requirements: ledger-keeping, merchant-guilds
- Description: Standardized money: fewer arguments, better greed.
- Benefits: Town gold output +15% | Harvest cap +10%
- Unlocks Next: Banking (T5), Civil Service (T5)

### Heavy Masonry (`heavy-masonry`)
- Cost: 14500 GOLD · 230 IRON
- Time: 3 h 35 min
- Requirements: fortification-doctrine, masonry
- Description: When your walls begin to take their job personally.
- Benefits: Fort defense +10% | Fort iron upkeep -20%
- Unlocks Next: Engineering (T5)

### Navigation (`navigation`)
- Cost: 14500 GOLD · 180 SUPPLY · 180 CRYSTAL
- Time: 3 h 25 min
- Requirements: road-building, signal-fires
- Description: At last, the sea becomes a route instead of a rude suggestion.
- Benefits: Unlocks Naval Infiltration
- Unlocks Next: No downstream techs

### Port Infrastructure (`port-infrastructure`)
- Cost: 14500 GOLD · 180 SUPPLY · 180 CRYSTAL
- Time: 3 h 25 min
- Requirements: maritime-trade, road-building
- Description: Harbors stop being shorelines and start becoming systems.
- Benefits: Dock income +25% | Dock cap +50%
- Unlocks Next: Global Trade Networks (T5)

### Relay Roads (`relay-roads`)
- Cost: 14500 GOLD · 210 SUPPLY
- Time: 3 h 25 min
- Requirements: road-building, merchant-guilds
- Description: The empire starts moving like it has somewhere to be.
- Benefits: Settlement speed +20% | Town gold cap +10%
- Unlocks Next: Engineering (T5), Logistics (T5)

### Standing Army (`standing-army`)
- Cost: 15000 GOLD · 220 IRON
- Time: 3 h 45 min
- Requirements: iron-working, mercenary-contracts
- Description: A permanent answer to temporary neighbors.
- Benefits: Attack +12% | Defense +8%
- Unlocks Next: Steelworking (T5)

### Watermills (`watermills`)
- Cost: 14000 GOLD · 220 FOOD
- Time: 3 h 30 min
- Requirements: granaries
- Description: The river finally joins the payroll.
- Benefits: Fed town gold output +15%
- Unlocks Next: State Granaries (T5), Urban Markets (T6)

## Tier 5

### Arms Guilds (`arms-guilds`)
- Cost: 24000 GOLD · 250 IRON · 200 SUPPLY
- Time: 5 h 45 min
- Requirements: steelworking, logistics
- Description: Mass production, now with sharper consequences.
- Benefits: Outpost attack +15%
- Unlocks Next: Military Academies (T6)

### Banking (`banking`)
- Cost: 24000 GOLD · 180 FOOD · 320 CRYSTAL
- Time: 5 h 30 min
- Requirements: coinage, merchant-guilds
- Description: Money now has a house, rules, and very firm opinions.
- Benefits: Town gold output +25%
- Unlocks Next: Bureaucracy (T6), Central Banking (T6)

### Civil Service (`civil-service`)
- Cost: 23000 GOLD · 240 FOOD · 140 CRYSTAL
- Time: 5 h 30 min
- Requirements: coinage, civil-survey
- Description: The empire discovers forms, stamps, and sustainable annoyance.
- Benefits: Settled gold upkeep -20%
- Unlocks Next: Bureaucracy (T6), Central Banking (T6)

### Cryptography (`cryptography`)
- Cost: 22000 GOLD · 260 CRYSTAL
- Time: 5 h 15 min
- Requirements: beacon-towers, signal-fires
- Description: Secrets, but organized enough to invoice.
- Benefits: Unlocks Sabotage
- Unlocks Next: Grand Cartography (T6)

### Engineering (`engineering`)
- Cost: 24000 GOLD · 360 IRON · 220 SUPPLY
- Time: 6 h
- Requirements: heavy-masonry, relay-roads
- Description: At this point, the empire runs on levers, pulleys, and audacity.
- Benefits: Settlement speed +10% | Fort iron upkeep -20%
- Unlocks Next: Steel (T6), Supply Trains (T6)

### Global Trade Networks (`global-trade-networks`)
- Cost: 24000 GOLD · 180 SUPPLY · 320 CRYSTAL
- Time: 5 h 30 min
- Requirements: port-infrastructure, merchant-guilds
- Description: Trade stops following roads and starts dictating them.
- Benefits: Dock income +50%
- Unlocks Next: Trade Empire (T6)

### Logistics (`logistics`)
- Cost: 24000 GOLD · 360 SUPPLY
- Time: 5 h 45 min
- Requirements: relay-roads, siegecraft
- Description: The glamorous science of making sure the army arrives with lunch.
- Benefits: Settlement speed +10% | Outpost supply upkeep -25%
- Unlocks Next: Arms Guilds (T5), Supply Trains (T6), Terrain Engineering (T5)

### State Granaries (`state-granaries`)
- Cost: 22000 GOLD · 380 FOOD
- Time: 5 h 30 min
- Requirements: watermills, civil-survey
- Description: Hunger meets bureaucracy and somehow loses.
- Benefits: Town food upkeep -6%
- Unlocks Next: Frontier Administration (T6)

### Steelworking (`steelworking`)
- Cost: 25000 GOLD · 400 IRON
- Time: 6 h 15 min
- Requirements: standing-army, chainmail
- Description: Bronze was a phase. This is commitment.
- Benefits: Attack +18%
- Unlocks Next: Arms Guilds (T5), Steel (T6)

### Terrain Engineering (`terrain-engineering`)
- Cost: 14000 GOLD · 180 SUPPLY · 120 CRYSTAL
- Time: 3 h 30 min
- Requirements: surveying, logistics
- Description: When the mountain becomes a policy question instead of a natural fact.
- Benefits: Unlocks Terrain Shaping
- Unlocks Next: No downstream techs

## Tier 6

### Bureaucracy (`bureaucracy`)
- Cost: 38000 GOLD · 520 FOOD · 220 CRYSTAL
- Time: 10 h
- Requirements: civil-service, banking
- Description: The empire achieves its final form: forms.
- Benefits: Settled gold upkeep -25% | Town gold cap +10%
- Unlocks Next: Frontier Administration (T6)

### Central Banking (`central-banking`)
- Cost: 36000 GOLD · 250 FOOD · 480 CRYSTAL
- Time: 9 h
- Requirements: banking, civil-service
- Description: When the treasury stops being a room and becomes a worldview.
- Benefits: Town gold output +20% | Harvest cap +15%
- Unlocks Next: Trade Empire (T6), Urban Markets (T6)

### Frontier Administration (`frontier-administration`)
- Cost: 34000 GOLD · 500 FOOD · 180 SUPPLY
- Time: 8 h 30 min
- Requirements: bureaucracy, state-granaries
- Description: Expansion, but with clipboards and alarming efficiency.
- Benefits: Settlement speed +20% | Settled food upkeep -10%
- Unlocks Next: No downstream techs

### Grand Cartography (`grand-cartography`)
- Cost: 34000 GOLD · 420 CRYSTAL
- Time: 8 h 30 min
- Requirements: cryptography, beacon-towers
- Description: The world is still dangerous, but now it is labeled.
- Benefits: Vision radius +1
- Unlocks Next: No downstream techs

### Military Academies (`military-academies`)
- Cost: 40000 GOLD · 500 IRON · 220 SUPPLY
- Time: 10 h
- Requirements: steel, arms-guilds
- Description: At last, warfare becomes a curriculum.
- Benefits: Attack +10% | Defense +10%
- Unlocks Next: No downstream techs

### Steel (`steel`)
- Cost: 40000 GOLD · 650 IRON
- Time: 10 h 30 min
- Requirements: steelworking, engineering
- Description: Harder, louder, and increasingly difficult to argue with.
- Benefits: Attack +20% | Attack vs forts +10%
- Unlocks Next: Military Academies (T6)

### Supply Trains (`supply-trains`)
- Cost: 38000 GOLD · 520 SUPPLY
- Time: 9 h 30 min
- Requirements: logistics, engineering
- Description: War, now with timetables.
- Benefits: Outpost supply upkeep -15% | Outpost gold upkeep -25%
- Unlocks Next: No downstream techs

### Trade Empire (`trade-empire`)
- Cost: 36000 GOLD · 250 FOOD · 480 CRYSTAL
- Time: 9 h
- Requirements: global-trade-networks, central-banking
- Description: At a certain point, the empire stops funding trade and trade starts funding the empire.
- Benefits: Market crystal upkeep -20%
- Unlocks Next: No downstream techs

### Urban Markets (`urban-markets`)
- Cost: 35000 GOLD · 350 FOOD · 280 CRYSTAL
- Time: 8 h 45 min
- Requirements: central-banking, watermills
- Description: A city reaches maturity when every problem gains a price tag.
- Benefits: Fed town gold output +15%
- Unlocks Next: No downstream techs

