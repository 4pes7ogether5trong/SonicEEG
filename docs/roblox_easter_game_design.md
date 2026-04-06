# Roblox Easter Egg Hunt Game Design

## Core Player Loop
1. **Collect resources** (coins/paint) by exploring the outdoor map and completing mini-objectives.
2. **Dye eggs** at dye stations using selected colors/patterns.
3. **Hide eggs** in valid outdoor zones before a round cutoff.
4. **Hunt eggs** hidden by other players and complete the daily world egg quest.
5. **Earn rewards** (XP, cosmetics, titles, seasonal leaderboard points).

This loop supports short sessions (5–10 minutes) and longer progression sessions.

---

## Game Modes and Sessions

### Public Shared World (Default)
- Persistent server up to target player cap (e.g., 20).
- Players can hide a fixed number of eggs per day (e.g., 6–12 based on progression).
- Eggs remain discoverable for a time window (e.g., 24 hours or until reset).

### Optional Round-Based Variant
- **Prep phase**: dye + hide eggs.
- **Hunt phase**: players search for all hidden eggs.
- Useful for event weekends or competitive modes.

---

## Feature 1: Egg Dyeing System

### Player Experience
- Interact with a **Dye Station** prompt.
- Choose:
  - Base color
  - Secondary pattern (stripes, dots, zig-zag)
  - Sticker/decal (unlockable)
- Preview egg in UI before confirming.

### Data Model (per egg)
```lua
{
  eggId = "uuid",
  ownerUserId = 123456,
  appearance = {
    baseColor = "PastelPink",
    pattern = "Stripes",
    accentColor = "SkyBlue",
    decalId = "Bunny01"
  },
  hidden = false,
  hiddenAt = nil,
  hiddenLocation = nil,
  foundBy = {},
}
```

### Technical Notes
- Store cosmetic metadata, not full object states, in DataStore.
- Use server authority for applying owned cosmetics to avoid exploit-injected assets.

---

## Feature 2: Egg Hiding System

### Rules for Valid Hiding
- Must be in approved **OutdoorHideZones** (tagged parts/regions via `CollectionService`).
- Cannot overlap spawn area, shop interiors, or no-hide zones.
- Must be a minimum distance from other eggs (prevents stacking abuse).
- Height and line-of-sight checks to prevent clipping into geometry.

### Recommended Validation Pipeline (Server)
1. Client requests hide with desired transform.
2. Server raycasts to ground and snaps egg to surface.
3. Server verifies zone tag + anti-overlap radius + nav accessibility.
4. Server persists egg placement and spawns discoverable egg actor.

### Anti-Abuse
- Per-player hide quota/day.
- Cooldown between placements.
- Soft reporting for impossible positions discovered post-placement.

---

## Feature 3: Finding Eggs Hidden by Other Players

### Discovery Interaction
- Egg glints subtly when nearby.
- Use `ProximityPrompt` or click/tap interaction.
- On find:
  - Reveal owner name (optional privacy setting)
  - Grant finder rewards
  - Mark egg as found for that user

### Ownership and Duplication Rules
- Recommended: each hidden egg can be found by **multiple players once each**.
- Optional rarity multiplier if an egg has low discovery count.

### Reward Structure
- Base XP per egg found.
- Bonus for:
  - Streak (multiple eggs in short window)
  - Completing a full set of color families
  - Finding daily-generated world eggs

---

## Feature 4: Daily Generated World Eggs (12 per day)

### Requirement
Generate exactly **12 eggs per day** in random outdoor map locations for a rotating daily quest.

### Deterministic Daily Seed Strategy
Use UTC date as seed input so all servers share the same placements.

```lua
local function getDailySeed()
  local t = os.date("!*t") -- UTC
  return tonumber(string.format("%04d%02d%02d", t.year, t.month, t.day))
end
```

Then use a seeded RNG to pick from curated spawn points:
- Pre-place 150–300 candidate spawn nodes across the map.
- Filter unsafe/blocked nodes at runtime.
- Deterministically sample 12 unique nodes.

### Spawn Node Authoring
Each node should include:
- Position + normal
- Biome tag (meadow, riverbank, hill, forest edge)
- Difficulty score (easy/medium/hard visibility)

### Daily Quest Design
- Quest: “Find all 12 Spring Eggs today.”
- Partial rewards at 3/6/9 found; full reward at 12.
- Daily reset at **00:00 UTC** (or region-specific time if preferred).

### Why Deterministic?
- Same daily puzzle across servers enables social sharing (“Egg near waterfall today!”).
- Easier debugging and telemetry comparisons.

---

## Map & Level Design Guidance
- Build a layered outdoor map with distinctive landmarks:
  - Pond with dock
  - Flower meadow
  - Pine grove
  - Hill overlook
  - Wooden bridge + stream
- Ensure every landmark has both easy and sneaky egg spots.
- Avoid unfair hiding spots requiring advanced movement exploits.

---

## Economy & Progression
- **Currencies**: Spring Tokens (core), Candy (premium optional).
- **Unlock tracks**:
  - New dye colors
  - Pattern packs
  - Basket cosmetics
  - Pet chicks/bunnies (cosmetic companions)
- **Season pass (optional)**: purely cosmetic to keep hunt fair.

---

## Server/Client Architecture (Roblox)

### Suggested Services/Modules
- `ServerScriptService`
  - `EggPlacementService`
  - `DailyEggService`
  - `RewardService`
  - `DataService`
- `ReplicatedStorage`
  - `Remotes`
    - `RequestHideEgg`
    - `RequestDyeEgg`
    - `RequestCollectEgg`
  - `Shared`
    - `EggConfig`
    - `SpawnPointLibrary`
- `StarterPlayerScripts`
  - UI + interaction controllers

### Persistence
- `DataStoreService` for player progression and owned cosmetics.
- Optional `MemoryStoreService` for cross-server daily cache.
- Keep hidden-eggs-in-world data scoped by server/session unless global persistence is intentionally designed.

---

## Telemetry You Should Track
- Average eggs hidden/player/day
- Average eggs found/session
- Completion rate of 12 daily eggs
- Most/least discovered spawn nodes
- Churn after first session vs after first daily completion

This data tunes spawn difficulty and map readability.

---

## MVP Build Plan (2–3 Weeks)

### Week 1
- Map greybox + 100 spawn nodes
- Dye station UI (basic colors only)
- Server-validated hide interaction

### Week 2
- Egg discovery + rewards
- Daily deterministic 12-egg generator
- Daily quest progress UI

### Week 3
- Balancing + polish + VFX/audio cues
- Data persistence + exploit hardening
- Event launch checklist

---

## Example Pseudocode: Deterministic Daily 12 Picks
```lua
local DailyEggService = {}

function DailyEggService:GetDailyEggNodes(allNodes)
  local seed = getDailySeed()
  local rng = Random.new(seed)

  local candidates = table.clone(allNodes)
  -- Optional: filter blocked nodes first

  local selected = {}
  for i = 1, math.min(12, #candidates) do
    local index = rng:NextInteger(1, #candidates)
    table.insert(selected, candidates[index])
    table.remove(candidates, index)
  end

  return selected
end

return DailyEggService
```

---

## Nice-to-Have Extensions
- Friend clues: leave one hint message per hidden egg.
- Photo mode: snapshot found eggs at landmarks.
- Limited-time “Golden Egg Hour” with rare rewards.
- Community goal: global eggs found milestone unlock.

