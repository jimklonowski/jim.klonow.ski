// The meal library: label figures for the meals Jim eats on repeat, kept in code with their
// sources so they are reviewed like any other constant and cost no tokens. Each MEAL is a list of
// ITEMS with quantities, so a combo is the sum of its parts and a part changes in one place when
// a label does. Lookup is by mealKey (shared/utils/mealKey.ts), so every spelling of a meal
// resolves, and "N x <meal>" multiplies the whole meal (nutrition.ts lookupEstimate).
//
// Adding a regular: an ITEM per product (figures straight off the label or the chain's
// nutrition page, with the URL), then a MEAL naming its parts and the spellings it's logged
// under. A one-off that doesn't deserve code is entered by hand on its chip instead
// (source 'manual'); a hand entry wins over this file when both exist.
import { mealKey } from './mealKey.ts'
import type { MealEstimate, MealPortion } from './nutrition.ts'

export interface LibraryItem {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  /** What the figures describe, as it reads on the label. */
  portion: string
  /** Where the figures came from, and anything that had to be adjusted or assumed. */
  source: string
}

export const ITEMS = {
  // Kirkland Signature breakfast sandwich (spiral butter croissant, applewood bacon, egg, cheese;
  // 8-ct, 4.82 oz each): 390 kcal / 23 g fat / 33 g carbs / 17 g protein per sandwich (box label
  // via listings; protein is quoted as 17–19 g — confirm against the box).
  kirkland_breakfast_sandwich: {
    kcal: 390, protein_g: 17, carbs_g: 33, fat_g: 23,
    portion: '1 Kirkland Signature bacon, egg & cheese croissant sandwich (137 g)',
    source: 'https://www.costco.com/p/-/kirkland-signature-breakfast-sandwich-482-oz-8-count/4000214872 — box label'
  },
  // Costco's frozen grilled cheese (12-ct box). The Costco box reads 390 kcal / 24 g fat per
  // 104 g sandwich; the 2-ct retail box of the same sandwich reads 360 kcal / 21 g fat — confirm
  // against the box in the freezer.
  lilys_grilled_cheese: {
    kcal: 390, protein_g: 10, carbs_g: 34, fat_g: 24,
    portion: '1 Lily\'s Toaster Grills American grilled cheese (104 g)',
    source: 'https://lilystoastergrills.com/american-grilled-cheese/ — Costco 12-ct box label; retail 2-ct box reads 360 kcal'
  },
  // The single-serve guac cup. The current cup label reads 90 kcal; older boxes read 110.
  kirkland_guac_cup: {
    kcal: 90, protein_g: 1, carbs_g: 6, fat_g: 8,
    portion: '1 Kirkland Signature organic chunky guacamole cup (2.5 oz / 70 g)',
    source: 'https://www.costco.com/p/-/kirkland-signature-chunky-guacamole-organic-25-oz-16-count/100638780 — current label 90 kcal (older boxes 110)'
  },
  // McDonald's US product page: Double Cheeseburger 440 kcal as served (Oct 2026); the nutrition
  // calculator's macros are 23 g fat / 34 g carbs / 25 g protein — confirm those there. Ordered
  // PLAIN (no ketchup, mustard, pickles, onion) it loses the ketchup's ~10 kcal and ~3 g of carbs.
  mcd_double_cheeseburger_plain: {
    kcal: 430, protein_g: 25, carbs_g: 31, fat_g: 23,
    portion: '1 McDonald\'s Double Cheeseburger, plain',
    source: 'https://www.mcdonalds.com/us/en-us/product/double-cheeseburger.html — 440 kcal as served, ketchup/onion taken off; macros per the nutrition calculator'
  },
  // US small fries: 230 kcal / 11 g fat / 31 g carbs / 3 g protein per the nutrition calculator.
  mcd_fries_small: {
    kcal: 230, protein_g: 3, carbs_g: 31, fat_g: 11,
    portion: '1 small McDonald\'s fries',
    source: 'https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html — small fries'
  },
  // McDonald's breakfast: Sausage McMuffin with Egg 480 kcal / 31 g fat / 30 g carbs / 20 g
  // protein; Hash Browns 140 kcal / 8 g fat / 18 g carbs / 2 g protein (US product pages).
  mcd_sausage_egg_cheese_mcmuffin: {
    kcal: 480, protein_g: 20, carbs_g: 30, fat_g: 31,
    portion: '1 McDonald\'s Sausage McMuffin with Egg',
    source: 'https://www.mcdonalds.com/us/en-us/product/sausage-mcmuffin-with-egg.html'
  },
  mcd_hash_brown: {
    kcal: 140, protein_g: 2, carbs_g: 18, fat_g: 8,
    portion: '1 McDonald\'s Hash Browns',
    source: 'https://www.mcdonalds.com/us/en-us/product/hash-browns.html'
  },

  // --- the rice-cooker bowls ---
  // Jim starts a bowl with ONE CUP of uncooked long-grain white rice in the cooker and eats the
  // lot (2026-10-26) — about three cups cooked. The bowls below count the whole cup; the cooked
  // cup stays for leftovers.
  rice_uncooked_cup: {
    kcal: 675, protein_g: 13.2, carbs_g: 148, fat_g: 1.2,
    portion: '1 cup uncooked long-grain white rice (185 g, ≈ 3 cups cooked)',
    source: 'USDA FoodData Central — rice, white, long-grain, regular, raw, enriched; the whole pot (Jim, 2026-10-26)'
  },
  rice_cooked_cup: {
    kcal: 205, protein_g: 4.3, carbs_g: 44.5, fat_g: 0.4,
    portion: '1 cup cooked long-grain white rice (158 g)',
    source: 'USDA FoodData Central — rice, white, long-grain, regular, enriched, cooked'
  },
  broccoli_steamed_cup: {
    kcal: 55, protein_g: 3.7, carbs_g: 11.2, fat_g: 0.6,
    portion: '1 cup steamed broccoli (156 g)',
    source: 'USDA FoodData Central — broccoli, cooked, boiled, drained'
  },
  // Costco (Toronto Fresh Foods) thin-sliced Certified Angus Beef chuck rolls, about 40 per 1 lb
  // package; the label reads 276 kcal / 22 g protein / 20 g fat per 4 oz. Eight rolls ≈ 3.2 oz.
  costco_hot_pot_beef_rolls_8: {
    kcal: 221, protein_g: 17.6, carbs_g: 0, fat_g: 16,
    portion: '8 Costco hot pot beef chuck rolls (≈ 3.2 oz / 91 g raw)',
    source: 'https://sameday.costco.com/store/costco/products/59503963-hot-pot-beef-chuck-rolls-16-oz — 276 kcal per 4 oz × 0.8'
  },
  // Jim's pan sauce: water, soy, mirin, rice wine vinegar, sugar, salt, pepper, chili oil, MSG,
  // garlic — simmered 30 s over the seared rolls. Read as ~1 tbsp soy, 1 tbsp mirin, 1 tsp sugar,
  // 1 tsp chili oil per bowl; the vinegar, garlic and seasonings add nothing. ESTIMATED from the
  // recipe — CONFIRM the amounts.
  wok_sauce_bowl: {
    kcal: 100, protein_g: 1, carbs_g: 12, fat_g: 4.5,
    portion: 'the soy–mirin–chili-oil pan sauce, one bowl\'s share',
    source: 'estimated from the recipe (1 tbsp soy, 1 tbsp mirin, 1 tsp sugar, 1 tsp chili oil) — confirm'
  },
  // Costco's 2 lb bag, box label (Jim, 2026-10-26): 210 kcal / 9 g fat / 13 g carbs / 17 g
  // protein per 4 oz (112 g) serving, which the box calls "about 1⅓ fillet" — so ONE fillet is
  // 3 oz, three-quarters of a serving.
  sea_cuisine_tilapia_fillet: {
    kcal: 158, protein_g: 12.8, carbs_g: 9.8, fat_g: 6.8,
    portion: '1 Sea Cuisine tortilla-crusted tilapia fillet (3 oz / 84 g)',
    source: 'Costco 2 lb box label — 210 kcal per 4 oz serving (about 1⅓ fillet) × ¾'
  },
  // Cuisine Solutions sous-vide sliced grass-fed beef sirloin (Costco, two ~1 lb packs), label
  // (Jim, 2026-10-26): 120 kcal / 5 g fat / 1 g carbs / 19 g protein per 3 oz (84 g).
  cuisine_solutions_sirloin_3oz: {
    kcal: 120, protein_g: 19, carbs_g: 1, fat_g: 5,
    portion: '3 oz Cuisine Solutions sliced grass-fed beef sirloin',
    source: 'package label — 3 oz (84 g) serving'
  },
  // Chomps Original Beef, mild (Costco 12-pack), per 1.15 oz stick.
  chomps_beef_stick: {
    kcal: 100, protein_g: 10, carbs_g: 0, fat_g: 6,
    portion: '1 Chomps original beef stick (1.15 oz)',
    source: 'https://www.costco.com/p/-/chomps-original-beef-sticks-mild-12-individually-wrapped-sticks/100741625 — per stick'
  },
  // The protein shake is a Fairlife bottle, read as the Nutrition Plan 30 g shake Costco sells
  // (11.5 fl oz: 150 kcal / 30 g protein / 4 g carbs / 2.5 g fat) — CONFIRM which Fairlife (Core
  // Power 26 g is 170 kcal; Core Power Elite 42 g is 230 kcal). Added creatine (5+ g) has no
  // calories, so "protein + creatine" is the same bottle.
  fairlife_shake: {
    kcal: 150, protein_g: 30, carbs_g: 4, fat_g: 2.5,
    portion: '1 Fairlife Nutrition Plan 30 g protein shake (11.5 fl oz)',
    source: 'Fairlife Nutrition Plan label — confirm it isn\'t Core Power (170 kcal / 26 g) or Core Power Elite (230 kcal / 42 g)'
  },
  // Panera's You Pick Two, as Jim orders it. Panera's menu pages give the half sandwich and the
  // cup; the side that comes with the combo (baguette / chips / apple) is NOT counted — confirm.
  panera_chipotle_chicken_avo_melt_half: {
    kcal: 460, protein_g: 27, carbs_g: 36, fat_g: 23,
    portion: '½ Panera Chipotle Chicken Avocado Melt',
    source: 'https://www.panerabread.com/en-us/menu/products/chipotle-chicken-avo-melt.html — half'
  },
  panera_broccoli_cheddar_cup: {
    kcal: 240, protein_g: 9, carbs_g: 19, fat_g: 15,
    portion: '1 cup Panera Broccoli Cheddar Soup',
    source: 'https://www.panerabread.com/en-us/menu/products/broccoli-cheddar-soup.html — cup'
  },
  // Kirkland Signature frozen cheese pizza (4-ct). Databases put a quarter (129 g) at ~310 kcal /
  // 13 g protein / 38 g carbs / 12 g fat; confirm against the box. A sitting is read as HALF a
  // pizza — confirm.
  kirkland_cheese_pizza_quarter: {
    kcal: 310, protein_g: 13, carbs_g: 38, fat_g: 12,
    portion: '¼ Kirkland Signature frozen cheese pizza (129 g)',
    source: 'https://sameday.costco.com/store/costco/products/30573251-kirkland-signature-cheese-pizza-4-ct — per-quarter figures from nutrition databases; confirm against the box'
  },
  // Kirkland Signature frozen pepperoni pizza (4-ct): a quarter (153 g) is 410 kcal / 18 g protein
  // on the box per listings; carbs and fat not quoted — estimated for a pepperoni quarter.
  kirkland_pepperoni_pizza_quarter: {
    kcal: 410, protein_g: 18, carbs_g: 40, fat_g: 19,
    portion: '¼ Kirkland Signature frozen pepperoni pizza (153 g)',
    source: 'Costco 4-pack listing — 410 kcal / 18 g protein per quarter; carbs and fat estimated'
  },
  // Tombstone Original Thin Crust CHEESE: no label found; ESTIMATED from the pepperoni quarter
  // less the pepperoni (~20 kcal and 3 g fat).
  tombstone_thin_crust_cheese_quarter: {
    kcal: 320, protein_g: 15, carbs_g: 34, fat_g: 13,
    portion: '¼ Tombstone Original Thin Crust Cheese pizza',
    source: 'estimated from the pepperoni label — confirm against the box'
  },
  // Chipotle's published per-ingredient figures (chipotle.com nutrition calculator): chicken
  // 180/32P/0C/7F, white rice 210/4/40/4, black beans 130/8/22/1.5, fresh tomato salsa 25/0/4/0,
  // roasted chili-corn salsa 80/3/16/1.5, tomatillo red-chili salsa 30/0/4/0, cheese 110/6/1/8,
  // lettuce 5/0/1/0 — Jim's bowl, every time. The burrito is the same plus the flour tortilla.
  chipotle_chicken_bowl_fixings: {
    kcal: 770, protein_g: 53, carbs_g: 88, fat_g: 22,
    portion: 'Chipotle chicken, white rice, black beans, pico + corn + hot salsas, cheese, lettuce',
    source: 'https://www.chipotle.com/nutrition-calculator — sum of the listed ingredients'
  },
  chipotle_flour_tortilla: {
    kcal: 320, protein_g: 8, carbs_g: 50, fat_g: 9,
    portion: '1 Chipotle burrito-size flour tortilla',
    source: 'https://www.chipotle.com/nutrition-calculator'
  },
  // DiGiorno Rising Crust Pepperoni (24.7 oz): the box is per 1/5 pizza, ~310 kcal / 13 g
  // protein / 35 g carbs / 13 g fat. A sitting is read as HALF the pizza (2.5 servings) — CONFIRM.
  digiorno_rising_crust_pepperoni_fifth: {
    kcal: 310, protein_g: 13, carbs_g: 35, fat_g: 13,
    portion: '⅕ DiGiorno Rising Crust Pepperoni pizza (140 g)',
    source: 'https://www.target.com/p/digiorno-rising-crust-pepperoni-frozen-pizza-24-7oz/-/A-90930511 — per-serving label'
  },
  // Steak 'n Shake: the Bacon 'n Cheese Double Steakburger is 680 kcal / 44 g fat / 35 g carbs /
  // 36 g protein on CalorieKing/FatSecret (other databases quote 480–510 for an older recipe —
  // confirm against the chain's current PDF). Small tots in beef tallow: no published figure
  // found, ESTIMATED from a small fries-sized portion.
  snS_bacon_cheese_double_steakburger: {
    kcal: 680, protein_g: 36, carbs_g: 35, fat_g: 44,
    portion: '1 Steak \'n Shake Bacon \'n Cheese Double Steakburger',
    source: 'https://www.calorieking.com/us/en/foods/f/calories-in-sandwiches-burgers-bacon-n-cheese-double-steakburger/ySnACQYkTQmDfiRuAsh62g'
  },
  snS_tater_tots_small: {
    kcal: 300, protein_g: 3, carbs_g: 32, fat_g: 18,
    portion: '1 small Steak \'n Shake beef-tallow tater tots',
    source: 'estimated (small fries-sized portion) — confirm'
  },
  // Petite Cuisine mozzarella sticks (Costco 5 lb bag): 210 kcal / 10 g protein / 19 g carbs /
  // 10 g fat per 3 sticks (76 g) — bag label confirmed by Jim 2026-10-26; per stick below.
  petite_cuisine_mozzarella_stick: {
    kcal: 70, protein_g: 3.3, carbs_g: 6.3, fat_g: 3.3,
    portion: '1 Petite Cuisine mozzarella stick (25 g)',
    source: 'https://sameday.costco.com/store/costco/products/58252-petite-cuisine-mozzarella-sticks-5-lb — 210 kcal per 3-stick serving ÷ 3'
  },
  // Daphne's beef & lamb gyro slices (Costco): 190 kcal / 16 g fat / 5 g carbs / 7 g protein per
  // 2 oz (57 g) serving — bag label confirmed by Jim 2026-10-26. A gyro takes about four slices;
  // a slice is read as ~1 oz, so four ≈ two servings.
  daphnes_gyro_slices_2oz: {
    kcal: 190, protein_g: 7, carbs_g: 5, fat_g: 16,
    portion: '2 oz Daphne\'s beef & lamb gyro slices',
    source: 'https://sameday.costco.com/store/costco/products/66322606-daphnes-beef-and-lamb-gyro-slices-16-oz-2pack — per 2 oz'
  },
  // The gyro fixings as Jim lists them: tzatziki, onion, tomato, cucumber, feta. ESTIMATED from
  // USDA generics (2 tbsp tzatziki ~40, the vegetables ~30, 1 oz feta 75).
  gyro_fixings: {
    kcal: 145, protein_g: 6, carbs_g: 10, fat_g: 9,
    portion: 'tzatziki, onion, tomato, cucumber and 1 oz feta',
    source: 'estimated from USDA generics'
  },
  pita_bread: {
    kcal: 165, protein_g: 5.5, carbs_g: 33, fat_g: 0.7,
    portion: '1 pita (6.5", 60 g)',
    source: 'USDA FoodData Central — bread, pita, white, enriched'
  },
  // Cuisine Adventures Grilled Cheese Style Tomato Soup: 270 kcal / 12 g protein / 24 g carbs /
  // 15 g fat per 255 g serving (databases; the 18 oz tub is two such servings — confirm whether
  // "tomato soup" is one serving or the tub).
  cuisine_adventures_tomato_soup_serving: {
    kcal: 270, protein_g: 12, carbs_g: 24, fat_g: 15,
    portion: '1 serving (255 g) Cuisine Adventures grilled-cheese-style tomato soup',
    source: 'https://www.instacart.com/store/products/17411388-cuisine-adventures-grilled-cheese-style-tomato-soup-18-oz — per 255 g serving'
  },
  // Tombstone Original Thin Crust Pepperoni: 340 kcal / 16 g fat / 15 g protein per ¼ pizza on
  // the retail label (carbs not quoted in the listings — ~33 g is typical for a thin-crust
  // quarter; confirm against the box). A sitting is read as HALF the pizza — CONFIRM.
  tombstone_thin_crust_pepperoni_quarter: {
    kcal: 340, protein_g: 15, carbs_g: 33, fat_g: 16,
    portion: '¼ Tombstone Original Thin Crust Pepperoni pizza',
    source: 'https://www.goodnes.com/tombstone/products/original-thin-crust-pepperoni-pizza/ — per-quarter label; carbs estimated'
  },
  // Fruit, USDA FoodData Central per piece / per cup.
  kiwi_whole: {
    kcal: 42, protein_g: 0.8, carbs_g: 10, fat_g: 0.4,
    portion: '1 whole green kiwi, skin on (~75 g)',
    source: 'USDA FoodData Central — kiwifruit, green, raw (the skin adds fiber, not calories)'
  },
  banana_medium: {
    kcal: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4,
    portion: '1 medium banana (118 g)',
    source: 'USDA FoodData Central — banana, raw, medium'
  },
  watermelon_cup: {
    kcal: 46, protein_g: 0.9, carbs_g: 11.5, fat_g: 0.2,
    portion: '1 cup diced watermelon (152 g)',
    source: 'USDA FoodData Central — watermelon, raw'
  },
  // Jim's serving (2026-10-26): a Costco mini seedless watermelon cut into two glass containers,
  // one container a sitting = half the melon. A mini is ~3–4 lb whole and ~60 % flesh, so a half
  // is read as ~475 g ≈ 3.1 cups — ESTIMATED; one weigh-in of a full container would pin it.
  mini_watermelon_half: {
    kcal: 143, protein_g: 2.9, carbs_g: 35.9, fat_g: 0.7,
    portion: '½ mini seedless watermelon (~475 g flesh, one container)',
    source: 'USDA FoodData Central — watermelon, raw, per 100 g × 4.75 (half a mini, estimated)'
  },
  // More fruit, USDA per cup / per piece.
  strawberries_cup: {
    kcal: 53, protein_g: 1.1, carbs_g: 12.7, fat_g: 0.5,
    portion: '1 cup sliced strawberries (166 g)',
    source: 'USDA FoodData Central — strawberries, raw'
  },
  cherries_cup: {
    kcal: 87, protein_g: 1.5, carbs_g: 22, fat_g: 0.3,
    portion: '1 cup sweet cherries with pits (138 g)',
    source: 'USDA FoodData Central — cherries, sweet, raw'
  },
  apple_medium: {
    kcal: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3,
    portion: '1 medium apple (182 g)',
    source: 'USDA FoodData Central — apples, raw, with skin, medium'
  },
  // Canned whipped cream (Reddi-wip original): 15 kcal / 1 g fat / 1 g carbs per 2 tbsp.
  whipped_cream_can_2tbsp: {
    kcal: 15, protein_g: 0, carbs_g: 1, fat_g: 1,
    portion: '2 tbsp canned whipped cream',
    source: 'Reddi-wip Original label — per 2 tbsp (5 g)'
  },
  // Kirkland Signature Steak Strips (the jerky): 60 kcal / 0.5 g fat / 5 g carbs / 9 g protein
  // per 1 oz (28 g), bag label (Jim, 2026-10-26).
  kirkland_steak_strips_oz: {
    kcal: 60, protein_g: 9, carbs_g: 5, fat_g: 0.5,
    portion: '1 oz Kirkland Signature steak strips',
    source: 'bag label — per 1 oz (28 g) serving, 12 per bag'
  },
  // Cloud 9 Mango Sticky Rice rice crispies (180 Snacks, Costco 21-ct bag), bag label (Jim,
  // 2026-10-26): 190 kcal / 7 g fat / 31 g carbs / 1 g protein per 1 bar (43 g).
  cloud9_mango_sticky_rice_bar: {
    kcal: 190, protein_g: 1, carbs_g: 31, fat_g: 7,
    portion: '1 Cloud 9 Mango Sticky Rice crispy bar (43 g)',
    source: 'bag label — per bar, 21 per bag'
  },
  // Tattooed Chef Sheet Pan Vegetables (Costco 4 lb bag; brussels, sweet potato, broccoli, red
  // onion, zucchini): 120 kcal / 9 g fat / 11 g carbs / 2 g protein per 1 cup (125 g), bag label
  // (Jim, 2026-10-26).
  tattooed_chef_veggies_cup: {
    kcal: 120, protein_g: 2, carbs_g: 11, fat_g: 9,
    portion: '1 cup Tattooed Chef sheet pan vegetables (125 g)',
    source: 'bag label — per 1 cup (125 g) serving, Costco item 1684687'
  },
  // Portillo's (figures Jim pulled from Portillo's nutrition, Oct 2026): Big Beef 1,040 kcal /
  // 51 g fat / 88 g carbs / 50 g protein; regular Italian Beef 690 / 34 / 59 / 33. He orders
  // either with sweet peppers and mozzarella — the add-ons are estimated.
  portillos_big_beef: {
    kcal: 1040, protein_g: 50, carbs_g: 88, fat_g: 51,
    portion: '1 Portillo\'s Big Beef sandwich',
    source: 'Portillo\'s nutrition menu (https://www.portillos.com/menu/)'
  },
  portillos_italian_beef: {
    kcal: 690, protein_g: 33, carbs_g: 59, fat_g: 34,
    portion: '1 Portillo\'s regular Italian Beef sandwich',
    source: 'Portillo\'s nutrition menu (https://www.portillos.com/menu/)'
  },
  portillos_peppers_and_mozzarella: {
    kcal: 115, protein_g: 6, carbs_g: 4, fat_g: 6,
    portion: 'sweet peppers + melted mozzarella on a Portillo\'s beef',
    source: 'estimated: ~1 oz mozzarella (85 kcal) + sweet peppers (~30 kcal)'
  },
  // Kirkland grilled chipotle-seasoned chicken (2 lb, Costco): ~110 kcal / 21 g protein / 1 g
  // carbs / 2.5 g fat per 3 oz (84 g) — confirm against the bag.
  kirkland_chipotle_chicken_3oz: {
    kcal: 110, protein_g: 21, carbs_g: 1, fat_g: 2.5,
    portion: '3 oz Kirkland grilled chipotle-seasoned chicken',
    source: 'https://sameday.costco.com/store/costco/products/120233576-grilled-chipotle-seasoned-chicken-2-lb — per 3 oz'
  },
  // Quesadilla and taco building blocks, USDA generics.
  flour_tortilla_large: {
    kcal: 210, protein_g: 6, carbs_g: 36, fat_g: 5,
    portion: '1 large (10") flour tortilla',
    source: 'USDA FoodData Central — tortilla, flour, ~70 g'
  },
  corn_tortilla: {
    kcal: 50, protein_g: 1.3, carbs_g: 10.5, fat_g: 0.7,
    portion: '1 corn tortilla (6", 26 g)',
    source: 'USDA FoodData Central — tortilla, corn'
  },
  shredded_cheese_1_5oz: {
    kcal: 170, protein_g: 10, carbs_g: 1, fat_g: 14,
    portion: '1.5 oz shredded cheese (~⅓ cup)',
    source: 'USDA FoodData Central — cheddar/Mexican blend'
  },
  pico_de_gallo_2tbsp: {
    kcal: 10, protein_g: 0.4, carbs_g: 2, fat_g: 0,
    portion: '2 tbsp pico de gallo',
    source: 'USDA FoodData Central — salsa, fresh'
  },
  // A coworker's fresh-baked sourdough with butter: a thick slice (~2 oz) is ~160 kcal / 6 g
  // protein / 31 g carbs / 1 g fat, plus ½ tbsp butter (~50 kcal, 6 g fat). ESTIMATED — homemade
  // bread has no label.
  sourdough_slice_buttered: {
    kcal: 210, protein_g: 6, carbs_g: 31, fat_g: 7,
    portion: '1 thick slice of fresh sourdough (~2 oz) with butter',
    source: 'estimated: USDA sourdough bread per 57 g + ½ tbsp butter'
  },
  // "Good quality" frozen breaded chicken strips from the air fryer — brand not named; a lightly
  // breaded breast strip (~1.5 oz) is about 80 kcal / 8 g protein / 6 g carbs / 3 g fat. CONFIRM
  // the brand and the count (2–4 → read as 3).
  // Realgood Foods lightly breaded chicken strips (Costco 3 lb bag), bag label (Jim, 2026-10-26):
  // 120 kcal / 5 g fat / 4 g carbs / 21 g protein per 4 oz (112 g). A strip is read as ~1.5 oz
  // (⅜ of a serving) — the bag gives no count per serving.
  breaded_chicken_strip: {
    kcal: 45, protein_g: 7.9, carbs_g: 1.5, fat_g: 1.9,
    portion: '1 Realgood lightly breaded chicken strip (~1.5 oz), air-fried',
    source: 'Realgood bag label — 120 kcal per 4 oz serving × ⅜ (strip weight estimated)'
  }
} as const satisfies Record<string, LibraryItem>

