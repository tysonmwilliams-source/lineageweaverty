/**
 * BRAMBLEHALL CODEX UPDATE SCRIPT
 *
 * Paste this entire script into the browser console while LineageWeaver is open.
 * It updates two existing codex entries:
 *   1. Bramblehall (location, ID 14) — adds Wyrmwood Forest, thirren, Wood-Warden's Oath
 *   2. House Wilfrey of Bramblehall (house, ID 2500) — replaces stub with full entry
 *
 * Safe to run multiple times — checks content before updating.
 */
(async () => {
  // Access the Dexie database instance
  const dbName = 'LineageWeaverDB';
  const allDbs = await indexedDB.databases();
  const match = allDbs.find(d => d.name === dbName || d.name?.startsWith('LineageWeaver'));

  if (!match) {
    console.error('Could not find LineageWeaver database. Make sure the app is open.');
    return;
  }

  // Use the app's own DB reference if available
  let db;
  try {
    const Dexie = (await import('https://unpkg.com/dexie@3/dist/dexie.mjs')).default;
    db = new Dexie(match.name);
    // We need to open with the existing schema - just declare the table we need
    db.version(match.version).stores({
      codexEntries: '++id, type, title, category, *tags, era, created, updated'
    });
    await db.open();
  } catch (e) {
    console.error('Could not open database:', e);
    return;
  }

  const now = new Date().toISOString();
  let updated = 0;

  // --- UPDATE 1: Bramblehall (location entry, ID 14) ---
  try {
    const bramblehall = await db.codexEntries.get(14);
    if (!bramblehall) {
      // Try finding by title
      const byTitle = await db.codexEntries.where('title').equals('Bramblehall').first();
      if (byTitle) {
        console.log(`Found Bramblehall at ID ${byTitle.id} instead of 14`);
        await updateBramblehall(db, byTitle, now);
        updated++;
      } else {
        console.warn('Could not find Bramblehall entry');
      }
    } else {
      await updateBramblehall(db, bramblehall, now);
      updated++;
    }
  } catch (e) {
    console.error('Error updating Bramblehall:', e);
  }

  // --- UPDATE 2: House Wilfrey of Bramblehall (stub entry, ID 2500) ---
  try {
    const stub = await db.codexEntries.get(2500);
    if (stub && stub.title === 'House Wilfrey of Bramblehall') {
      await updateHouseStub(db, stub, now);
      updated++;
    } else {
      // Find the stub by looking for the one with minimal content
      const matches = await db.codexEntries.where('title').equals('House Wilfrey of Bramblehall').toArray();
      const stubEntry = matches.find(e => e.content && e.content.length < 50);
      if (stubEntry) {
        console.log(`Found stub at ID ${stubEntry.id}`);
        await updateHouseStub(db, stubEntry, now);
        updated++;
      } else {
        console.warn('Could not find House Wilfrey of Bramblehall stub entry');
      }
    }
  } catch (e) {
    console.error('Error updating House Wilfrey of Bramblehall:', e);
  }

  console.log(`\nDone! Updated ${updated}/2 entries. Refresh the page to see changes.`);
  db.close();
})();

