import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in environment (.env).');
  process.exit(1);
}

const targetEmail = process.argv[2]?.trim();
if (!targetEmail) {
  console.error('Usage: node --env-file=.env scripts/seed-products.mjs <user-email>');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const SEED_PRODUCTS = [
  {
    name: 'Sugar',
    category: 'Groceries',
    base_unit: 'kg',
    low_stock_threshold: 5,
    aliases: [
      { alias: 'cheeni', language: 'hi' },
      { alias: 'పంచదార', language: 'te' },
      { alias: 'sugar', language: 'en' }
    ],
    unit_conversions: [
      { unit: 'bag', factor_to_base: 50 }
    ]
  },
  {
    name: 'Rice',
    category: 'Grains',
    base_unit: 'kg',
    low_stock_threshold: 10,
    aliases: [
      { alias: 'chawal', language: 'hi' },
      { alias: 'బియ్యం', language: 'te' },
      { alias: 'rice', language: 'en' }
    ],
    unit_conversions: [
      { unit: 'bag', factor_to_base: 25 }
    ]
  },
  {
    name: 'Wheat flour',
    category: 'Flour',
    base_unit: 'kg',
    low_stock_threshold: 5,
    aliases: [
      { alias: 'atta', language: 'hi' },
      { alias: 'గోధుమపిండి', language: 'te' },
      { alias: 'wheat flour', language: 'en' }
    ],
    unit_conversions: [
      { unit: 'bag', factor_to_base: 10 }
    ]
  },
  {
    name: 'Toor dal',
    category: 'Pulses',
    base_unit: 'kg',
    low_stock_threshold: 3,
    aliases: [
      { alias: 'toor dal', language: 'hi' },
      { alias: 'కంది పప్పు', language: 'te' },
      { alias: 'tuvar dal', language: 'hi' },
      { alias: 'kandi pappu', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Moong dal',
    category: 'Pulses',
    base_unit: 'kg',
    low_stock_threshold: 3,
    aliases: [
      { alias: 'moong dal', language: 'hi' },
      { alias: 'పెసర పప్పు', language: 'te' },
      { alias: 'pesara pappu', language: 'te' },
      { alias: 'mung dal', language: 'hi' }
    ],
    unit_conversions: []
  },
  {
    name: 'Cooking oil',
    category: 'Oils',
    base_unit: 'l',
    low_stock_threshold: 5,
    aliases: [
      { alias: 'tel', language: 'hi' },
      { alias: 'నూనె', language: 'te' },
      { alias: 'oil', language: 'en' },
      { alias: 'cooking oil', language: 'en' },
      { alias: 'noone', language: 'te' }
    ],
    unit_conversions: [
      { unit: 'bottle', factor_to_base: 1 },
      { unit: 'can', factor_to_base: 15 }
    ]
  },
  {
    name: 'Salt',
    category: 'Spices',
    base_unit: 'kg',
    low_stock_threshold: 2,
    aliases: [
      { alias: 'namak', language: 'hi' },
      { alias: 'ఉప్పు', language: 'te' },
      { alias: 'salt', language: 'en' },
      { alias: 'uppu', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Tea powder',
    category: 'Beverages',
    base_unit: 'kg',
    low_stock_threshold: 1,
    aliases: [
      { alias: 'chai patti', language: 'hi' },
      { alias: 'టీ పొడి', language: 'te' },
      { alias: 'tea powder', language: 'en' },
      { alias: 'chai', language: 'hi' },
      { alias: 'tea', language: 'en' },
      { alias: 'ti podi', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Milk powder',
    category: 'Dairy',
    base_unit: 'kg',
    low_stock_threshold: 2,
    aliases: [
      { alias: 'milk powder', language: 'en' },
      { alias: 'doodh powder', language: 'hi' },
      { alias: 'పాలు పొడి', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Ghee',
    category: 'Dairy',
    base_unit: 'l',
    low_stock_threshold: 2,
    aliases: [
      { alias: 'ghee', language: 'hi' },
      { alias: 'నెయ్యి', language: 'te' },
      { alias: 'neyyi', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Onions',
    category: 'Vegetables',
    base_unit: 'kg',
    low_stock_threshold: 5,
    aliases: [
      { alias: 'pyaz', language: 'hi' },
      { alias: 'ఉల్లిపాయలు', language: 'te' },
      { alias: 'onion', language: 'en' },
      { alias: 'onions', language: 'en' },
      { alias: 'ullipayalu', language: 'te' },
      { alias: 'pyaj', language: 'hi' }
    ],
    unit_conversions: []
  },
  {
    name: 'Potatoes',
    category: 'Vegetables',
    base_unit: 'kg',
    low_stock_threshold: 5,
    aliases: [
      { alias: 'aloo', language: 'hi' },
      { alias: 'బంగాళదుంప', language: 'te' },
      { alias: 'potato', language: 'en' },
      { alias: 'potatoes', language: 'en' },
      { alias: 'alu', language: 'hi' },
      { alias: 'bangaladumpa', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Soap bars',
    category: 'Personal Care',
    base_unit: 'pcs',
    low_stock_threshold: 10,
    aliases: [
      { alias: 'soap', language: 'en' },
      { alias: 'sabun', language: 'hi' },
      { alias: 'సబ్బు', language: 'te' },
      { alias: 'soap bars', language: 'en' },
      { alias: 'sabbu', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Detergent powder',
    category: 'Household',
    base_unit: 'kg',
    low_stock_threshold: 3,
    aliases: [
      { alias: 'detergent', language: 'en' },
      { alias: 'surf', language: 'hi' },
      { alias: 'detergent powder', language: 'en' },
      { alias: 'డిటర్జెంట్', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Matchboxes',
    category: 'Household',
    base_unit: 'pcs',
    low_stock_threshold: 20,
    aliases: [
      { alias: 'matchbox', language: 'en' },
      { alias: 'machis', language: 'hi' },
      { alias: 'అగ్గిపెట్టె', language: 'te' },
      { alias: 'matchboxes', language: 'en' },
      { alias: 'aggipette', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Biscuit packets',
    category: 'Snacks',
    base_unit: 'pcs',
    low_stock_threshold: 15,
    aliases: [
      { alias: 'biscuit', language: 'en' },
      { alias: 'biscuits', language: 'en' },
      { alias: 'బిస్కెట్లు', language: 'te' },
      { alias: 'biscuit packet', language: 'en' },
      { alias: 'bisket', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Agarbatti (incense) packets',
    category: 'Household',
    base_unit: 'pcs',
    low_stock_threshold: 10,
    aliases: [
      { alias: 'agarbatti', language: 'hi' },
      { alias: 'incense', language: 'en' },
      { alias: 'అగరబత్తి', language: 'te' },
      { alias: 'agarbathi', language: 'te' }
    ],
    unit_conversions: []
  },
  {
    name: 'Bread loaves',
    category: 'Bakery',
    base_unit: 'pcs',
    low_stock_threshold: 5,
    aliases: [
      { alias: 'bread', language: 'en' },
      { alias: 'బ్రెడ్', language: 'te' },
      { alias: 'bread loaf', language: 'en' }
    ],
    unit_conversions: []
  },
  {
    name: 'Eggs',
    category: 'Poultry',
    base_unit: 'pcs',
    low_stock_threshold: 30,
    aliases: [
      { alias: 'egg', language: 'en' },
      { alias: 'anda', language: 'hi' },
      { alias: 'ande', language: 'hi' },
      { alias: 'గుడ్లు', language: 'te' },
      { alias: 'guddu', language: 'te' }
    ],
    unit_conversions: [
      { unit: 'dozen', factor_to_base: 12 }
    ]
  },
  {
    name: 'Bottled water (1L)',
    category: 'Beverages',
    base_unit: 'pcs',
    low_stock_threshold: 10,
    aliases: [
      { alias: 'water bottle', language: 'en' },
      { alias: 'water', language: 'en' },
      { alias: 'paani', language: 'hi' },
      { alias: 'నీళ్లు', language: 'te' },
      { alias: 'bottled water', language: 'en' },
      { alias: 'neellu', language: 'te' }
    ],
    unit_conversions: []
  }
];

async function seed() {
  console.log(`Looking up user by email: ${targetEmail}...`);

  // 1. Look up user by email using admin client
  let targetUser = null;
  let page = 1;
  const perPage = 100;

  while (!targetUser) {
    const { data: pageData, error: listErr } = await adminClient.auth.admin.listUsers({
      page,
      perPage
    });

    if (listErr) {
      console.error('Failed to list users from Supabase Auth:', listErr.message);
      process.exit(1);
    }

    const users = pageData?.users || [];
    if (users.length === 0) break;

    targetUser = users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (targetUser || users.length < perPage) break;
    page++;
  }

  if (!targetUser) {
    console.error(`User with email "${targetEmail}" was not found in Supabase Auth.`);
    process.exit(1);
  }

  const ownerId = targetUser.id;
  console.log(`Found user: ${targetEmail} (owner_id: ${ownerId})\n`);

  // 2. Fetch existing products for this owner
  const { data: existingProducts, error: prodFetchErr } = await adminClient
    .from('products')
    .select('id, name')
    .eq('owner_id', ownerId)
    .is('archived_at', null);

  if (prodFetchErr) {
    console.error('Failed to query existing products:', prodFetchErr.message);
    process.exit(1);
  }

  const existingMap = new Map();
  for (const ep of (existingProducts || [])) {
    existingMap.set(ep.name.trim().toLowerCase(), ep.id);
  }

  let insertedCount = 0;
  let skippedCount = 0;

  console.log('Seeding 20 kirana-shop products...\n');

  for (const item of SEED_PRODUCTS) {
    const key = item.name.trim().toLowerCase();

    if (existingMap.has(key)) {
      console.log(`[SKIP] "${item.name}" already exists (id: ${existingMap.get(key)})`);
      skippedCount++;
      continue;
    }

    try {
      // a. Insert product with current_qty: 0
      const { data: createdProduct, error: insertProdErr } = await adminClient
        .from('products')
        .insert({
          owner_id: ownerId,
          name: item.name,
          category: item.category || null,
          base_unit: item.base_unit,
          low_stock_threshold: item.low_stock_threshold,
          current_qty: 0
        })
        .select('*')
        .single();

      if (insertProdErr) {
        throw new Error(`Insert product error: ${insertProdErr.message}`);
      }

      const productId = createdProduct.id;

      // b. Pick random initial stock between 5 and 40 (in base unit)
      const randomQty = Math.floor(Math.random() * (40 - 5 + 1)) + 5;

      // c. Direct update of current_qty (only for seed script)
      const { error: updateQtyErr } = await adminClient
        .from('products')
        .update({ current_qty: randomQty })
        .eq('id', productId);

      if (updateQtyErr) {
        throw new Error(`Direct update current_qty error: ${updateQtyErr.message}`);
      }

      // d. Insert exactly one 'adjust' type movement with source 'system' for opening balance
      const { error: smErr } = await adminClient
        .from('stock_movements')
        .insert({
          owner_id: ownerId,
          product_id: productId,
          type: 'adjust',
          delta_base: randomQty,
          balance_after: randomQty,
          input_qty: randomQty,
          input_unit: item.base_unit,
          source: 'system',
          raw_text: 'Opening balance seed'
        });

      if (smErr) {
        throw new Error(`Insert stock_movements error: ${smErr.message}`);
      }

      // e. Insert aliases into product_aliases
      if (Array.isArray(item.aliases) && item.aliases.length > 0) {
        for (const aliasItem of item.aliases) {
          const { error: aErr } = await adminClient
            .from('product_aliases')
            .insert({
              owner_id: ownerId,
              product_id: productId,
              alias: aliasItem.alias,
              language: aliasItem.language || null
            });

          if (aErr) {
            // If alias conflict, log warning but don't fail product
            if (aErr.code !== '23505') {
              console.warn(`  - [ALIAS WARN] Could not add alias "${aliasItem.alias}": ${aErr.message}`);
            }
          }
        }
      }

      // f. Insert unit conversions into unit_conversions
      if (Array.isArray(item.unit_conversions) && item.unit_conversions.length > 0) {
        for (const conv of item.unit_conversions) {
          const { error: convErr } = await adminClient
            .from('unit_conversions')
            .insert({
              owner_id: ownerId,
              product_id: productId,
              unit: conv.unit.toLowerCase().trim(),
              factor_to_base: conv.factor_to_base
            });

          if (convErr) {
            console.warn(`  - [CONV WARN] Could not add conversion "${conv.unit}": ${convErr.message}`);
          }
        }
      }

      console.log(`[INSERTED] "${item.name}" (qty: ${randomQty} ${item.base_unit}, threshold: ${item.low_stock_threshold}, aliases: ${item.aliases.length}, conversions: ${item.unit_conversions.length})`);
      existingMap.set(key, productId);
      insertedCount++;
    } catch (err) {
      console.error(`[ERROR] Failed to process product "${item.name}":`, err.message);
    }
  }

  // 3. Confirm final row counts for this owner
  const { count: prodCount } = await adminClient
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .is('archived_at', null);

  const { count: aliasCount } = await adminClient
    .from('product_aliases')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  const { count: convCount } = await adminClient
    .from('unit_conversions')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  const { count: movCount } = await adminClient
    .from('stock_movements')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  console.log('\n====================================================');
  console.log(`SEEDING SUMMARY FOR: ${targetEmail}`);
  console.log('====================================================');
  console.log(`Products Inserted: ${insertedCount}`);
  console.log(`Products Skipped:  ${skippedCount}`);
  console.log('----------------------------------------------------');
  console.log('Final Row Counts for Owner:');
  console.log(`  - products:         ${prodCount}`);
  console.log(`  - product_aliases:  ${aliasCount}`);
  console.log(`  - unit_conversions: ${convCount}`);
  console.log(`  - stock_movements:  ${movCount}`);
  console.log('====================================================\n');
}

seed().catch(err => {
  console.error('Fatal seed script error:', err);
  process.exit(1);
});