export type ItemKey = keyof typeof ITEMS

export interface LibraryMeal {
  /** The canonical spelling — what a matched entry is saved as. */
  text: string
  /** Other spellings it has been logged under (any spelling with the same key resolves anyway). */
  aliases?: string[]
  /** [item, how many]. */
  parts: Array<[ItemKey, number]>
  /** What the meal is, for the chip's tooltip. */
  note?: string
  /**
   * How the serving counts in its own unit, for a typed count or fraction (nutrition.ts
   * splitCount): "1 beef stick" against { count: 2, unit: 'stick' } is half a serving; "whole
   * costco pizza" against { count: 4, unit: 'slice', whole: 8 } is two. Only meals whose serving
   * is more than one of something need it — a bare count on a meal without one just multiplies.
   */
  portion?: MealPortion
}

export const MEAL_LIBRARY: LibraryMeal[] = [
  // The most-logged breakfast (40× as of Oct 2026); "2 x costco bacon egg and cheese" is two of them.
  {
    text: 'costco bacon egg and cheese',
    aliases: ['costco bec', 'kirkland breakfast sandwich', 'costco breakfast sandwich', 'bacon egg and cheese croissant'],
    parts: [['kirkland_breakfast_sandwich', 1]],
    note: 'the Kirkland frozen croissant breakfast sandwich'
  },
  {
    text: 'grilled cheese + guac',
    parts: [['lilys_grilled_cheese', 1], ['kirkland_guac_cup', 1]],
    note: 'the Costco frozen grilled cheese with one guac cup; "2 x" is two of each'
  },
  {
    text: 'mcdonalds double cheeseburger + fries',
    aliases: ['mcdonalds double cheeseburger + small fries', 'mcdonalds'],
    parts: [['mcd_double_cheeseburger_plain', 1], ['mcd_fries_small', 1]],
    note: 'the usual: plain double cheeseburger, small fries'
  },
  // The breakfast meal: the drink is logged in the soda tracker (or is coffee), so it's not here.
  {
    text: 'mcdonalds breakfast',
    aliases: [
      'sausage egg and cheese mcmuffin + hashbrown', 'sausage egg + cheese mcmuffin + hash brown', 'sausage mcmuffin + hashbrown',
      'mcmuffin + hashbrown', 'mcdonalds mcmuffin + hashbrown', 'mcdonalds mcmuffin meal', 'mcmuffin meal'
    ],
    parts: [['mcd_sausage_egg_cheese_mcmuffin', 1], ['mcd_hash_brown', 1]],
    note: 'the usual: Sausage, Egg & Cheese McMuffin + hash brown (drink not counted)'
  },
  // Logged 23 times as of Oct 2026. Read here as two burgers and ONE small fries, which overrides
  // the general "N x doubles everything" rule for this text — CONFIRM with Jim; if it really is two
  // of each, delete this entry and the rule takes over.
  {
    text: '2 x mcdonalds double cheeseburger + fries',
    aliases: ['2 x mcdonalds double cheeseburger + small fries'],
    parts: [['mcd_double_cheeseburger_plain', 2], ['mcd_fries_small', 1]],
    note: 'the usual order: two plain double cheeseburgers, one small fries (confirmed 2026-10-26)'
  },
  // The rice-cooker bowls: a cup of rice, eight seared hot-pot beef rolls, the pan sauce, and
  // steamed broccoli when the text says so. (Word order doesn't matter to the key, so "beef +
  // rice bowl" is the same entry as "rice + beef bowl".)
  {
    text: 'rice + beef + broccoli bowl',
    aliases: ['rice + beef + broccoli', 'beef + broccoli + rice'],
    parts: [['rice_uncooked_cup', 1], ['costco_hot_pot_beef_rolls_8', 1], ['broccoli_steamed_cup', 1], ['wok_sauce_bowl', 1]],
    note: 'the whole cup of rice-cooker rice, 8 hot-pot beef rolls seared in the wok (confirmed), steamed broccoli, the soy–mirin sauce'
  },
  {
    text: 'rice + beef bowl',
    aliases: ['rice + beef'],
    parts: [['rice_uncooked_cup', 1], ['costco_hot_pot_beef_rolls_8', 1], ['wok_sauce_bowl', 1]],
    note: 'the beef bowl without broccoli'
  },
  // Rice with 2–4 air-fried Realgood strips, read as THREE — confirm the count.
  {
    text: 'rice + chicken',
    aliases: ['chicken + rice', 'rice + chicken strips', 'rice + chicken bowl'],
    parts: [['rice_uncooked_cup', 1], ['breaded_chicken_strip', 3]],
    note: 'the whole cup of rice-cooker rice with three air-fried Realgood strips (assumed three — confirm)'
  },
  // Rice on its own, so "rice + <anything known>" composes (nutrition.ts splitParts): the pot is
  // always one cup uncooked, eaten in one sitting (Jim, 2026-10-26).
  {
    text: 'rice',
    aliases: ['white rice', 'rice cooker rice', 'long grain rice'],
    parts: [['rice_uncooked_cup', 1]],
    note: 'one cup uncooked long-grain white rice from the cooker, the whole pot'
  },
  {
    text: 'leftover rice',
    parts: [['rice_cooked_cup', 1]],
    note: 'a cup of cooked rice from the fridge'
  },
  // The sous-vide sirloin: two ~1 lb packs, half a pack (~8 oz) a meal (Jim, 2026-10-26).
  {
    text: 'costco grass fed beef sirloin slices',
    aliases: ['grass fed beef sirloin slices', 'grass fed sirloin slices', 'sirloin slices', 'beef sirloin slices', 'costco sirloin slices', 'grass fed sirloin', 'sliced sirloin'],
    parts: [['cuisine_solutions_sirloin_3oz', 8 / 3]],
    note: 'half a ~1 lb pack (~8 oz) of Cuisine Solutions sliced grass-fed sirloin'
  },
  // The air-fried Realgood strips on their own ("chicken + roasted veggies + rice" composes).
  {
    text: 'chicken strips',
    aliases: ['chicken', 'realgood chicken strips', 'breaded chicken strips', 'chicken tenders', 'air fried chicken'],
    parts: [['breaded_chicken_strip', 3]],
    note: 'three air-fried Realgood lightly breaded strips (assumed three — type a count to change it)',
    portion: { count: 3, unit: 'strip' }
  },
  // Tattooed Chef sheet pan vegetables; a plate is read as 1.5 cups — ESTIMATED, confirm.
  {
    text: 'roasted veggies',
    aliases: ['veggies', 'roasted vegetables', 'sheet pan veggies', 'sheet pan vegetables', 'tattooed chef veggies'],
    parts: [['tattooed_chef_veggies_cup', 1.5]],
    note: '1½ cups of Tattooed Chef sheet pan vegetables (assumed — confirm the share)',
    portion: { count: 1.5, unit: 'cup' }
  },
  // The mango sticky rice crispy bar, one a snack; "2 mango sticky rice bars" for two.
  {
    text: 'mango sticky rice bar',
    aliases: ['mango sticky rice rice crispies', 'mango sticky rice crispies', 'mango sticky rice', 'mango rice crispies', 'cloud 9 mango sticky rice', 'cloud9 mango sticky rice', 'mango sticky rice crispy bar'],
    parts: [['cloud9_mango_sticky_rice_bar', 1]],
    note: 'one Cloud 9 Mango Sticky Rice crispy bar',
    portion: { count: 1, unit: 'bar' }
  },
  // Kirkland steak strips; a snack is read as 2 oz — ESTIMATED, confirm.
  {
    text: 'jerky',
    aliases: ['beef jerky', 'kirkland steak strips', 'steak strips', 'kirkland jerky', 'steak strips jerky'],
    parts: [['kirkland_steak_strips_oz', 2]],
    note: '2 oz of Kirkland Signature steak strips (assumed two servings — confirm)',
    portion: { count: 2, unit: 'oz' }
  },
  // "Costco pizza" in any wording is the frozen Kirkland cheese box (Jim, 2026-10-20), half a
  // pizza a sitting — CONFIRM the share. Leftovers are 2–4 slices of eight, read as three.
  {
    text: 'costco cheese pizza',
    aliases: ['costco pizza', 'kirkland cheese pizza', 'kirkland pizza', 'costco frozen cheese pizza', 'costco frozen pizza'],
    parts: [['kirkland_cheese_pizza_quarter', 2]],
    note: 'half a Kirkland frozen cheese pizza, 4 of 8 slices — "whole costco pizza" or "8 slices costco pizza" for the whole one (Jim, 2026-10-26)',
    portion: { count: 4, unit: 'slice', whole: 8 }
  },
  {
    text: 'leftover costco pizza',
    aliases: ['leftover pizza', 'leftover costco cheese pizza', 'cold costco pizza'],
    parts: [['kirkland_cheese_pizza_quarter', 1.5]],
    note: '2–4 slices (of 8) of leftover Kirkland cheese pizza, read as 3 — type a count to change it',
    portion: { count: 3, unit: 'slice', whole: 8 }
  },
  {
    text: 'costco pepperoni pizza',
    aliases: ['kirkland pepperoni pizza'],
    parts: [['kirkland_pepperoni_pizza_quarter', 2]],
    note: 'half a Kirkland frozen pepperoni pizza, 4 of 8 slices',
    portion: { count: 4, unit: 'slice', whole: 8 }
  },
  {
    text: 'leftover costco pepperoni pizza',
    aliases: ['leftover pepperoni pizza'],
    parts: [['kirkland_pepperoni_pizza_quarter', 1.5]],
    note: '2–4 slices (of 8) of leftover Kirkland pepperoni pizza, read as 3 — type a count to change it',
    portion: { count: 3, unit: 'slice', whole: 8 }
  },
  // Read as ONE fillet on a cup of rice — CONFIRM (two fillets would be a second entry or "2 x").
  {
    text: 'rice + tilapia',
    aliases: ['tilapia + rice', 'rice + tilapia filet'],
    parts: [['rice_uncooked_cup', 1], ['sea_cuisine_tilapia_fillet', 1]],
    note: 'the whole cup of rice-cooker rice with one Sea Cuisine tortilla-crusted fillet (assumed one — type a count to change it)'
  },
  {
    text: 'tilapia',
    aliases: ['tilapia filet', 'tilapia fillet', 'sea cuisine tilapia'],
    parts: [['sea_cuisine_tilapia_fillet', 1]],
    note: 'one Sea Cuisine tortilla-crusted fillet',
    portion: { count: 1, unit: 'fillet' }
  },
  // "Beef sticks": two Chomps unless a count is typed — "1 beef stick", "3 beef sticks" (Jim,
  // 2026-10-26: usually two, sometimes one).
  {
    text: 'beef sticks',
    aliases: ['beef stick', 'chomps', 'chomps beef sticks'],
    parts: [['chomps_beef_stick', 2]],
    note: 'two Chomps original beef sticks — type "1 beef stick" for one',
    portion: { count: 2, unit: 'stick' }
  },
  // Every spelling of the shake in the log (four as of Oct 2026) is one Fairlife bottle; the
  // creatine adds nothing. Aliases cover the wordings the key doesn't already fold.
  {
    text: 'protein + creatine shake',
    aliases: ['protein shake', 'protein + creatine', 'fairlife', 'fairlife shake', 'fairlife + creatine', 'protein fruit smoothie'],
    parts: [['fairlife_shake', 1]],
    note: 'a Fairlife shake, with 5+ g creatine stirred in on most days'
  },
  // Chipotle: the bowl and the burrito are the same fixings; the burrito adds the tortilla.
  // "Chicken + Rice burrito bowl" (logged 6×) is read as the Chipotle bowl — CONFIRM.
  {
    text: 'chipotle chicken burrito bowl',
    aliases: ['chipotle bowl', 'chipotle chicken bowl', 'chicken + rice burrito bowl', 'chipotle burrito bowl'],
    parts: [['chipotle_chicken_bowl_fixings', 1]],
    note: 'the usual bowl: white rice, black beans, chicken, pico/corn/hot salsas, cheese, lettuce'
  },
  {
    text: 'chipotle chicken burrito',
    aliases: ['chipotle burrito', 'chipotle'],
    parts: [['chipotle_chicken_bowl_fixings', 1], ['chipotle_flour_tortilla', 1]],
    note: 'the usual fixings in a flour tortilla'
  },
  // Half a DiGiorno Rising Crust Pepperoni — CONFIRM the share.
  {
    text: 'digiorno pizza',
    aliases: ['digiorno', 'digiorno pepperoni pizza', 'digiorno rising crust pepperoni'],
    parts: [['digiorno_rising_crust_pepperoni_fifth', 2.5]],
    note: 'half a DiGiorno Rising Crust Pepperoni (assumed half — confirm)'
  },
  // 1–2 buttered slices, read as 1.5 — CONFIRM.
  {
    text: 'sourdough snack',
    aliases: ['sourdough', 'sourdough + butter', 'sourdough toast'],
    parts: [['sourdough_slice_buttered', 1.5]],
    note: 'homemade sourdough with butter, 1–2 slices (read as 1.5 — "2 slices sourdough" to say which)',
    portion: { count: 1.5, unit: 'slice' }
  },
  // Half a Tombstone thin-crust, pepperoni or cheese (same share, Jim 2026-10-20) — CONFIRM the share.
  {
    text: 'tombstone pizza',
    aliases: ['tombstone', 'tombstone pepperoni pizza', 'tombstone thin crust pepperoni'],
    parts: [['tombstone_thin_crust_pepperoni_quarter', 2]],
    note: 'half a Tombstone Original Thin Crust Pepperoni (assumed half — confirm)'
  },
  {
    text: 'tombstone cheese pizza',
    aliases: ['tombstone thin crust cheese'],
    parts: [['tombstone_thin_crust_cheese_quarter', 2]],
    note: 'half a Tombstone Original Thin Crust Cheese (figures estimated from the pepperoni label)'
  },
  // One serving of the soup — CONFIRM (the whole 18 oz tub is "2 x tomato soup").
  {
    text: 'tomato soup',
    aliases: ['grilled cheese tomato soup', 'cuisine adventures tomato soup'],
    parts: [['cuisine_adventures_tomato_soup_serving', 1]],
    note: 'Cuisine Adventures grilled-cheese-style tomato soup, one serving (assumed — the tub is two)'
  },
  // Gyros (Jim, 2026-10-20): 4.5 oz of Daphne's slices, the fixings, and a pita.
  {
    text: 'gyros',
    aliases: ['gyro', 'gyro plate', 'daphnes gyros', 'gyros bowl'],
    parts: [['daphnes_gyro_slices_2oz', 2], ['gyro_fixings', 1], ['pita_bread', 1]],
    note: 'about four Daphne\'s beef & lamb slices (~4 oz) in a pita with tzatziki, onion, tomato, cucumber, feta',
    portion: { count: 4, unit: 'slice' }
  },
  // About ten sticks a sitting (Jim, 2026-10-26) — "6 mozzarella sticks" for fewer.
  {
    text: 'mozzarella sticks',
    aliases: ['mozzarella stick', 'mozz sticks', 'cheese sticks'],
    parts: [['petite_cuisine_mozzarella_stick', 10]],
    note: 'about 10 Petite Cuisine sticks from the air fryer',
    portion: { count: 10, unit: 'stick' }
  },
  // Fruit as logged; a bare count multiplies ("2 kiwi").
  { text: 'kiwi', aliases: ['kiwi fruit', 'golden kiwi', 'green kiwi'], parts: [['kiwi_whole', 1]] },
  { text: 'banana', parts: [['banana_medium', 1]] },
  { text: 'apple', parts: [['apple_medium', 1]] },
  { text: 'strawberries', parts: [['strawberries_cup', 1]], portion: { count: 1, unit: 'cup' } },
  { text: 'cherries', parts: [['cherries_cup', 1]], portion: { count: 1, unit: 'cup' } },
  // Strawberries with a little canned whipped cream on each (Jim, 2026-10-26) — read as 4 tbsp.
  {
    text: 'strawberries + cream',
    aliases: ['strawberries and cream', 'strawberries with whipped cream', 'strawberries + whipped cream'],
    parts: [['strawberries_cup', 1], ['whipped_cream_can_2tbsp', 2]],
    note: 'a cup of strawberries with a little canned whipped cream (read as 4 tbsp)'
  },
  // One glass container = half a mini watermelon (Jim, 2026-10-26); "2 x watermelon" is both.
  {
    text: 'watermelon',
    aliases: ['watermelon chunks', 'half mini watermelon', 'mini watermelon half'],
    parts: [['mini_watermelon_half', 1]],
    note: 'one container, half a Costco mini watermelon (~3 cups; weight estimated)',
    portion: { count: 3.1, unit: 'cup' }
  },
  // Portillo's: either beef, always with sweet peppers and mozzarella.
  {
    text: 'portillos big beef',
    aliases: ['portillos big beef + peppers + mozzarella', 'big beef'],
    parts: [['portillos_big_beef', 1], ['portillos_peppers_and_mozzarella', 1]],
    note: 'Big Beef with sweet peppers and mozzarella'
  },
  {
    text: 'portillos beef',
    aliases: ['portillos italian beef', 'portillos', 'italian beef'],
    parts: [['portillos_italian_beef', 1], ['portillos_peppers_and_mozzarella', 1]],
    note: 'regular Italian Beef with sweet peppers and mozzarella'
  },
  // The chipotle chicken two ways. Quesadilla: one large tortilla, cheese, 3 oz chicken, pico.
  // Tacos: read as THREE corn tacos with 1.5 oz chicken each — CONFIRM the count.
  {
    text: 'chicken quesadilla',
    aliases: ['chicken quesadillas', 'chipotle chicken quesadilla'],
    parts: [['flour_tortilla_large', 1], ['shredded_cheese_1_5oz', 1], ['kirkland_chipotle_chicken_3oz', 1], ['pico_de_gallo_2tbsp', 1]],
    note: 'Kirkland chipotle chicken, cheese, one large flour tortilla, pico (assumed 3 oz chicken, 1.5 oz cheese — confirm)'
  },
  {
    text: 'chicken tacos',
    aliases: ['chicken taco', 'chipotle chicken tacos'],
    parts: [['corn_tortilla', 3], ['kirkland_chipotle_chicken_3oz', 1.5]],
    note: 'three corn tacos of Kirkland chipotle chicken with onion and cilantro (assumed 3 — confirm)'
  },
  // Steak 'n Shake usual: the bacon double with a small tots.
  {
    text: 'steak n shake bacon double cheeseburger + tots',
    aliases: ['steak n shake bacon double cheeseburger + tater tots', 'steak n shake bacon double steakburger + tots', 'steak n shake'],
    parts: [['snS_bacon_cheese_double_steakburger', 1], ['snS_tater_tots_small', 1]],
    note: 'Bacon \'n Cheese Double Steakburger + small beef-tallow tots'
  },
  // Panera: the You Pick Two — half Chipotle Chicken Avocado Melt + cup of Broccoli Cheddar.
  {
    text: 'panera soup + sandwich',
    aliases: ['panera you pick two', 'panera', 'panera sandwich + soup', 'panera half sandwich + soup'],
    parts: [['panera_chipotle_chicken_avo_melt_half', 1], ['panera_broccoli_cheddar_cup', 1]],
    note: 'You Pick Two: ½ Chipotle Chicken Avocado Melt + cup of Broccoli Cheddar (side not counted — confirm)'
  },
  // The parts on their own, so a sandwich without the guac (or a guac cup alone) resolves too.
  {
    text: 'lilys grilled cheese',
    aliases: ['lily\'s grilled cheese', 'costco grilled cheese', 'grilled cheese'],
    parts: [['lilys_grilled_cheese', 1]]
  },
  {
    text: 'kirkland guacamole cup',
    aliases: ['guac cup', 'kirkland guac', 'guac'],
    parts: [['kirkland_guac_cup', 1]]
  }
]