async function updateBramblehall(db, entry, now) {
  // Check if already updated
  if (entry.content.includes('Wyrmwood Forest')) {
    console.log('Bramblehall already updated (contains "Wyrmwood Forest"). Skipping.');
    return;
  }

  const newContent = `**Bramblehall** (also considered: Hardwood Hall) is a regional seat of [[House Wilfrey]], located at the southern edge of **[[Wyrmwood Forest]]**, a vast and ancient woodland.

## Architecture

A huge wooden holdfast with some stone elements, Bramblehall is built in harmony with its forest environment. The primary use of timber reflects both the available resources and the woodland culture of its people.

## The People

The seat is home to woodsmen and general woods folk - an insular population somewhat disconnected from the wider context of [[House Wilfrey]]'s realm. Of all four seats, Bramblehall maintains the strongest connection to old traditions and ways.

## The Wood-Warden's Oath

When **Bram Wilfrey** founded Bramblehall in 1176 — granted Wyrmwood and its surrounding lands by the Crown for extraordinary military service — he found the forest already tended by an ancient folk led by [[The Wytherns]]. Rather than conquer, he formalized partnership through the **Wood-Warden's Oath**: the forest-folk manage the woodland and its resources (particularly [[thirren]]) while Bramblehall provides protection and political representation.

Each Midwinter, the Wythern delegation travels to Bramblehall bearing a cutting of [[Mirellune]] — the sacred ghost-bloom — as a ceremonial renewal of the Compact. This tradition has continued unbroken since the founding.

## Resources

- **Timber**: Primary export and building material
- **[[Thirren]]**: A rare, slow-growing hardwood unique to Wyrmwood. Prized for its extraordinary density and deep colouring. Managed exclusively by the forest-folk under the terms of the [[Wood-Warden's Oath]]
- **Forestry**: Sustainable woodland management
- **Hunting**: Both subsistence and sport

## Culture

Bramblehall stands in stark contrast to cosmopolitan [[Fourhearth Castle]]. While Fourhearth connects to the wider world, Bramblehall deliberately maintains its isolation and traditional ways.

This cultural independence sometimes creates tension with the other seats, but also preserves knowledge and customs that might otherwise be lost to time.

## The Fostering System

Heirs sent to do a season at Bramblehall learn:
- Forestry and timber management
- Hunting and woodland survival
- Leading insular, independent-minded people
- Woodland warfare tactics

**Best Seasons**: Spring and autumn for logging; winter for hunting

## Cadet Branches

All Bramblehall-region cadet branches bear woodland-themed names:
- [[House Wilfbauer]]
- [[House Wilfbole]] (bole = tree trunk)
- [[House Wilfbark]]

## The Voice of Bramblehall

Bramblehall Wilfreys are the keepers of old ways. Their character differs notably from the other seats:

**Character:** Traditional, insular, rooted. Bramblehall Wilfreys are less concerned with the wider world and more concerned with doing things properly, as they have always been done.

**Voice tends toward:**
- Simpler, more direct language - fewer words, more weight
- Suspicion of novelty and outsiders
- Deep connection to the land and seasons
- Patience measured in tree-growth, not politics

**Distinct touches:**
- References to wood, forest, the old ways
- Open distrust of [[Fourhearth Castle|Fourhearth's]] cosmopolitan nature
- Pride in self-sufficiency - "We need nothing from beyond the treeline"
- Longer silences in conversation; comfort with quiet

*"The trees were here before us. They will be here after. We tend what we were given and pass it on. That is enough."*`;

  const newTags = [...(entry.tags || [])];
  if (!newTags.includes('wyrmwood')) newTags.push('wyrmwood');

  const newSections = [
    { order: 1, heading: 'Woodland Culture', content: 'Insular traditions and forest-based economy' },
    { order: 2, heading: 'Strategic Learning', content: 'Training ground for future lords in woodland leadership' },
    { order: 3, heading: "The Wood-Warden's Oath", content: 'Ancient compact with the Wytherns and forest-folk of Wyrmwood' },
    { order: 10, heading: 'The Voice of Bramblehall', content: 'Traditional, rooted, patience measured in tree-growth' }
  ];

  await db.codexEntries.update(entry.id, {
    content: newContent,
    tags: newTags,
    sections: newSections,
    updated: now
  });

  console.log(`Updated Bramblehall (ID ${entry.id})`);
}

async function updateHouseStub(db, entry, now) {
  // Check if already updated
  if (entry.content && entry.content.length > 100) {
    console.log('House Wilfrey of Bramblehall stub already has substantial content. Skipping.');
    return;
  }

  const newContent = `**House Wilfrey of Bramblehall** is one of the four great Wilfrey seats, ruling from [[Bramblehall]] at the southern edge of [[Wyrmwood Forest]].

## Origins

Founded in **1176** by **Bram Wilfrey**, second son of the Breakmount Wilfreys. Bram was granted Wyrmwood Forest and its surrounding lands by the Crown for extraordinary military service, and was made Drithen equal to Great Drithen. Rather than impose control over the forest-folk he found already managing the woodland, he formalized partnership through the **[[Wood-Warden's Oath]]**.

## The Forest Compact

The relationship between Bramblehall and the forest-folk — particularly [[The Wytherns]] — is central to the house's identity and economy. The forest-folk manage [[Wyrmwood Forest]] and its resources, including the prized [[thirren]] hardwood. In return, Bramblehall provides military protection and political representation.

The Compact is renewed each Midwinter when the Wythern delegation presents a cutting of [[Mirellune]] at Bramblehall — a ceremony that has continued unbroken since the founding.

## Key Resources

- **[[Thirren]]**: Rare, slow-growing hardwood of extraordinary density and value. Managed by the forest-folk under the Wood-Warden's Oath
- **Timber**: General forestry and sustainable woodland management
- **Hunting**: Both subsistence and sport

## Lords of Bramblehall

| Lord | Approximate Period |
|------|-------------------|
| Bram Wilfrey (founder) | 1176– |
| Constann Wilfrey | ~1750 |

## Cadet Branches

- [[House Wilfbauer]]
- [[House Wilfbole]]
- [[House Wilfbark]]`;

  const newTags = ['house', 'main', 'wilfrey', 'bramblehall', 'wyrmwood'];

  const newSections = [
    { order: 1, heading: 'Origins', content: 'Founded 1176 by Bram Wilfrey, second son of Breakmount' },
    { order: 2, heading: 'The Forest Compact', content: "Wood-Warden's Oath with the Wytherns and forest-folk" },
    { order: 3, heading: 'Key Resources', content: 'Thirren hardwood, timber, hunting' }
  ];

  await db.codexEntries.update(entry.id, {
    content: newContent,
    tags: newTags,
    sections: newSections,
    updated: now
  });

  console.log(`Updated House Wilfrey of Bramblehall stub (ID ${entry.id})`);
}
