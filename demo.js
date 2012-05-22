var Promise = promise.Promise;

var FAILURE_PROBABILITY = 0.00;

function assert(cond, message) {
  if (!cond)
    throw new Error(message);
}

/**
 * Returns a promise that resolves to the given value after a random short
 * delay.
 */
function withRandomDelay(thunk, mayFailOpt) {
  var delay = (Math.random() * 10) << 0;
  return withDelay(thunk, delay, mayFailOpt);
}

/**
 * Returns a promise that resolves to the given value after the given delay.
 */
function withDelay(thunk, delayOpt, mayFailOpt) {
  var delay = (Math.random() * 10) << 0;
  var result = new Promise();
  window.setTimeout(function () {
    var shouldFail = mayFailOpt && (Math.random() < FAILURE_PROBABILITY);
    if (shouldFail) {
      result.fail(new Error("*Blam*"));
    } else {
      var value;
      try {
        value = thunk();
      } catch (e) {
        result.fail(e);
        return;
      }
      result.fulfill(value);
    }
  }, delayOpt || 0);
  return result;
}

/**
 * A service that can return the given strings in blocks.
 */
function StringRepositoryService(strings, blockSizeOpt) {
  this.strings_ = strings;
  this.blockSize_ = blockSizeOpt || 16;
}

StringRepositoryService.prototype.getBlockSize = function () {
  return this.blockSize_;
};

/**
 * Returns a promise that attempts to fetch the strings from index 'from' to
 * index 'to', not inclusive.
 */
StringRepositoryService.prototype.get = function (from, to) {
  return withRandomDelay(function () {
    assert(0 <= from, "Argument 'from' out of bounds.");
    assert(to <= this.strings_.length, "Argument 'to' out of bounds.");
    assert(from <= to, "Arguments out of order.");
    assert(to - from <= this.blockSize_, "Fetching too many strings.");
    return this.strings_.slice(from, to);
  }.bind(this), true);
};

/**
 * Returns a promise that resolves to the number of strings in this
 * repository.
 */
StringRepositoryService.prototype.length = function () {
  return withRandomDelay(function () {
    return this.strings_.length;
  }.bind(this));
};

/**
 * A lazy array wraps a proxy object that allows values to be fetched in
 * blocks, and presents the underlying data as a list that can be iterated
 * using an asynchronous callback.
 */
function LazyArray(proxy) {
  this.proxy_ = proxy;
};

/**
 * Invokes the given callback for each element in this lazy array. Returns a
 * promise that fails if any of the requests to the underlying data fails,
 * and fulfills to this array if iteration is successful.
 */
LazyArray.prototype.forEach = function (callback) {
  var proxy = this.proxy_;
  var blockSize = proxy.getBlockSize();
  var result = new Promise();
  function processNextBlock(cursor, length) {
    if (cursor >= length) {
      // We're at the end; fulfill the status promise.
      result.fulfill(length);
      return;
    }
    var end = Math.min(cursor + blockSize, length);
    var fetch = proxy.get(cursor, end).then(function (block) {
      for (var i = 0; i < block.length; i++) {
        try {
          callback(block[i], cursor + i);
        } catch (e) {
          result.fail(e);
          return;
        }
      }
      processNextBlock(end, length);
    });
    fetch.forwardFailureTo(result);
  }
  proxy.length()
    .then(processNextBlock.bind(null, 0))
    .forwardFailureTo(result);
  return result;
};

function reportFailure(error, trace) {
  console.log(error.stack);
  console.log(trace.toString());
}

/**
 * Returns a promise that resolves to a list of letter pairs in the
 * string.
 */
function splitPairs(string) {
  return withDelay(function () {
    var elms = [];
    elms.push(" " + string.charAt(0));
    elms.push(string.charAt(string.length - 1) + " ");
    for (var i = 1; i < string.length; i++) {
      elms.push(string.slice(i-1, i+1));
    }
    return elms;
  });
}

/**
 * Returns a promise that resolves to a map from letter pairs to the number
 * of occurrences of those two letters after each other in the words contained
 * in the given lazy array/
 */
function countPairs(lazyArray) {
  var elms = {};
  var result = new Promise();
  var iterStatus = lazyArray.forEach(function (elm, i) {
    splitPairs(elm).then(function (pairs) {
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i];
        elms[pair] = (elms[pair] || 0) + 1;
      }
    }).forwardFailureTo(result);
  });
  iterStatus
      .onFulfilled(result.fulfill.bind(result, elms))
      .forwardFailureTo(result);
  return result;
}

/**
 * Returns a promise that resolves to the list of all single characters that
 * appear in the character pairs list.
 */
function getLetters(pairs) {
  return Promise.defer(function () {
    var elms = {};
    for (var pair in pairs) {
      if (!pairs.hasOwnProperty(pair))
        continue;
      assert(pair.length == 2);
      elms[pair[0]] = true;
      elms[pair[1]] = true;
    }
    var letters = [];
    for (var letter in elms) {
      if (elms.hasOwnProperty(letter))
        letters.push(letter);
    }
    letters.sort();
    return letters;
  });
}

function mapToVectors(pairs, letters) {
  return Promise.defer(function () {
    return letters;
  });
}

function splitPairsIntoArrays(pairs) {
  return getLetters(pairs)
    .lazyThen(mapToVectors.bind(null, pairs));
}

function lazyFib(n) {
  if (n == 0 || n == 1) {
    return Promise.of(1);
  } else {
    return Promise.deferLazy(function () {
      return Promise.join(lazyFib(n - 2), lazyFib(n - 1)).thenApply(function (a, b) {
        return a + b;
      });
    });
  }
}

function runDemo() {
  var strings = new StringRepositoryService(kRandomWords);
  var counts = countPairs(new LazyArray(strings))
      .lazyThen(splitPairsIntoArrays)
      .then(JSON.stringify);
  Promise.time(counts)
      .onFulfilled(console.log.bind(console))
      .onFailed(reportFailure);
}