const round1 = (n: number) => Math.round(n * 10) / 10

function toEstimate(meal: LibraryMeal): Omit<MealEstimate, 'key'> {
  let kcal = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  const portions: string[] = []
  for (const [item, n] of meal.parts) {
    const it = ITEMS[item]
    kcal += it.kcal * n
    protein += it.protein_g * n
    carbs += it.carbs_g * n
    fat += it.fat_g * n
    portions.push(`${n !== 1 ? `${Math.round(n * 100) / 100} × ` : ''}${it.portion}`)
  }
  return {
    text: meal.text,
    kcal: Math.round(kcal),
    protein_g: round1(protein),
    carbs_g: round1(carbs),
    fat_g: round1(fat),
    confidence: 'high',
    assumptions: `${portions.join(' + ')}${meal.note ? ` — ${meal.note}` : ''}`,
    source: 'library',
    model: null,
    created_at: 'library',
    updated_at: 'library',
    ...(meal.portion ? { portion: meal.portion } : {})
  }
}

/** Every spelling the library answers to, keyed; aliases resolve to the canonical text. */
const BY_KEY: Map<string, MealEstimate> = (() => {
  const map = new Map<string, MealEstimate>()
  for (const meal of MEAL_LIBRARY) {
    const base = toEstimate(meal)
    for (const spelling of [meal.text, ...(meal.aliases ?? [])]) {
      const key = mealKey(spelling)
      if (key && !map.has(key)) map.set(key, { ...base, key })
    }
  }
  return map
})()

/** Each spelling with the canonical text it means — the library's side of "did you mean …?". */
export const LIBRARY_KNOWN: Array<{ text: string, key: string }> = [...BY_KEY.entries()].map(([key, e]) => ({ text: e.text, key }))

/** Every text and alias in the library, as written. */
export const LIBRARY_TEXTS: string[] = MEAL_LIBRARY.flatMap(m => [m.text, ...(m.aliases ?? [])])

/** The library's figures for a meal text, or null. Exact key only — quantities are nutrition.ts's job. */
export function libraryLookup(text: string | null | undefined): MealEstimate | null {
  const key = mealKey(text)
  return key ? BY_KEY.get(key) ?? null : null
}
