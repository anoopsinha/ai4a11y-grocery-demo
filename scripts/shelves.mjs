// What the store stocks, aisle by aisle. Each line is one search of Open Food
// Facts: { tag } takes the most-scanned products in a category, { text } looks
// for one staple by name. n is how many to keep; price is the simulated range
// in dollars for a pack of the usual size. not: words that mean a different product.
const t = (text, n, lo, hi, not) => ({ text, n, price: [lo, hi], not, max: 100 }); // nothing over 100 oz: those are catering packs
const c = (tag, n, lo, hi) => ({ tag, n, price: [lo, hi] });
const sp = (text, n, lo, hi, not) => ({ ...t(text, n, lo, hi, not), min: 0.4 }); // spices come in jars under 2 oz

export const SHELVES = [
  ['Produce', []],          // the hand-written counter (data/counter.json) fills this
  ['Meat & Seafood', [      // the counter, plus packaged meat
    t('bacon', 2, 5, 8, /bits|flavor|chip|cheese|ranch|dressing|jerky|turkey|bean|salad|pizza|burger|wrapped|mac|egg|dip|jam|popcorn/i),
    t('oven roasted turkey breast', 2, 4, 7), t('honey ham', 1, 4, 7, /turkey|cheese|sandwich|lunchable/i),
    t('beef franks', 1, 4, 6), t('smoked sausage', 1, 4, 6, /pizza|soup|gumbo|beans/i),
  ]],
  ['Eggs, Butter & Cream', [
    t('large eggs', 3, 3, 6, /noodle|salad|bites|sandwich|liquid|hard/i), t('salted butter', 2, 4, 6, /unsalted|peanut|cookie|cracker|popcorn|caramel|almond/i),
    t('unsalted butter', 1, 4, 6, /peanut|cookie|almond/i), t('heavy whipping cream', 2, 3, 6), t('sour cream', 2, 2, 4, /chip|onion|dip|cracker|pringles|potato|ranch|puffs/i),
    t('half and half', 1, 3, 5, /tea|lemonade|coffee drink/i),
  ]],
  ['Milk', [c('milks', 10, 2.5, 5), t('almond milk', 1, 3, 5, /chocolate|yogurt|ice cream|creamer/i), t('oat milk', 1, 4, 6, /chocolate|yogurt|ice cream|creamer/i)]],
  ['Cheese', [
    c('cheeses', 10, 3, 7), t('shredded mexican cheese', 2, 3, 5), t('shredded mozzarella', 1, 3, 5), t('shredded cheddar', 1, 3, 5),
    t('sharp cheddar cheese', 1, 3, 6, /cracker|puffs|popcorn|chips|snack|mac|shredded/i),
  ]],
  ['Yogurt', [c('yogurts', 10, 2, 5)]],
  ['Bread & Tortillas', [
    c('breads', 10, 3, 5.5), t('corn tortillas', 1, 2, 4, /chips/i), t('taco shells', 1, 2, 4, /kit/i), t('hamburger buns', 1, 3, 5),
    t('hot dog buns', 1, 3, 5), t('panko bread crumbs', 1, 2, 4),
  ]],
  ['Pasta', [
    c('pastas', 10, 1.5, 3.5), t('fettuccine', 2, 1.5, 3.5, /alfredo|chicken|sauce|shrimp|meal|bowl/i), t('linguine', 1, 1.5, 3.5, /sauce|clam|shrimp|chicken/i),
    t('lasagna', 1, 2, 4, /meat|sauce|frozen|cheese|vegetable|beef|sausage|soup|kit|dinner/i), t('elbow macaroni', 1, 1.5, 3, /cheese|salad/i), t('egg noodles', 1, 2, 4, /soup|chicken|beef|stroganoff/i),
  ]],
  ['Rice, Grains & Beans', [
    t('long grain white rice', 2, 2, 5, /wild|chicken|broccoli|pilaf|seasoned/i), t('brown rice', 1, 2, 5, /pasta|cake|syrup|penne|crisps|cereal|ramen|bread|noodle|cracker|chips|tortilla|milk/i),
    t('jasmine rice', 1, 3, 6, /chicken|coconut|meal|bowl/i), t('basmati rice', 1, 3, 6, /chicken|meal|bowl|curry/i),
    t('black beans', 2, 1, 2.5, /chips|soup|rice|burger|salsa|dip|corn|burrito|refried|pasta|spaghetti|sauce/i), t('pinto beans', 1, 1, 2.5, /refried|chips|rice|bacon/i),
    t('kidney beans', 1, 1, 2.5, /rice|chili/i), t('garbanzo beans', 1, 1, 2.5, /chips|snack|roasted|pasta/i), t('refried beans', 1, 1.5, 3, /burrito|chips|dip/i),
    t('lentils', 1, 2, 4, /soup|chips|pasta|curry|rice|snack|penne|rotini|spaghetti|elbow|fusilli/i), t('quinoa', 1, 4, 7, /chips|bar|pasta|salad|rice|bowl|burger|granola|puffs|cracker|bread|chocolate|cereal/i),
  ]],
  ['Sauces & Condiments', [
    t('alfredo sauce', 3, 2.5, 5, /chicken|fettuccine|pasta with|meal|bowl|pizza|mix/i), t('marinara sauce', 2, 2.5, 7, /stick|meatball|ravioli|chicken|with marinara|pizza/i),
    t('pasta sauce', 2, 2.5, 5, /alfredo|chicken|meatball|mix/i), t('salsa', 3, 2.5, 5, /chip|chicken|rice|beans|burrito|bowl|ranch|dressing|seasoning|verde chicken|cheese|tortilla|macha|con queso|dip mix/i),
    t('enchilada sauce', 1, 2, 4, /chicken|beef|cheese enchilada/i), t('soy sauce', 2, 2.5, 5, /chicken|noodle|rice|almond|cracker|snack/i), t('teriyaki sauce', 1, 3, 5, /chicken|beef|noodle|jerky|bowl/i),
    t('tomato ketchup', 1, 3, 5, /chips/i), t('yellow mustard', 1, 1.5, 3.5, /pretzel|seed/i), t('mayonnaise', 2, 4, 7, /tuna|salad|chicken|sandwich/i),
    t('barbecue sauce', 1, 2.5, 5, /chicken|pork|beef|chips|ribs|pizza/i), t('hot sauce', 1, 2.5, 5, /chicken|wings|chips|peanuts|jerky/i),
    t('ranch dressing', 2, 3, 5, /chicken|salad kit|chips|mix|wrap|chipotle|buffalo|bacon/i), t('caesar dressing', 2, 3, 5, /salad kit|chicken|wrap/i), t('italian dressing', 1, 3, 5, /chicken|salad kit|mix|sub/i),
    t('basil pesto', 1, 3.5, 6, /chicken|pasta|pizza|tortellini|ravioli|gnocchi/i),
  ]],
  ['Canned Goods', [
    t('diced tomatoes', 2, 1, 2.5, /chil/i), t('crushed tomatoes', 1, 1.5, 3), t('tomato sauce', 1, 1, 2, /sardine|mackerel|beans|ravioli|spaghetti|pasta|meatball|fish|herring|pizza/i),
    t('tomato paste', 1, 1, 2), t('chicken broth', 2, 2, 4, /noodle|rice|soup|ramen/i), t('beef broth', 1, 2, 4, /noodle|soup|ramen|stew/i), t('vegetable broth', 1, 2, 4, /noodle|soup/i),
    t('whole kernel corn', 1, 1, 2), t('cut green beans', 1, 1, 2), t('chunk light tuna', 2, 1, 3, /salad|kit/i), t('tomato soup', 2, 1.5, 3.5),
    t('chicken noodle soup', 2, 1.5, 3.5), t('cream of mushroom soup', 1, 1.5, 3), t('cream of chicken soup', 1, 1.5, 3, /rice|noodle/i),
    t('coconut milk', 1, 2, 4, /yogurt|ice cream|chocolate|beverage|drink|almond|powder|curry/i), t('diced green chiles', 1, 1, 2.5), t('black olives', 1, 2, 4, /pizza|hummus|bread|tapenade/i),
  ]],
  ['Oils, Spices & Baking', [
    t('extra virgin olive oil', 2, 7, 12, /mayo|chips|tuna|sardine|spray|cracker|bread|spread|butter|hummus|popcorn|dressing|sauce|garlic|tomato|mackerel|salmon|artichoke/i),
    t('vegetable oil', 1, 4, 6, /spread|spray|butter|shortening/i), t('canola oil', 1, 4, 6, /spray|mayo|spread/i),
    sp('sea salt', 1, 1.5, 4, /chip|cracker|almond|chocolate|caramel|popcorn|butter|nut|pretzel|pita|cashew|pistachio|vinegar|bar|thins|crisps|peanut|seed|edamame|kettle|puffs|cookie|fries|seaweed|hummus/i),
    sp('ground black pepper', 1, 2.5, 5, /salt|turkey|beef|bacon|chips|salami|tuna/i), sp('garlic powder', 1, 1.5, 4, /salt|onion|bread/i), sp('onion powder', 1, 1.5, 4, /garlic|salt/i),
    sp('chili powder', 1, 1.5, 4, /mango|lime|candy|chips/i), sp('ground cumin', 1, 2, 5), sp('paprika', 1, 2, 5, /chips|chicken|sausage|hummus|crisps|peanut|almond/i),
    sp('italian seasoning', 1, 2, 5, /chicken|bread|crumbs|tomato|sausage|dressing|croutons|panko/i), sp('oregano', 1, 2, 5, /tomato|sauce|chips|basil|pizza|feta|olive|cracker|garlic|cheese/i),
    sp('taco seasoning', 2, 1, 2.5, /chicken|beef|shell|kit|meat/i), sp('ground cinnamon', 1, 2, 5, /sugar|cereal|bread|roll|apple|oat/i),
    t('all purpose flour', 1, 3, 6, /gluten free|mix|tortilla/i), t('granulated sugar', 1, 3, 5, /garlic|onion|honey|maple|coconut|monk|stevia|substitute/i), t('light brown sugar', 1, 2.5, 4.5, /oat|cereal|ham|bacon|syrup|cinnamon|sausage/i),
    t('apple cider vinegar', 1, 3, 6, /gummies|drink|chips|dressing|tonic|shot|capsule/i), t('honey', 1, 5, 8, /cereal|nut|mustard|ham|graham|bunch|oat|granola|roasted|wheat|bbq|turkey|yogurt|bar|almond|peanut|comb|smack|bread|tea|pecan|cracker|chicken|butter|bear s|maid|sauce|lemon|ginger|drop|cough|vanilla|sriracha|hot/i),
    t('corn starch', 1, 1.5, 3.5, /baby|powder/i),
  ]],
  ['Frozen', [
    t('broccoli florets', 1, 2, 4, /cheese|rice|chicken|pasta|sauce|cauliflower/i), t('mixed vegetables', 1, 2, 4, /rice|chicken|soup|pasta|sauce|fruit|stir/i), t('sweet peas', 1, 1.5, 3.5, /carrot|snap|crisps|chips|soup/i),
    t('super sweet corn', 1, 1.5, 3.5), t('chopped spinach', 1, 1.5, 3.5, /pizza|dip|creamed/i), t('stir fry vegetables', 1, 2.5, 5, /chicken|beef|noodle|rice|sauce/i),
    t('french fries', 1, 3, 5.5, /chips|sweet potato|seasoning|burger/i), t('chicken nuggets', 1, 6, 9, /meal|fries|mac|kit|plant|veggie|lunchable/i), t('cheese pizza', 1, 4, 8, /lunchable|bagel|rolls|bites|snack|pocket|cracker|combos|cauliflower|kit/i),
    t('frozen blueberries', 1, 3.5, 6, /yogurt|waffle|pancake|muffin|bar/i), t('vanilla ice cream', 1, 4, 7, /sandwich|bar|cone|cookie|chocolate|caramel|cake|pie|brownie|fudge|chip|bean bars/i), t('riced cauliflower', 1, 2.5, 4.5, /chicken|cheese|pizza|bowl|stir/i),
  ]],
  ['Cereal', [c('breakfast-cereals', 10, 3.5, 6)]],
  ['Snacks', [
    c('crackers', 10, 3, 5), t('tortilla chips', 2, 3, 5, /soup|salsa|dip|chicken|seasoning|strips/i), t('potato chips', 1, 3, 5, /sweet potato|cookie|chocolate/i),
    t('microwave popcorn', 1, 3, 6), t('granola bars', 1, 3, 6),
  ]],
  ['Spreads', [c('nut-butters', 10, 3, 7), t('strawberry preserves', 1, 3, 5.5, /bar|cookie|yogurt|tart|pastry/i), t('grape jelly', 1, 2.5, 4.5, /peanut|sandwich|uncrustable|bar|meatball/i), t('hummus', 1, 3, 5.5, /chips|crisps|pretzel|snack|cracker|wrap|pita|veggie|sandwich|puffs/i)]],
  ['Juice', [c('fruit-juices', 10, 3, 5.5)]],
];
