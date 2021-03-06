(function(){
var pos = require('pos');
var lexicon = require('pos/lexicon');

// helper functions

function clone(val){
  return JSON.parse(JSON.stringify(val));
}

function contains(list, item){
  return list.indexOf(item) !== -1;
}

function hasPrefix(str, prefix){
  return str.substring(0, prefix.length) === prefix;
}

function hasSuffix(str, suffix){
  var suffixIdx = str.length - suffix.length;
  return str.indexOf(suffix, suffixIdx) === suffixIdx;
}

function isEmptyOrWhitespace(str){
  return str.replace(/\s+/g, '').length === 0;
}

function normalize(str){
  return str.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

function randNth(list){
  return list[Math.floor(Math.random()*list.length)];
}

// constants

var COUNT_ANY = 0;
var COUNT_SINGULAR = 1;
var COUNT_PLURAL = 2;
var COUNT_I = 3; // special pseudo-count for the pronoun 'I' (needs 'am'/'was' for copula)

var INITIAL_ANY = 0;
var INITIAL_CONSONANT = 1;
var INITIAL_VOWEL = 2;

var STATE_SUBJ = 0;
var STATE_VERB = 1;
var STATE_OBJ = 2;
var STATE_DONE = 3;

// patterns

var subjectPatterns = [
  // the subject...
  ['Det', 'Noun'],
  // the adjective subject...
  ['Det', 'Adj', 'Noun'],
  // subjects...
  ['Plural'],
  // adjective subjects...
  ['Adj', 'Plural'],
  // subjects and subjects...
  ['Plural', 'And', 'Plural'],
  // the subjects and subjects...
  ['Det', 'Plural', 'And', 'Plural'],
  // Max...
  ['Person'],
  // I...
  ['SubjPrn']
];

var verbObjectPatterns = [
  // ...is adjective
  {verb: ['Copula'], object: ['Adj']},
  // ...is adjective and adjective
  {verb: ['Copula'], object: ['Adj', 'And', 'Adj']},
  // ...is not adjective
  {verb: ['Copula'], object: ['Not', 'Adj']},
  // ...is adjective but adjective
  {verb: ['Copula'], object: ['Adj', 'But', 'Adj']},
  // ...is adjective but not adjective
  {verb: ['Copula'], object: ['Adj', 'But', 'Not', 'Adj']},
  // ...is verbing
  {verb: ['Copula'], object: ['Gerund']},
  // ...is the object
  {verb: ['Copula'], object: ['Article', 'Noun']},
  // ...is in the object (DISABLED)
  //{verb: ['Copula'], object: ['Prep', 'Article', 'Noun']},
  // ...is in the adjective object (DISABLED)
  //{verb: ['Copula'], object: ['Prep', 'Article', 'Adjective', 'Noun']},
  // ...is in my object (DISABLED)
  //{verb: ['Copula'], object: ['Prep', 'Possessive', 'Noun']},
  // ...is in my adjective object (DISABLED)
  //{verb: ['Copula'], object: ['Prep', 'Possessive', 'Adj', 'Noun']},
  // ...can verb
  {verb: ['Modal', 'Infinitive'], object: []},
  // ...can verb the object
  {verb: ['Modal', 'Infinitive'], object: ['Article', 'Noun']},
  // ...verbs adverbially (DISABLED)
  //{verb: ['Verb', 'Adverb'], object: []},
  // ...verbs the object
  {verb: ['Verb'], object: ['Article', 'Noun']},
  // ...verbs to the object
  //{verb: ['Verb'], object: ['Prep', 'Article', 'Noun']},
  // ...verbs the adjective object
  {verb: ['Verb'], object: ['Article', 'Adj', 'Noun']},
  // ...verbs objects
  {verb: ['Verb'], object: ['Plural']},
  // ...verbs adjective objects
  {verb: ['Verb'], object: ['Adj', 'Plural']},
  // ...verbs objects and objects
  {verb: ['Verb'], object: ['Plural', 'And', 'Plural']},
  // ...verbs the objects and objects
  {verb: ['Verb'], object: ['Det', 'Plural', 'And', 'Plural']},
  // ...verbs to objects and objects
  //{verb: ['Verb'], object: ['Prep', 'Plural', 'And', 'Plural']},
  // ...verbs Max
  {verb: ['Verb'], object: ['Person']},
  // ...verbs me
  {verb: ['Verb'], object: ['ObjPrn']}
  // ...verbs to me
  //{verb: ['Verb'], object: ['Prep', 'ObjPrn']}
];

var patterns = [];
for (var i = 0; i < subjectPatterns.length; i++){
  for (var j = 0; j < verbObjectPatterns.length; j++){
    var pattern = Object.assign({}, verbObjectPatterns[j]);
    pattern.subject = subjectPatterns[i];
    patterns.push(pattern);
  }
}

// known words

var knownWords = {
  // special "glue" words that constitute their own parts of speech for our purposes
  and: {tag: {And: true}},
  but: {tag: {But: true}},
  not: {tag: {Not: true}},
  yet: {tag: {But: true}},

  // determiners (more added below)
  the: {tag: {Det: true, Article: true}},
  a:   {tag: {Det: true, Article: true}, count: COUNT_SINGULAR, initial: INITIAL_CONSONANT},
  an:  {tag: {Det: true, Article: true}, count: COUNT_SINGULAR, initial: INITIAL_VOWEL},

  // copulas
  is:   {tag: {Copula: true}, count: COUNT_SINGULAR},
  was:  {tag: {Copula: true}, count: COUNT_SINGULAR, compatibleWithI: true},
  are:  {tag: {Copula: true}, count: COUNT_PLURAL},
  were: {tag: {Copula: true}, count: COUNT_PLURAL},
  am:   {tag: {Copula: true}, count: COUNT_I, compatibleWithI: true},

  // pronouns
  i:    {tag: {SubjPrn: true}, count: COUNT_I},
  he:   {tag: {SubjPrn: true}, count: COUNT_SINGULAR},
  she:  {tag: {SubjPrn: true}, count: COUNT_SINGULAR},
  we:   {tag: {SubjPrn: true}, count: COUNT_PLURAL},
  they: {tag: {SubjPrn: true}, count: COUNT_PLURAL},
  me:   {tag: {ObjPrn: true}, count: COUNT_SINGULAR},
  him:  {tag: {ObjPrn: true}, count: COUNT_SINGULAR},
  her:  {tag: {ObjPrn: true}, count: COUNT_SINGULAR},
  us:   {tag: {ObjPrn: true}, count: COUNT_PLURAL},
  them: {tag: {ObjPrn: true}, count: COUNT_PLURAL},
  it:   {tag: {SubjPrn: true, ObjPrn: true}, count: COUNT_SINGULAR},
  you:  {tag: {SubjPrn: true, ObjPrn: true}, count: COUNT_PLURAL},

  // others
  just:  {tag: {Adj: true}},
  kind:  {tag: {Adj: true}},
  like:  {tag: {Verb: true}, count: COUNT_PLURAL},
  made:  {tag: {Verb: true, PastTense: true}},
  own:   {tag: {Verb: true}, count: COUNT_PLURAL},
  thing: {tag: {Noun: true}, count: COUNT_SINGULAR}, // 'thing' is not a gerund for the love of god
  way:   {tag: {Noun: true}, count: COUNT_SINGULAR}
};

// more determiners
['this','that','another','each','every','no'].forEach(function(word){
  knownWords[word] = {tag: {Det: true}, count: COUNT_SINGULAR};
});
['these','those','all','both','few','many','most','other','several','some','such'].forEach(function(word){
  knownWords[word] = {tag: {Det: true}, count: COUNT_PLURAL};
});

var blacklisted = {
  also: true,
  always: true,
  anyone: true,
  be: true, // we basically never want this as our sentence's main verb
  been: true, // ditto
  else: true,
  here: true,
  maybe: true,
  more: true,
  much: true,
  never: true, // TODO use this for something (similar to 'not')
  over: true,
  really: true,
  same: true,
  so: true,
  then: true,
  there: true,
  very: true,
  which: true
};

// word classification

function shouldIgnore(word){
  return blacklisted[word.normal] ||
         isEmptyOrWhitespace(word.normal) ||
         word.text.indexOf('\'') !== -1 ||
         word.text.indexOf('’') !== -1 ||
         word.text.indexOf('—') !== -1;
}

var genericTagMappings = {
  JJ:  {tag: {Adj: true}},
  JJR: {tag: {Adj: true, Comparative: true}},
  JJS: {tag: {Adj: true, Superlative: true}},
  MD:  {tag: {Modal: true}},
  NN:  {tag: {Noun: true}, count: COUNT_SINGULAR},
  NNS: {tag: {Noun: true, Plural: true}, count: COUNT_PLURAL},
  VB:  {tag: {Verb: true}, count: COUNT_PLURAL},
  VBD: {tag: {Verb: true, PastTense: true}},
  VBG: {tag: {Gerund: true}},
  VBN: {tag: {PastParticiple: true}},
  VBP: {tag: {Verb: true}, count: COUNT_PLURAL},
  VBZ: {tag: {Verb: true}, count: COUNT_SINGULAR}
};

function classify(word){
  word.tag = {};
  if (shouldIgnore(word)){
    // never use explicitly blacklisted words
  }
  else if (knownWords[word.normal]){
    word = Object.assign(word, clone(knownWords[word.normal]));
  }
  else if (contains(['CC','DT','PDT','PP$','PRP'], word.initTag)){
    // If the word's initTag is "fully enumerated", all legal words for that tag should be known.
    // Thus, if we get here, it might be worth logging the word to see if we've missed any legal words.
  }
  else {
    if (word.lexTags && !contains(word.lexTags, word.initTag)){
      word.initTag = word.lexTags[0];
    }
    var info = genericTagMappings[word.initTag];
    if (info){
      word = Object.assign(word, clone(info));
    }
  }
  // specially label infinitive verb forms (so we can use them with modals)
  if (word.tag.Verb && word.count === COUNT_PLURAL){
    word.tag.Infinitive = true;
  }
  return word;
}

function taggedTokenToWord(taggedToken, index){
  var text = taggedToken[0];
  var normal = normalize(text);
  return {
    text: text,
    initTag: taggedToken[1],
    normal: normal,
    lexTags: lexicon[normal],
    index: index
  };
}

function wordify(text){
  var tokens = text.split(/\s+/g).filter(s => s && !isEmptyOrWhitespace(s));
  var tagger = new pos.Tagger();
  var taggedTokens = tagger.tag(tokens);
  var words = taggedTokens.map(taggedTokenToWord);
  words = words.map(classify);
  return words;
}

// pattern matching

function createMatcher(pattern){
  return {
    pattern: [pattern.subject, pattern.verb, pattern.object],
    state: STATE_SUBJ,
    patternIdx: 0,
    requiredCount: COUNT_ANY,
    requiredInitial: INITIAL_ANY,
    words: []
  };
}

function hasRequiredCount(word, requiredCount){
  if (requiredCount === COUNT_ANY || !word.count){
    return true;
  } else if (requiredCount === COUNT_I) {
    // 'I' takes 'am'/'was' for copula, plural forms otherwise
    return word.tag.Copula ? word.compatibleWithI : requiredCount === COUNT_PLURAL;
  } else {
    return requiredCount === word.count;
  }
}

function hasRequiredInitial(word, requiredInitial){
  if (requiredInitial === INITIAL_ANY || !requiredInitial){
    return true;
  } else {
    var initial = word.normal.substring(0,1);
    var actual = contains(['a','e','i','o','u'], initial) ? INITIAL_VOWEL : INITIAL_CONSONANT;
    return requiredInitial === actual;
  }
}

function shouldAccept(matcher, word){
  var targetTag = matcher.pattern[matcher.state][matcher.patternIdx];
  return word.tag[targetTag] &&
         hasRequiredCount(word, matcher.requiredCount) &&
         hasRequiredInitial(word, matcher.requiredInitial) &&
         Math.random() < 0.8;
}

function pushWord(matcher, word){
  if (matcher.state === STATE_DONE) return matcher; // don't push more words onto a finished match

  matcher.words.push(word);
  matcher.patternIdx += 1;
  matcher.requiredInitial = word.initial || INITIAL_ANY;
  if (word.count){
    matcher.requiredCount = word.count;
  }

  // maybe advance state
  if (matcher.patternIdx >= matcher.pattern[matcher.state].length){
    matcher.state += 1;
    matcher.patternIdx = 0;
    if (matcher.state === STATE_OBJ){
      matcher.requiredCount = COUNT_ANY;
    }
  }

  return matcher;
}

// tie it all together

function markSentence(words){
  var finishedMatchers = [];
  var openMatchers = patterns.map(createMatcher);
  for (var i = 0; i < words.length; i++){
    var word = words[i];
    var remaining = openMatchers;
    openMatchers = [];
    for (var j = 0; j < remaining.length; j++){
      var matcher = remaining[j];
      var pile = openMatchers;
      if (shouldAccept(matcher, word)){
        matcher = pushWord(matcher, word);
        if (matcher.state === STATE_DONE){
          pile = finishedMatchers;
        }
      }
      pile.push(matcher);
    }
    if (openMatchers.length === 0) break; // all matchers finished successfully!
  }
  var matches = finishedMatchers.map(m => m.words);
  var matchedWords = matches.length > 0 ? randNth(matches) : [];
  for (i = 0; i < matchedWords.length; i++){
    matchedWords[i].marked = true;
  }
  return words;
}

function logWord(word){
  var columns = [word.text,
                 word.initTag,
                 Object.keys(word.tag).join(','),
                 (word.lexTags || []).join(','),
                 word.count];
  console.log(columns.join(' | '));
}

function writePoemifiedText(node, words){
  var innerHTML = '';
  var prevWasBlackedOut = false;
  var blackoutColor = getComputedStyle(node).getPropertyValue('color');
  var blackoutPrefix = ' <span style="background:' + blackoutColor + '">';
  for (var j = 0; j < words.length; j++){
    var word = words[j];
    if (word.marked){
      if (prevWasBlackedOut){
        innerHTML = innerHTML + '</span> ' + word.text;
      } else {
        innerHTML = innerHTML + ' ' + word.text;
      }
      prevWasBlackedOut = false;
    } else {
      if (prevWasBlackedOut){
        innerHTML = innerHTML + ' ' + word.text;
      } else {
        innerHTML = innerHTML + blackoutPrefix + word.text;
      }
      prevWasBlackedOut = true;
    }
  }
  node.innerHTML = innerHTML;
}

function poemify(selector){
  var nodes = document.querySelectorAll(selector);
  for (var i = 0; i < nodes.length; i++){
    // parse the node's text into a series of words
    var node = nodes[i];
    if (isEmptyOrWhitespace(node.innerText)) continue; // bail out early if there isn't any text
    console.log(node.innerText);
    var words = wordify(node.innerText);

    // mark words to keep (i.e. not black out)
    var attempts = 0;
    while (attempts < 5){
      words = markSentence(words);
      var marked = words.filter(w => w.marked);
      if (marked.length > 0){
        console.log(marked.map(w => w.text).join(' '));
        marked.map(logWord);
        break;
      }
      attempts += 1;
    }

    // write text back into the node with most words blacked out
    writePoemifiedText(node, words);
  }
}

poemify('p, li, dd');
})();