// A list of random words.
var kRandomWords = [
  "aardvark", "abyssinian", "accountant", "acetone",
  "acid", "acorn", "acrobat", "actor", "actress", "aftershock",
  "agent", "air", "airplane", "airport", "albatross", "album",
  "alcohol", "alder", "alligator", "almond", "alsatian", "ambulance",
  "analyst", "anarchist", "angel", "angora", "ankle", "ant",
  "anteater", "ape", "apple", "apricot", "apron", "ark", "arm",
  "armadillo", "artichoke", "ash", "ass", "asteroid", "aunt",
  "automobile", "avenue", "avocado", "awk", "ax", "baboon",
  "bacterium", "badger", "bag", "balcony", "banana", "bank", "barge",
  "bark", "barley", "barn", "baron", "baroness", "basil", "bat",
  "bathroom", "battery", "beach", "beagle", "beaker", "bean", "bear",
  "beck", "bedroom", "beech", "beef", "beer", "beet", "beetle",
  "beetroot", "bengal", "bicycle", "bike", "biologist", "biplane",
  "birch", "bird", "biscuit", "bitch", "blackberry", "blackbird",
  "blackcurrant", "bloodhound", "blueberry", "bluebottle", "boar",
  "boat", "bobcat", "bobtail", "body", "bonobo", "book", "boot",
  "box", "boxer", "branch", "brandy", "bread", "bricklayer",
  "brochure", "bronze", "brother", "brush", "bud", "budgerigar",
  "bug", "buggy", "builder", "bulb", "bull", "bulldog", "bulldozer",
  "bullfrog", "bullmastiff", "burmese", "bus", "bush", "butcher",
  "butter", "butterfly", "button", "buzzard", "cab", "cabbage",
  "cabriolet", "cactus", "cake", "can", "canal", "candy", "canyon",
  "capacitor", "cappuccino", "car", "carbon", "card", "cardboard",
  "carnivore", "carrot", "cashew", "casino", "castle", "cat",
  "caterpillar", "catfish", "cavy", "cayenne", "ceiling", "celebrity",
  "cellphone", "cement", "centaur", "centipede", "chaffinch",
  "chainsaw", "chair", "chameleon", "chapel", "cheddar", "cheek",
  "cheese", "cheetah", "chef", "chemist", "cherry", "chest",
  "chestnut", "chick", "chicken", "chihuahua", "childminder", "chili",
  "chimera", "chimpanzee", "chin", "chisel", "chlorine", "chocolate",
  "chopper", "chrome", "church", "cider", "cinnamon", "circle",
  "city", "clam", "clay", "cliff", "clown", "coal", "coast", "coat",
  "cobalt", "cocoa", "coconut", "cod", "coffee", "collar", "collie",
  "comet", "communist", "concrete", "condor", "cone", "congressman",
  "congresswoman", "conifer", "conservative", "consultant", "cookie",
  "copper", "coriander", "corn", "cornflower", "cottage", "cotton",
  "cougar", "count", "countess", "cousin", "cow", "crab", "cranberry",
  "crater", "crayfish", "crayon", "cream", "crocodile", "crossroads",
  "crystal", "cube", "cucumber", "culdesac", "cup", "cupboard", "cur",
  "curry", "cuttlefish", "cyclops", "dachshund", "daffodil", "daisy",
  "dale", "dalmatian", "dandelion", "date", "daughter", "demigod",
  "denim", "desert", "diamond", "dictionary", "diesel", "dill",
  "dingo", "diode", "director", "doctor", "dog", "doll", "dolphin",
  "donkey", "door", "dragon", "drake", "dramatist", "drawer", "drill",
  "driver", "duchess", "duck", "duckling", "duke", "dumpster", "dust",
  "dwarf", "eagle", "ear", "earl", "earlobe", "earth", "earthquake",
  "earthworm", "economist", "eel", "egg", "elbow", "elderberry",
  "electrician", "elephant", "elf", "ellipse", "emerald", "emperor",
  "empress", "emu", "eruption", "escarpment", "estate", "evergreen",
  "ewe", "explosion", "eye", "eyebrow", "eyelid", "fairy", "falcon",
  "farmer", "fascist", "father", "faun", "fender", "fern", "ferret",
  "ferry", "feta", "field", "fig", "file", "finch", "finger", "fir",
  "fire", "firebird", "firefox", "fish", "float", "floor", "flour",
  "flower", "fluorine", "fly", "fog", "footpath", "forest", "fork",
  "fox", "frog", "fruit", "fuel", "gaffer", "gale", "game", "gander",
  "garage", "garlic", "gas", "gaullist", "gecko", "gherkin", "ghetto",
  "giant", "gibbon", "ginger", "giraffe", "glacier", "glade", "glass",
  "glue", "gnome", "goat", "goblin", "gold", "goldfish", "goo",
  "goose", "gooseberry", "gorilla", "governor", "grandfather",
  "grandmother", "grape", "grapefruit", "grass", "greengrocer",
  "greyhound", "griffin", "grisly", "grocer", "grouse", "gryphon",
  "guava", "guide", "gulch", "gull", "gulley", "guppy", "hail",
  "hair", "halfgiant", "halfling", "hall", "hallway", "halogen",
  "hamlet", "hammer", "handle", "hardboard", "hare", "harrier",
  "hawk", "hazelnut", "head", "headhunter", "hedge", "hedgehog",
  "heel", "helicopter", "helium", "hen", "herbivore", "herring",
  "hexagon", "hifi", "highway", "hill", "hillock", "hillside",
  "hippopotamus", "historian", "hobbit", "hoe", "hog", "holly",
  "honey", "hoof", "horse", "host", "hostess", "hotel", "hound",
  "house", "hovercraft", "human", "hurricane", "husky", "hut",
  "hyacinth", "hydra", "hydrogen", "hyena", "ice", "icicle", "iguana",
  "insect", "interchange", "intern", "iron", "ivy", "jaguar", "jam",
  "jet", "jigsaw", "joiner", "junction", "jungle", "juniper", "kale",
  "kangaroo", "kerosene", "key", "keyboard", "king", "kitchen",
  "kite", "kitten", "kiwi", "knee", "knife", "koala", "labourer",
  "labrador", "lady", "ladybird", "lake", "lamp", "larch", "larva",
  "latte", "lava", "lawnmower", "lawyer", "lead", "leaf", "leaflet",
  "lecturer", "leek", "leftist", "leg", "legging", "lemon", "lemur",
  "lentil", "leopard", "leprechaun", "letter", "lettuce", "lever",
  "liberal", "lichen", "lime", "limpet", "line", "linen", "linguist",
  "lion", "lip", "lizard", "lobster", "lock", "lord", "loudspeaker",
  "lumberjack", "lungfish", "lynx", "mackerel", "magazine",
  "magician", "mahogany", "maize", "mallet", "mama", "mammal",
  "manager", "mandarin", "mandrill", "mango", "mantis", "manx",
  "maple", "mare", "marigold", "marmalade", "marquess", "marquis",
  "marrow", "marsupial", "mathematician", "meadow", "medusa", "melon",
  "mercury", "metal", "meteor", "methanol", "metropolis", "midge",
  "midwife", "milk", "milkman", "millipede", "miner", "minister",
  "minivan", "mink", "minotaur", "mistletoe", "mocca", "mole",
  "monitor", "monkey", "monkeywrench", "monorail", "moon", "moped",
  "mosquito", "moss", "motel", "moth", "mother", "motorcycle",
  "motorway", "mould", "mountain", "mountainside", "mouse", "mouth",
  "mozilla", "mud", "mug", "mulberry", "mule", "mullet", "mussel",
  "mutton", "nanny", "narwhal", "nasturtium", "nautilus", "neck",
  "needle", "neon", "nettle", "newsreader", "newt", "nitrogen",
  "nose", "nostril", "novel", "novella", "nurse", "nymph", "oak",
  "oat", "ocean", "ocelot", "ocicat", "octopus", "office", "oil",
  "olive", "omnivore", "onion", "orange", "orangutang", "orc",
  "oregano", "osprey", "ostrich", "otter", "outhouse", "oval", "owl",
  "oxygen", "oyster", "pack", "padlock", "painter", "palace", "palm",
  "pan", "panda", "pansy", "panther", "pantry", "papa", "papaya",
  "paper", "paprika", "parcel", "parsley", "partridge", "path", "paw",
  "pea", "peach", "peanut", "pear", "pearl", "pedal", "peer",
  "pegasus", "pekingese", "pen", "pencil", "penguin", "pentagon",
  "pepper", "persian", "petrol", "petunia", "phoenix", "physician",
  "physicist", "pick", "pickaxe", "pickup", "pig", "pigeon", "pike",
  "pine", "pineapple", "pinnacle", "pinscher", "plain", "plane",
  "planet", "plank", "plaster", "plasterer", "plate", "plug", "plum",
  "plumber", "plutonium", "plywood", "pocket", "poem", "point",
  "pointer", "policeman", "policewoman", "politician", "pomegranate",
  "pony", "poodle", "poplar", "poppy", "pork", "port", "possum",
  "postcard", "potato", "pram", "predator", "present", "presenter",
  "president", "priest", "prince", "princess", "prion", "professor",
  "psychiatrist", "psychoanalyst", "pug", "puma", "pup", "puppy",
  "purse", "quarter", "queen", "quicksand", "rabbit", "raccoon",
  "radio", "radish", "ragamuffin", "ragdoll", "railroad", "railway",
  "rain", "raptor", "raspberry", "rat", "receptionist", "record",
  "rectangle", "redcurrant", "remote", "reptile", "reservoir",
  "resistor", "retriever", "rhinoceros", "rhubarb", "rib", "rice",
  "rightist", "ring", "river", "road", "robin", "rock", "rocket",
  "rollerskate", "room", "rooster", "rose", "rosemary", "rottweiler",
  "roundabout", "ruby", "rucksack", "rye", "sabretooth", "sack",
  "sailboat", "sailor", "salamander", "salesman", "saleswoman",
  "salmon", "salt", "sand", "sapphire", "sardine", "satchel",
  "satellite", "satsuma", "satyr", "saucepan", "saucer", "saw",
  "scallop", "schnauzer", "scientist", "scissors", "scooter",
  "scorpion", "screwdriver", "sea", "seagull", "seal", "seamonkey",
  "seasnake", "secretary", "segment", "senator", "shark", "shed",
  "sheep", "sheepdog", "shellfish", "shepherd", "sherry", "shin",
  "ship", "shoe", "shop", "shopkeeper", "shovel", "shrew", "shrimp",
  "shrubbery", "shuttle", "siamese", "silicon", "silk", "silver",
  "singer", "single", "sister", "skate", "sleet", "slime", "sloth",
  "slug", "slum", "slush", "smock", "snail", "snake", "snapdragon",
  "snow", "snowshoe", "socialist", "sociologist", "sock", "socket",
  "sodium", "sofa", "soil", "soldier", "son", "song", "sow", "space",
  "spaceship", "spade", "spaniel", "spanner", "sparrow",
  "sparrowhawk", "speedboat", "sphere", "sphinx", "spider",
  "spindoctor", "sponge", "spoon", "sportscar", "sprout", "spruce",
  "spy", "square", "squash", "squid", "squirrel", "staircase",
  "stallion", "star", "station", "steak", "steel", "stoat", "stone",
  "stool", "storm", "strawberry", "stream", "street", "strimmer",
  "sturgeon", "suburb", "sugar", "suitcase", "sun", "sunflower",
  "surgeon", "swan", "sweater", "swede", "swordfish", "syndicalist",
  "tabby", "table", "tadpole", "tail", "tailor", "tangerine", "tar",
  "tarantula", "tarmac", "taxi", "tea", "teacher", "teak", "teaspoon",
  "teddy", "telephone", "television", "temple", "terrier",
  "tetrahedron", "theologian", "thespian", "thigh", "thistle",
  "thumb", "thunderbird", "thyme", "tiger", "tin", "toad", "toast",
  "toe", "tomato", "tomcat", "tongue", "tonkinese", "torch",
  "tortoise", "town", "toy", "tractor", "trail", "train",
  "transformer", "transistor", "treacle", "tree", "treetop", "tremor",
  "triangle", "tricycle", "troll", "trousers", "trout", "truck",
  "truffle", "trunk", "tshirt", "tube", "tulip", "tuna", "tundra",
  "turkey", "turmeric", "turtle", "twig", "typhoon", "uncle",
  "undergrowth", "unicorn", "unicycle", "uranium", "vale", "valley",
  "vanilla", "veal", "verse", "vest", "vet", "veterinarian", "vicar",
  "village", "violet", "virus", "viscount", "viscountess", "vise",
  "vodka", "vole", "vulture", "wall", "wallaby", "wallet", "walnut",
  "walrus", "warbler", "wardrobe", "wasteland", "water", "watermelon",
  "weasel", "whale", "whalefish", "wheat", "wheel", "wheelchair",
  "wildcat", "window", "wine", "wing", "witch", "wizard", "wolf",
  "wolfhound", "wombat", "wool", "worm", "wren", "wrench", "wrist",
  "yeast", "yew", "yogurt",
    "aardvark", "abyssinian", "accountant", "acetone",
  "acid", "acorn", "acrobat", "actor", "actress", "aftershock",
  "agent", "air", "airplane", "airport", "albatross", "album",
  "alcohol", "alder", "alligator", "almond", "alsatian", "ambulance",
  "analyst", "anarchist", "angel", "angora", "ankle", "ant",
  "anteater", "ape", "apple", "apricot", "apron", "ark", "arm",
  "armadillo", "artichoke", "ash", "ass", "asteroid", "aunt",
  "automobile", "avenue", "avocado", "awk", "ax", "baboon",
  "bacterium", "badger", "bag", "balcony", "banana", "bank", "barge",
  "bark", "barley", "barn", "baron", "baroness", "basil", "bat",
  "bathroom", "battery", "beach", "beagle", "beaker", "bean", "bear",
  "beck", "bedroom", "beech", "beef", "beer", "beet", "beetle",
  "beetroot", "bengal", "bicycle", "bike", "biologist", "biplane",
  "birch", "bird", "biscuit", "bitch", "blackberry", "blackbird",
  "blackcurrant", "bloodhound", "blueberry", "bluebottle", "boar",
  "boat", "bobcat", "bobtail", "body", "bonobo", "book", "boot",
  "box", "boxer", "branch", "brandy", "bread", "bricklayer",
  "brochure", "bronze", "brother", "brush", "bud", "budgerigar",
  "bug", "buggy", "builder", "bulb", "bull", "bulldog", "bulldozer",
  "bullfrog", "bullmastiff", "burmese", "bus", "bush", "butcher",
  "butter", "butterfly", "button", "buzzard", "cab", "cabbage",
  "cabriolet", "cactus", "cake", "can", "canal", "candy", "canyon",
  "capacitor", "cappuccino", "car", "carbon", "card", "cardboard",
  "carnivore", "carrot", "cashew", "casino", "castle", "cat",
  "caterpillar", "catfish", "cavy", "cayenne", "ceiling", "celebrity",
  "cellphone", "cement", "centaur", "centipede", "chaffinch",
  "chainsaw", "chair", "chameleon", "chapel", "cheddar", "cheek",
  "cheese", "cheetah", "chef", "chemist", "cherry", "chest",
  "chestnut", "chick", "chicken", "chihuahua", "childminder", "chili",
  "chimera", "chimpanzee", "chin", "chisel", "chlorine", "chocolate",
  "chopper", "chrome", "church", "cider", "cinnamon", "circle",
  "city", "clam", "clay", "cliff", "clown", "coal", "coast", "coat",
  "cobalt", "cocoa", "coconut", "cod", "coffee", "collar", "collie",
  "comet", "communist", "concrete", "condor", "cone", "congressman",
  "congresswoman", "conifer", "conservative", "consultant", "cookie",
  "copper", "coriander", "corn", "cornflower", "cottage", "cotton",
  "cougar", "count", "countess", "cousin", "cow", "crab", "cranberry",
  "crater", "crayfish", "crayon", "cream", "crocodile", "crossroads",
  "crystal", "cube", "cucumber", "culdesac", "cup", "cupboard", "cur",
  "curry", "cuttlefish", "cyclops", "dachshund", "daffodil", "daisy",
  "dale", "dalmatian", "dandelion", "date", "daughter", "demigod",
  "denim", "desert", "diamond", "dictionary", "diesel", "dill",
  "dingo", "diode", "director", "doctor", "dog", "doll", "dolphin",
  "donkey", "door", "dragon", "drake", "dramatist", "drawer", "drill",
  "driver", "duchess", "duck", "duckling", "duke", "dumpster", "dust",
  "dwarf", "eagle", "ear", "earl", "earlobe", "earth", "earthquake",
  "earthworm", "economist", "eel", "egg", "elbow", "elderberry",
  "electrician", "elephant", "elf", "ellipse", "emerald", "emperor",
  "empress", "emu", "eruption", "escarpment", "estate", "evergreen",
  "ewe", "explosion", "eye", "eyebrow", "eyelid", "fairy", "falcon",
  "farmer", "fascist", "father", "faun", "fender", "fern", "ferret",
  "ferry", "feta", "field", "fig", "file", "finch", "finger", "fir",
  "fire", "firebird", "firefox", "fish", "float", "floor", "flour",
  "flower", "fluorine", "fly", "fog", "footpath", "forest", "fork",
  "fox", "frog", "fruit", "fuel", "gaffer", "gale", "game", "gander",
  "garage", "garlic", "gas", "gaullist", "gecko", "gherkin", "ghetto",
  "giant", "gibbon", "ginger", "giraffe", "glacier", "glade", "glass",
  "glue", "gnome", "goat", "goblin", "gold", "goldfish", "goo",
  "goose", "gooseberry", "gorilla", "governor", "grandfather",
  "grandmother", "grape", "grapefruit", "grass", "greengrocer",
  "greyhound", "griffin", "grisly", "grocer", "grouse", "gryphon",
  "guava", "guide", "gulch", "gull", "gulley", "guppy", "hail",
  "hair", "halfgiant", "halfling", "hall", "hallway", "halogen",
  "hamlet", "hammer", "handle", "hardboard", "hare", "harrier",
  "hawk", "hazelnut", "head", "headhunter", "hedge", "hedgehog",
  "heel", "helicopter", "helium", "hen", "herbivore", "herring",
  "hexagon", "hifi", "highway", "hill", "hillock", "hillside",
  "hippopotamus", "historian", "hobbit", "hoe", "hog", "holly",
  "honey", "hoof", "horse", "host", "hostess", "hotel", "hound",
  "house", "hovercraft", "human", "hurricane", "husky", "hut",
  "hyacinth", "hydra", "hydrogen", "hyena", "ice", "icicle", "iguana",
  "insect", "interchange", "intern", "iron", "ivy", "jaguar", "jam",
  "jet", "jigsaw", "joiner", "junction", "jungle", "juniper", "kale",
  "kangaroo", "kerosene", "key", "keyboard", "king", "kitchen",
  "kite", "kitten", "kiwi", "knee", "knife", "koala", "labourer",
  "labrador", "lady", "ladybird", "lake", "lamp", "larch", "larva",
  "latte", "lava", "lawnmower", "lawyer", "lead", "leaf", "leaflet",
  "lecturer", "leek", "leftist", "leg", "legging", "lemon", "lemur",
  "lentil", "leopard", "leprechaun", "letter", "lettuce", "lever",
  "liberal", "lichen", "lime", "limpet", "line", "linen", "linguist",
  "lion", "lip", "lizard", "lobster", "lock", "lord", "loudspeaker",
  "lumberjack", "lungfish", "lynx", "mackerel", "magazine",
  "magician", "mahogany", "maize", "mallet", "mama", "mammal",
  "manager", "mandarin", "mandrill", "mango", "mantis", "manx",
  "maple", "mare", "marigold", "marmalade", "marquess", "marquis",
  "marrow", "marsupial", "mathematician", "meadow", "medusa", "melon",
  "mercury", "metal", "meteor", "methanol", "metropolis", "midge",
  "midwife", "milk", "milkman", "millipede", "miner", "minister",
  "minivan", "mink", "minotaur", "mistletoe", "mocca", "mole",
  "monitor", "monkey", "monkeywrench", "monorail", "moon", "moped",
  "mosquito", "moss", "motel", "moth", "mother", "motorcycle",
  "motorway", "mould", "mountain", "mountainside", "mouse", "mouth",
  "mozilla", "mud", "mug", "mulberry", "mule", "mullet", "mussel",
  "mutton", "nanny", "narwhal", "nasturtium", "nautilus", "neck",
  "needle", "neon", "nettle", "newsreader", "newt", "nitrogen",
  "nose", "nostril", "novel", "novella", "nurse", "nymph", "oak",
  "oat", "ocean", "ocelot", "ocicat", "octopus", "office", "oil",
  "olive", "omnivore", "onion", "orange", "orangutang", "orc",
  "oregano", "osprey", "ostrich", "otter", "outhouse", "oval", "owl",
  "oxygen", "oyster", "pack", "padlock", "painter", "palace", "palm",
  "pan", "panda", "pansy", "panther", "pantry", "papa", "papaya",
  "paper", "paprika", "parcel", "parsley", "partridge", "path", "paw",
  "pea", "peach", "peanut", "pear", "pearl", "pedal", "peer",
  "pegasus", "pekingese", "pen", "pencil", "penguin", "pentagon",
  "pepper", "persian", "petrol", "petunia", "phoenix", "physician",
  "physicist", "pick", "pickaxe", "pickup", "pig", "pigeon", "pike",
  "pine", "pineapple", "pinnacle", "pinscher", "plain", "plane",
  "planet", "plank", "plaster", "plasterer", "plate", "plug", "plum",
  "plumber", "plutonium", "plywood", "pocket", "poem", "point",
  "pointer", "policeman", "policewoman", "politician", "pomegranate",
  "pony", "poodle", "poplar", "poppy", "pork", "port", "possum",
  "postcard", "potato", "pram", "predator", "present", "presenter",
  "president", "priest", "prince", "princess", "prion", "professor",
  "psychiatrist", "psychoanalyst", "pug", "puma", "pup", "puppy",
  "purse", "quarter", "queen", "quicksand", "rabbit", "raccoon",
  "radio", "radish", "ragamuffin", "ragdoll", "railroad", "railway",
  "rain", "raptor", "raspberry", "rat", "receptionist", "record",
  "rectangle", "redcurrant", "remote", "reptile", "reservoir",
  "resistor", "retriever", "rhinoceros", "rhubarb", "rib", "rice",
  "rightist", "ring", "river", "road", "robin", "rock", "rocket",
  "rollerskate", "room", "rooster", "rose", "rosemary", "rottweiler",
  "roundabout", "ruby", "rucksack", "rye", "sabretooth", "sack",
  "sailboat", "sailor", "salamander", "salesman", "saleswoman",
  "salmon", "salt", "sand", "sapphire", "sardine", "satchel",
  "satellite", "satsuma", "satyr", "saucepan", "saucer", "saw",
  "scallop", "schnauzer", "scientist", "scissors", "scooter",
  "scorpion", "screwdriver", "sea", "seagull", "seal", "seamonkey",
  "seasnake", "secretary", "segment", "senator", "shark", "shed",
  "sheep", "sheepdog", "shellfish", "shepherd", "sherry", "shin",
  "ship", "shoe", "shop", "shopkeeper", "shovel", "shrew", "shrimp",
  "shrubbery", "shuttle", "siamese", "silicon", "silk", "silver",
  "singer", "single", "sister", "skate", "sleet", "slime", "sloth",
  "slug", "slum", "slush", "smock", "snail", "snake", "snapdragon",
  "snow", "snowshoe", "socialist", "sociologist", "sock", "socket",
  "sodium", "sofa", "soil", "soldier", "son", "song", "sow", "space",
  "spaceship", "spade", "spaniel", "spanner", "sparrow",
  "sparrowhawk", "speedboat", "sphere", "sphinx", "spider",
  "spindoctor", "sponge", "spoon", "sportscar", "sprout", "spruce",
  "spy", "square", "squash", "squid", "squirrel", "staircase",
  "stallion", "star", "station", "steak", "steel", "stoat", "stone",
  "stool", "storm", "strawberry", "stream", "street", "strimmer",
  "sturgeon", "suburb", "sugar", "suitcase", "sun", "sunflower",
  "surgeon", "swan", "sweater", "swede", "swordfish", "syndicalist",
  "tabby", "table", "tadpole", "tail", "tailor", "tangerine", "tar",
  "tarantula", "tarmac", "taxi", "tea", "teacher", "teak", "teaspoon",
  "teddy", "telephone", "television", "temple", "terrier",
  "tetrahedron", "theologian", "thespian", "thigh", "thistle",
  "thumb", "thunderbird", "thyme", "tiger", "tin", "toad", "toast",
  "toe", "tomato", "tomcat", "tongue", "tonkinese", "torch",
  "tortoise", "town", "toy", "tractor", "trail", "train",
  "transformer", "transistor", "treacle", "tree", "treetop", "tremor",
  "triangle", "tricycle", "troll", "trousers", "trout", "truck",
  "truffle", "trunk", "tshirt", "tube", "tulip", "tuna", "tundra",
  "turkey", "turmeric", "turtle", "twig", "typhoon", "uncle",
  "undergrowth", "unicorn", "unicycle", "uranium", "vale", "valley",
  "vanilla", "veal", "verse", "vest", "vet", "veterinarian", "vicar",
  "village", "violet", "virus", "viscount", "viscountess", "vise",
  "vodka", "vole", "vulture", "wall", "wallaby", "wallet", "walnut",
  "walrus", "warbler", "wardrobe", "wasteland", "water", "watermelon",
  "weasel", "whale", "whalefish", "wheat", "wheel", "wheelchair",
  "wildcat", "window", "wine", "wing", "witch", "wizard", "wolf",
  "wolfhound", "wombat", "wool", "worm", "wren", "wrench", "wrist",
  "yeast", "yew", "yogurt",
    "aardvark", "abyssinian", "accountant", "acetone",
  "acid", "acorn", "acrobat", "actor", "actress", "aftershock",
  "agent", "air", "airplane", "airport", "albatross", "album",
  "alcohol", "alder", "alligator", "almond", "alsatian", "ambulance",
  "analyst", "anarchist", "angel", "angora", "ankle", "ant",
  "anteater", "ape", "apple", "apricot", "apron", "ark", "arm",
  "armadillo", "artichoke", "ash", "ass", "asteroid", "aunt",
  "automobile", "avenue", "avocado", "awk", "ax", "baboon",
  "bacterium", "badger", "bag", "balcony", "banana", "bank", "barge",
  "bark", "barley", "barn", "baron", "baroness", "basil", "bat",
  "bathroom", "battery", "beach", "beagle", "beaker", "bean", "bear",
  "beck", "bedroom", "beech", "beef", "beer", "beet", "beetle",
  "beetroot", "bengal", "bicycle", "bike", "biologist", "biplane",
  "birch", "bird", "biscuit", "bitch", "blackberry", "blackbird",
  "blackcurrant", "bloodhound", "blueberry", "bluebottle", "boar",
  "boat", "bobcat", "bobtail", "body", "bonobo", "book", "boot",
  "box", "boxer", "branch", "brandy", "bread", "bricklayer",
  "brochure", "bronze", "brother", "brush", "bud", "budgerigar",
  "bug", "buggy", "builder", "bulb", "bull", "bulldog", "bulldozer",
  "bullfrog", "bullmastiff", "burmese", "bus", "bush", "butcher",
  "butter", "butterfly", "button", "buzzard", "cab", "cabbage",
  "cabriolet", "cactus", "cake", "can", "canal", "candy", "canyon",
  "capacitor", "cappuccino", "car", "carbon", "card", "cardboard",
  "carnivore", "carrot", "cashew", "casino", "castle", "cat",
  "caterpillar", "catfish", "cavy", "cayenne", "ceiling", "celebrity",
  "cellphone", "cement", "centaur", "centipede", "chaffinch",
  "chainsaw", "chair", "chameleon", "chapel", "cheddar", "cheek",
  "cheese", "cheetah", "chef", "chemist", "cherry", "chest",
  "chestnut", "chick", "chicken", "chihuahua", "childminder", "chili",
  "chimera", "chimpanzee", "chin", "chisel", "chlorine", "chocolate",
  "chopper", "chrome", "church", "cider", "cinnamon", "circle",
  "city", "clam", "clay", "cliff", "clown", "coal", "coast", "coat",
  "cobalt", "cocoa", "coconut", "cod", "coffee", "collar", "collie",
  "comet", "communist", "concrete", "condor", "cone", "congressman",
  "congresswoman", "conifer", "conservative", "consultant", "cookie",
  "copper", "coriander", "corn", "cornflower", "cottage", "cotton",
  "cougar", "count", "countess", "cousin", "cow", "crab", "cranberry",
  "crater", "crayfish", "crayon", "cream", "crocodile", "crossroads",
  "crystal", "cube", "cucumber", "culdesac", "cup", "cupboard", "cur",
  "curry", "cuttlefish", "cyclops", "dachshund", "daffodil", "daisy",
  "dale", "dalmatian", "dandelion", "date", "daughter", "demigod",
  "denim", "desert", "diamond", "dictionary", "diesel", "dill",
  "dingo", "diode", "director", "doctor", "dog", "doll", "dolphin",
  "donkey", "door", "dragon", "drake", "dramatist", "drawer", "drill",
  "driver", "duchess", "duck", "duckling", "duke", "dumpster", "dust",
  "dwarf", "eagle", "ear", "earl", "earlobe", "earth", "earthquake",
  "earthworm", "economist", "eel", "egg", "elbow", "elderberry",
  "electrician", "elephant", "elf", "ellipse", "emerald", "emperor",
  "empress", "emu", "eruption", "escarpment", "estate", "evergreen",
  "ewe", "explosion", "eye", "eyebrow", "eyelid", "fairy", "falcon",
  "farmer", "fascist", "father", "faun", "fender", "fern", "ferret",
  "ferry", "feta", "field", "fig", "file", "finch", "finger", "fir",
  "fire", "firebird", "firefox", "fish", "float", "floor", "flour",
  "flower", "fluorine", "fly", "fog", "footpath", "forest", "fork",
  "fox", "frog", "fruit", "fuel", "gaffer", "gale", "game", "gander",
  "garage", "garlic", "gas", "gaullist", "gecko", "gherkin", "ghetto",
  "giant", "gibbon", "ginger", "giraffe", "glacier", "glade", "glass",
  "glue", "gnome", "goat", "goblin", "gold", "goldfish", "goo",
  "goose", "gooseberry", "gorilla", "governor", "grandfather",
  "grandmother", "grape", "grapefruit", "grass", "greengrocer",
  "greyhound", "griffin", "grisly", "grocer", "grouse", "gryphon",
  "guava", "guide", "gulch", "gull", "gulley", "guppy", "hail",
  "hair", "halfgiant", "halfling", "hall", "hallway", "halogen",
  "hamlet", "hammer", "handle", "hardboard", "hare", "harrier",
  "hawk", "hazelnut", "head", "headhunter", "hedge", "hedgehog",
  "heel", "helicopter", "helium", "hen", "herbivore", "herring",
  "hexagon", "hifi", "highway", "hill", "hillock", "hillside",
  "hippopotamus", "historian", "hobbit", "hoe", "hog", "holly",
  "honey", "hoof", "horse", "host", "hostess", "hotel", "hound",
  "house", "hovercraft", "human", "hurricane", "husky", "hut",
  "hyacinth", "hydra", "hydrogen", "hyena", "ice", "icicle", "iguana",
  "insect", "interchange", "intern", "iron", "ivy", "jaguar", "jam",
  "jet", "jigsaw", "joiner", "junction", "jungle", "juniper", "kale",
  "kangaroo", "kerosene", "key", "keyboard", "king", "kitchen",
  "kite", "kitten", "kiwi", "knee", "knife", "koala", "labourer",
  "labrador", "lady", "ladybird", "lake", "lamp", "larch", "larva",
  "latte", "lava", "lawnmower", "lawyer", "lead", "leaf", "leaflet",
  "lecturer", "leek", "leftist", "leg", "legging", "lemon", "lemur",
  "lentil", "leopard", "leprechaun", "letter", "lettuce", "lever",
  "liberal", "lichen", "lime", "limpet", "line", "linen", "linguist",
  "lion", "lip", "lizard", "lobster", "lock", "lord", "loudspeaker",
  "lumberjack", "lungfish", "lynx", "mackerel", "magazine",
  "magician", "mahogany", "maize", "mallet", "mama", "mammal",
  "manager", "mandarin", "mandrill", "mango", "mantis", "manx",
  "maple", "mare", "marigold", "marmalade", "marquess", "marquis",
  "marrow", "marsupial", "mathematician", "meadow", "medusa", "melon",
  "mercury", "metal", "meteor", "methanol", "metropolis", "midge",
  "midwife", "milk", "milkman", "millipede", "miner", "minister",
  "minivan", "mink", "minotaur", "mistletoe", "mocca", "mole",
  "monitor", "monkey", "monkeywrench", "monorail", "moon", "moped",
  "mosquito", "moss", "motel", "moth", "mother", "motorcycle",
  "motorway", "mould", "mountain", "mountainside", "mouse", "mouth",
  "mozilla", "mud", "mug", "mulberry", "mule", "mullet", "mussel",
  "mutton", "nanny", "narwhal", "nasturtium", "nautilus", "neck",
  "needle", "neon", "nettle", "newsreader", "newt", "nitrogen",
  "nose", "nostril", "novel", "novella", "nurse", "nymph", "oak",
  "oat", "ocean", "ocelot", "ocicat", "octopus", "office", "oil",
  "olive", "omnivore", "onion", "orange", "orangutang", "orc",
  "oregano", "osprey", "ostrich", "otter", "outhouse", "oval", "owl",
  "oxygen", "oyster", "pack", "padlock", "painter", "palace", "palm",
  "pan", "panda", "pansy", "panther", "pantry", "papa", "papaya",
  "paper", "paprika", "parcel", "parsley", "partridge", "path", "paw",
  "pea", "peach", "peanut", "pear", "pearl", "pedal", "peer",
  "pegasus", "pekingese", "pen", "pencil", "penguin", "pentagon",
  "pepper", "persian", "petrol", "petunia", "phoenix", "physician",
  "physicist", "pick", "pickaxe", "pickup", "pig", "pigeon", "pike",
  "pine", "pineapple", "pinnacle", "pinscher", "plain", "plane",
  "planet", "plank", "plaster", "plasterer", "plate", "plug", "plum",
  "plumber", "plutonium", "plywood", "pocket", "poem", "point",
  "pointer", "policeman", "policewoman", "politician", "pomegranate",
  "pony", "poodle", "poplar", "poppy", "pork", "port", "possum",
  "postcard", "potato", "pram", "predator", "present", "presenter",
  "president", "priest", "prince", "princess", "prion", "professor",
  "psychiatrist", "psychoanalyst", "pug", "puma", "pup", "puppy",
  "purse", "quarter", "queen", "quicksand", "rabbit", "raccoon",
  "radio", "radish", "ragamuffin", "ragdoll", "railroad", "railway",
  "rain", "raptor", "raspberry", "rat", "receptionist", "record",
  "rectangle", "redcurrant", "remote", "reptile", "reservoir",
  "resistor", "retriever", "rhinoceros", "rhubarb", "rib", "rice",
  "rightist", "ring", "river", "road", "robin", "rock", "rocket",
  "rollerskate", "room", "rooster", "rose", "rosemary", "rottweiler",
  "roundabout", "ruby", "rucksack", "rye", "sabretooth", "sack",
  "sailboat", "sailor", "salamander", "salesman", "saleswoman",
  "salmon", "salt", "sand", "sapphire", "sardine", "satchel",
  "satellite", "satsuma", "satyr", "saucepan", "saucer", "saw",
  "scallop", "schnauzer", "scientist", "scissors", "scooter",
  "scorpion", "screwdriver", "sea", "seagull", "seal", "seamonkey",
  "seasnake", "secretary", "segment", "senator", "shark", "shed",
  "sheep", "sheepdog", "shellfish", "shepherd", "sherry", "shin",
  "ship", "shoe", "shop", "shopkeeper", "shovel", "shrew", "shrimp",
  "shrubbery", "shuttle", "siamese", "silicon", "silk", "silver",
  "singer", "single", "sister", "skate", "sleet", "slime", "sloth",
  "slug", "slum", "slush", "smock", "snail", "snake", "snapdragon",
  "snow", "snowshoe", "socialist", "sociologist", "sock", "socket",
  "sodium", "sofa", "soil", "soldier", "son", "song", "sow", "space",
  "spaceship", "spade", "spaniel", "spanner", "sparrow",
  "sparrowhawk", "speedboat", "sphere", "sphinx", "spider",
  "spindoctor", "sponge", "spoon", "sportscar", "sprout", "spruce",
  "spy", "square", "squash", "squid", "squirrel", "staircase",
  "stallion", "star", "station", "steak", "steel", "stoat", "stone",
  "stool", "storm", "strawberry", "stream", "street", "strimmer",
  "sturgeon", "suburb", "sugar", "suitcase", "sun", "sunflower",
  "surgeon", "swan", "sweater", "swede", "swordfish", "syndicalist",
  "tabby", "table", "tadpole", "tail", "tailor", "tangerine", "tar",
  "tarantula", "tarmac", "taxi", "tea", "teacher", "teak", "teaspoon",
  "teddy", "telephone", "television", "temple", "terrier",
  "tetrahedron", "theologian", "thespian", "thigh", "thistle",
  "thumb", "thunderbird", "thyme", "tiger", "tin", "toad", "toast",
  "toe", "tomato", "tomcat", "tongue", "tonkinese", "torch",
  "tortoise", "town", "toy", "tractor", "trail", "train",
  "transformer", "transistor", "treacle", "tree", "treetop", "tremor",
  "triangle", "tricycle", "troll", "trousers", "trout", "truck",
  "truffle", "trunk", "tshirt", "tube", "tulip", "tuna", "tundra",
  "turkey", "turmeric", "turtle", "twig", "typhoon", "uncle",
  "undergrowth", "unicorn", "unicycle", "uranium", "vale", "valley",
  "vanilla", "veal", "verse", "vest", "vet", "veterinarian", "vicar",
  "village", "violet", "virus", "viscount", "viscountess", "vise",
  "vodka", "vole", "vulture", "wall", "wallaby", "wallet", "walnut",
  "walrus", "warbler", "wardrobe", "wasteland", "water", "watermelon",
  "weasel", "whale", "whalefish", "wheat", "wheel", "wheelchair",
  "wildcat", "window", "wine", "wing", "witch", "wizard", "wolf",
  "wolfhound", "wombat", "wool", "worm", "wren", "wrench", "wrist",
  "yeast", "yew", "yogurt",
    "aardvark", "abyssinian", "accountant", "acetone",
  "acid", "acorn", "acrobat", "actor", "actress", "aftershock",
  "agent", "air", "airplane", "airport", "albatross", "album",
  "alcohol", "alder", "alligator", "almond", "alsatian", "ambulance",
  "analyst", "anarchist", "angel", "angora", "ankle", "ant",
  "anteater", "ape", "apple", "apricot", "apron", "ark", "arm",
  "armadillo", "artichoke", "ash", "ass", "asteroid", "aunt",
  "automobile", "avenue", "avocado", "awk", "ax", "baboon",
  "bacterium", "badger", "bag", "balcony", "banana", "bank", "barge",
  "bark", "barley", "barn", "baron", "baroness", "basil", "bat",
  "bathroom", "battery", "beach", "beagle", "beaker", "bean", "bear",
  "beck", "bedroom", "beech", "beef", "beer", "beet", "beetle",
  "beetroot", "bengal", "bicycle", "bike", "biologist", "biplane",
  "birch", "bird", "biscuit", "bitch", "blackberry", "blackbird",
  "blackcurrant", "bloodhound", "blueberry", "bluebottle", "boar",
  "boat", "bobcat", "bobtail", "body", "bonobo", "book", "boot",
  "box", "boxer", "branch", "brandy", "bread", "bricklayer",
  "brochure", "bronze", "brother", "brush", "bud", "budgerigar",
  "bug", "buggy", "builder", "bulb", "bull", "bulldog", "bulldozer",
  "bullfrog", "bullmastiff", "burmese", "bus", "bush", "butcher",
  "butter", "butterfly", "button", "buzzard", "cab", "cabbage",
  "cabriolet", "cactus", "cake", "can", "canal", "candy", "canyon",
  "capacitor", "cappuccino", "car", "carbon", "card", "cardboard",
  "carnivore", "carrot", "cashew", "casino", "castle", "cat",
  "caterpillar", "catfish", "cavy", "cayenne", "ceiling", "celebrity",
  "cellphone", "cement", "centaur", "centipede", "chaffinch",
  "chainsaw", "chair", "chameleon", "chapel", "cheddar", "cheek",
  "cheese", "cheetah", "chef", "chemist", "cherry", "chest",
  "chestnut", "chick", "chicken", "chihuahua", "childminder", "chili",
  "chimera", "chimpanzee", "chin", "chisel", "chlorine", "chocolate",
  "chopper", "chrome", "church", "cider", "cinnamon", "circle",
  "city", "clam", "clay", "cliff", "clown", "coal", "coast", "coat",
  "cobalt", "cocoa", "coconut", "cod", "coffee", "collar", "collie",
  "comet", "communist", "concrete", "condor", "cone", "congressman",
  "congresswoman", "conifer", "conservative", "consultant", "cookie",
  "copper", "coriander", "corn", "cornflower", "cottage", "cotton",
  "cougar", "count", "countess", "cousin", "cow", "crab", "cranberry",
  "crater", "crayfish", "crayon", "cream", "crocodile", "crossroads",
  "crystal", "cube", "cucumber", "culdesac", "cup", "cupboard", "cur",
  "curry", "cuttlefish", "cyclops", "dachshund", "daffodil", "daisy",
  "dale", "dalmatian", "dandelion", "date", "daughter", "demigod",
  "denim", "desert", "diamond", "dictionary", "diesel", "dill",
  "dingo", "diode", "director", "doctor", "dog", "doll", "dolphin",
  "donkey", "door", "dragon", "drake", "dramatist", "drawer", "drill",
  "driver", "duchess", "duck", "duckling", "duke", "dumpster", "dust",
  "dwarf", "eagle", "ear", "earl", "earlobe", "earth", "earthquake",
  "earthworm", "economist", "eel", "egg", "elbow", "elderberry",
  "electrician", "elephant", "elf", "ellipse", "emerald", "emperor",
  "empress", "emu", "eruption", "escarpment", "estate", "evergreen",
  "ewe", "explosion", "eye", "eyebrow", "eyelid", "fairy", "falcon",
  "farmer", "fascist", "father", "faun", "fender", "fern", "ferret",
  "ferry", "feta", "field", "fig", "file", "finch", "finger", "fir",
  "fire", "firebird", "firefox", "fish", "float", "floor", "flour",
  "flower", "fluorine", "fly", "fog", "footpath", "forest", "fork",
  "fox", "frog", "fruit", "fuel", "gaffer", "gale", "game", "gander",
  "garage", "garlic", "gas", "gaullist", "gecko", "gherkin", "ghetto",
  "giant", "gibbon", "ginger", "giraffe", "glacier", "glade", "glass",
  "glue", "gnome", "goat", "goblin", "gold", "goldfish", "goo",
  "goose", "gooseberry", "gorilla", "governor", "grandfather",
  "grandmother", "grape", "grapefruit", "grass", "greengrocer",
  "greyhound", "griffin", "grisly", "grocer", "grouse", "gryphon",
  "guava", "guide", "gulch", "gull", "gulley", "guppy", "hail",
  "hair", "halfgiant", "halfling", "hall", "hallway", "halogen",
  "hamlet", "hammer", "handle", "hardboard", "hare", "harrier",
  "hawk", "hazelnut", "head", "headhunter", "hedge", "hedgehog",
  "heel", "helicopter", "helium", "hen", "herbivore", "herring",
  "hexagon", "hifi", "highway", "hill", "hillock", "hillside",
  "hippopotamus", "historian", "hobbit", "hoe", "hog", "holly",
  "honey", "hoof", "horse", "host", "hostess", "hotel", "hound",
  "house", "hovercraft", "human", "hurricane", "husky", "hut",
  "hyacinth", "hydra", "hydrogen", "hyena", "ice", "icicle", "iguana",
  "insect", "interchange", "intern", "iron", "ivy", "jaguar", "jam",
  "jet", "jigsaw", "joiner", "junction", "jungle", "juniper", "kale",
  "kangaroo", "kerosene", "key", "keyboard", "king", "kitchen",
  "kite", "kitten", "kiwi", "knee", "knife", "koala", "labourer",
  "labrador", "lady", "ladybird", "lake", "lamp", "larch", "larva",
  "latte", "lava", "lawnmower", "lawyer", "lead", "leaf", "leaflet",
  "lecturer", "leek", "leftist", "leg", "legging", "lemon", "lemur",
  "lentil", "leopard", "leprechaun", "letter", "lettuce", "lever",
  "liberal", "lichen", "lime", "limpet", "line", "linen", "linguist",
  "lion", "lip", "lizard", "lobster", "lock", "lord", "loudspeaker",
  "lumberjack", "lungfish", "lynx", "mackerel", "magazine",
  "magician", "mahogany", "maize", "mallet", "mama", "mammal",
  "manager", "mandarin", "mandrill", "mango", "mantis", "manx",
  "maple", "mare", "marigold", "marmalade", "marquess", "marquis",
  "marrow", "marsupial", "mathematician", "meadow", "medusa", "melon",
  "mercury", "metal", "meteor", "methanol", "metropolis", "midge",
  "midwife", "milk", "milkman", "millipede", "miner", "minister",
  "minivan", "mink", "minotaur", "mistletoe", "mocca", "mole",
  "monitor", "monkey", "monkeywrench", "monorail", "moon", "moped",
  "mosquito", "moss", "motel", "moth", "mother", "motorcycle",
  "motorway", "mould", "mountain", "mountainside", "mouse", "mouth",
  "mozilla", "mud", "mug", "mulberry", "mule", "mullet", "mussel",
  "mutton", "nanny", "narwhal", "nasturtium", "nautilus", "neck",
  "needle", "neon", "nettle", "newsreader", "newt", "nitrogen",
  "nose", "nostril", "novel", "novella", "nurse", "nymph", "oak",
  "oat", "ocean", "ocelot", "ocicat", "octopus", "office", "oil",
  "olive", "omnivore", "onion", "orange", "orangutang", "orc",
  "oregano", "osprey", "ostrich", "otter", "outhouse", "oval", "owl",
  "oxygen", "oyster", "pack", "padlock", "painter", "palace", "palm",
  "pan", "panda", "pansy", "panther", "pantry", "papa", "papaya",
  "paper", "paprika", "parcel", "parsley", "partridge", "path", "paw",
  "pea", "peach", "peanut", "pear", "pearl", "pedal", "peer",
  "pegasus", "pekingese", "pen", "pencil", "penguin", "pentagon",
  "pepper", "persian", "petrol", "petunia", "phoenix", "physician",
  "physicist", "pick", "pickaxe", "pickup", "pig", "pigeon", "pike",
  "pine", "pineapple", "pinnacle", "pinscher", "plain", "plane",
  "planet", "plank", "plaster", "plasterer", "plate", "plug", "plum",
  "plumber", "plutonium", "plywood", "pocket", "poem", "point",
  "pointer", "policeman", "policewoman", "politician", "pomegranate",
  "pony", "poodle", "poplar", "poppy", "pork", "port", "possum",
  "postcard", "potato", "pram", "predator", "present", "presenter",
  "president", "priest", "prince", "princess", "prion", "professor",
  "psychiatrist", "psychoanalyst", "pug", "puma", "pup", "puppy",
  "purse", "quarter", "queen", "quicksand", "rabbit", "raccoon",
  "radio", "radish", "ragamuffin", "ragdoll", "railroad", "railway",
  "rain", "raptor", "raspberry", "rat", "receptionist", "record",
  "rectangle", "redcurrant", "remote", "reptile", "reservoir",
  "resistor", "retriever", "rhinoceros", "rhubarb", "rib", "rice",
  "rightist", "ring", "river", "road", "robin", "rock", "rocket",
  "rollerskate", "room", "rooster", "rose", "rosemary", "rottweiler",
  "roundabout", "ruby", "rucksack", "rye", "sabretooth", "sack",
  "sailboat", "sailor", "salamander", "salesman", "saleswoman",
  "salmon", "salt", "sand", "sapphire", "sardine", "satchel",
  "satellite", "satsuma", "satyr", "saucepan", "saucer", "saw",
  "scallop", "schnauzer", "scientist", "scissors", "scooter",
  "scorpion", "screwdriver", "sea", "seagull", "seal", "seamonkey",
  "seasnake", "secretary", "segment", "senator", "shark", "shed",
  "sheep", "sheepdog", "shellfish", "shepherd", "sherry", "shin",
  "ship", "shoe", "shop", "shopkeeper", "shovel", "shrew", "shrimp",
  "shrubbery", "shuttle", "siamese", "silicon", "silk", "silver",
  "singer", "single", "sister", "skate", "sleet", "slime", "sloth",
  "slug", "slum", "slush", "smock", "snail", "snake", "snapdragon",
  "snow", "snowshoe", "socialist", "sociologist", "sock", "socket",
  "sodium", "sofa", "soil", "soldier", "son", "song", "sow", "space",
  "spaceship", "spade", "spaniel", "spanner", "sparrow",
  "sparrowhawk", "speedboat", "sphere", "sphinx", "spider",
  "spindoctor", "sponge", "spoon", "sportscar", "sprout", "spruce",
  "spy", "square", "squash", "squid", "squirrel", "staircase",
  "stallion", "star", "station", "steak", "steel", "stoat", "stone",
  "stool", "storm", "strawberry", "stream", "street", "strimmer",
  "sturgeon", "suburb", "sugar", "suitcase", "sun", "sunflower",
  "surgeon", "swan", "sweater", "swede", "swordfish", "syndicalist",
  "tabby", "table", "tadpole", "tail", "tailor", "tangerine", "tar",
  "tarantula", "tarmac", "taxi", "tea", "teacher", "teak", "teaspoon",
  "teddy", "telephone", "television", "temple", "terrier",
  "tetrahedron", "theologian", "thespian", "thigh", "thistle",
  "thumb", "thunderbird", "thyme", "tiger", "tin", "toad", "toast",
  "toe", "tomato", "tomcat", "tongue", "tonkinese", "torch",
  "tortoise", "town", "toy", "tractor", "trail", "train",
  "transformer", "transistor", "treacle", "tree", "treetop", "tremor",
  "triangle", "tricycle", "troll", "trousers", "trout", "truck",
  "truffle", "trunk", "tshirt", "tube", "tulip", "tuna", "tundra",
  "turkey", "turmeric", "turtle", "twig", "typhoon", "uncle",
  "undergrowth", "unicorn", "unicycle", "uranium", "vale", "valley",
  "vanilla", "veal", "verse", "vest", "vet", "veterinarian", "vicar",
  "village", "violet", "virus", "viscount", "viscountess", "vise",
  "vodka", "vole", "vulture", "wall", "wallaby", "wallet", "walnut",
  "walrus", "warbler", "wardrobe", "wasteland", "water", "watermelon",
  "weasel", "whale", "whalefish", "wheat", "wheel", "wheelchair",
  "wildcat", "window", "wine", "wing", "witch", "wizard", "wolf",
  "wolfhound", "wombat", "wool", "worm", "wren", "wrench", "wrist",
  "yeast", "yew", "yogurt"
];
