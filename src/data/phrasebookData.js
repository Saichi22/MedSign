// src/data/phrasebookData.js
// Shared sign data. Learn, Lesson, Dictionary and SignDetail screens read from here.
//
// Each entry:
//   id, fsl, english, tagalog, category
//   description : one or two plain sentences shown on the sign detail screen
//   related     : ids of related signs (shown as tappable chips)

const BASE_PHRASES = [
  // Pain & Discomfort
  { id: 'p01', fsl: 'MASAKIT', english: 'It hurts / I feel pain', tagalog: 'Masakit', category: 'Sakit',
    description: 'The general sign for pain. Use it first, then point to the body part that hurts.',
    related: ['p02', 'p04', 'p06', 'q01'] },
  { id: 'p02', fsl: 'NAPAKA-SAKIT', english: 'It hurts a lot', tagalog: 'Sobrang sakit', category: 'Sakit',
    description: 'Severe pain. Tell the doctor right away when pain is intense or getting worse.',
    related: ['p01', 'p03', 'p06'] },
  { id: 'p03', fsl: 'KONTING SAKIT', english: 'Slight pain', tagalog: 'Konti lang ang sakit', category: 'Sakit',
    description: 'Mild pain that is noticeable but bearable.',
    related: ['p01', 'p02', 'p05'] },
  { id: 'p04', fsl: 'HAPDI', english: 'Stinging / burning pain', tagalog: 'Hapdi', category: 'Sakit',
    description: 'A sharp, burning sting, like from a cut, a scrape, or a burn.',
    related: ['p01', 'p06', 's06'] },
  { id: 'p05', fsl: 'MABIGAT', english: 'Heavy / pressure feeling', tagalog: 'Mabigat ang pakiramdam', category: 'Sakit',
    description: 'A heavy or squeezing feeling, often described for the chest or head.',
    related: ['p01', 'b03', 'b01', 's01'] },
  { id: 'p06', fsl: 'TUMUTUSOK', english: 'Sharp stabbing pain', tagalog: 'Tinutusok', category: 'Sakit',
    description: 'Pain that feels like being poked or stabbed with something sharp.',
    related: ['p01', 'p02', 'p04'] },

  // Body Parts
  { id: 'b01', fsl: 'ULO', english: 'Head', tagalog: 'Ulo', category: 'Katawan',
    description: 'The head. Pair it with a pain or symptom sign, such as headache or dizziness.',
    related: ['b08', 'b07', 's02', 'p01'] },
  { id: 'b02', fsl: 'TIYAN', english: 'Stomach / abdomen', tagalog: 'Tiyan', category: 'Katawan',
    description: 'The stomach and belly area.',
    related: ['s03', 'p01', 'b03', 'b04'] },
  { id: 'b03', fsl: 'DIBDIB', english: 'Chest', tagalog: 'Dibdib', category: 'Katawan',
    description: 'The chest. Important for pain, pressure, and breathing problems.',
    related: ['s01', 'p05', 'b02', 'p01'] },
  { id: 'b04', fsl: 'LIKOD', english: 'Back', tagalog: 'Likod', category: 'Katawan',
    description: 'The back, from the shoulders down to the waist.',
    related: ['b07', 'b02', 'p01'] },
  { id: 'b05', fsl: 'BINTI', english: 'Leg', tagalog: 'Binti', category: 'Katawan',
    description: 'The leg, from hip to foot.',
    related: ['b06', 's07', 'p01'] },
  { id: 'b06', fsl: 'BRASO', english: 'Arm', tagalog: 'Braso', category: 'Katawan',
    description: 'The arm, from shoulder to hand.',
    related: ['b05', 'b07', 's07', 'p01'] },
  { id: 'b07', fsl: 'LEEG', english: 'Neck', tagalog: 'Leeg', category: 'Katawan',
    description: 'The neck, between the head and the shoulders.',
    related: ['b01', 'b04', 'b06', 'p01'] },
  { id: 'b08', fsl: 'MATA', english: 'Eye', tagalog: 'Mata', category: 'Katawan',
    description: 'The eye. Use it to talk about pain, redness, or trouble seeing.',
    related: ['b01', 'p04', 's07'] },

  // Symptoms
  { id: 's01', fsl: 'HIRAP HUMINGA', english: 'Difficulty breathing', tagalog: 'Hirap huminga', category: 'Sintomas',
    description: 'Trouble catching your breath. This can be urgent, so show it to staff quickly.',
    related: ['b03', 'p05', 's05', 'r05'] },
  { id: 's02', fsl: 'NAHIHILO', english: 'Dizziness / feeling faint', tagalog: 'Nahihilo', category: 'Sintomas',
    description: 'Feeling lightheaded, off balance, or like you might pass out.',
    related: ['b01', 's03', 's08', 'r05'] },
  { id: 's03', fsl: 'NADUDUWAL', english: 'Nausea', tagalog: 'Naduduwal', category: 'Sintomas',
    description: 'Feeling sick to the stomach, as if you might vomit.',
    related: ['b02', 's02', 's04'] },
  { id: 's04', fsl: 'LAGNAT', english: 'Fever', tagalog: 'May lagnat', category: 'Sintomas',
    description: 'A high body temperature, often with chills or sweating.',
    related: ['s08', 's05', 's03', 'q03'] },
  { id: 's05', fsl: 'UMUUBO', english: 'Coughing', tagalog: 'Umuubo', category: 'Sintomas',
    description: 'Coughing, dry or with phlegm.',
    related: ['s01', 's04', 'b03'] },
  { id: 's06', fsl: 'PAGDURUGO', english: 'Bleeding', tagalog: 'Pagdurugo', category: 'Sintomas',
    description: 'Blood coming from a wound or the body. Show the area to staff right away.',
    related: ['p04', 'r05', 'q01'] },
  { id: 's07', fsl: 'PAMAMAGA', english: 'Swelling', tagalog: 'Pamamaga', category: 'Sintomas',
    description: 'A part of the body that looks puffed up or larger than normal.',
    related: ['b05', 'b06', 'b08', 'p01'] },
  { id: 's08', fsl: 'NANLALAMIG', english: 'Feeling cold / chills', tagalog: 'Nanlalamig', category: 'Sintomas',
    description: 'Feeling cold or shivering, often together with a fever.',
    related: ['s04', 's02', 's05'] },

  // Doctor Questions
  { id: 'q01', fsl: 'SAAN MASAKIT?', english: 'Where does it hurt?', tagalog: 'Saan masakit?', category: 'Tanong',
    description: 'A doctor asks this to find the location of the pain. Answer by pointing to the body part.',
    related: ['p01', 'b01', 'b02', 'b03'] },
  { id: 'q02', fsl: 'KAILAN NAGSIMULA?', english: 'When did it start?', tagalog: 'Kailan nagsimula?', category: 'Tanong',
    description: 'Asks when the problem began: today, yesterday, or earlier.',
    related: ['q03', 'q01', 'p01'] },
  { id: 'q03', fsl: 'ILANG ARAW NA?', english: 'How many days now?', tagalog: 'Ilang araw na?', category: 'Tanong',
    description: 'Asks how many days you have had the symptom. Answer with number signs.',
    related: ['q02', 's04', 'p01'] },
  { id: 'q04', fsl: 'MAYROON ALLERGY?', english: 'Do you have allergies?', tagalog: 'May allergy ka ba?', category: 'Tanong',
    description: 'Asks about allergies to medicine, food, or other things.',
    related: ['q05', 'r01', 'r02'] },
  { id: 'q05', fsl: 'UMIINOM GAMOT?', english: 'Are you taking medicine?', tagalog: 'Umiinom ng gamot?', category: 'Tanong',
    description: 'Asks whether you currently take any medicine.',
    related: ['q04', 'r01', 'r02'] },

  // Responses
  { id: 'r01', fsl: 'OO', english: 'Yes', tagalog: 'Oo', category: 'Sagot',
    description: 'The answer yes.',
    related: ['r02', 'r03', 'q04'] },
  { id: 'r02', fsl: 'HINDI', english: 'No', tagalog: 'Hindi', category: 'Sagot',
    description: 'The answer no.',
    related: ['r01', 'r03', 'q04'] },
  { id: 'r03', fsl: 'HINDI AKO ALAM', english: "I don't know", tagalog: 'Hindi ko alam', category: 'Sagot',
    description: 'Use this when you are not sure of the answer.',
    related: ['r01', 'r02', 'r06'] },
  { id: 'r04', fsl: 'SALAMAT', english: 'Thank you', tagalog: 'Salamat', category: 'Sagot',
    description: 'Thanks someone for their help.',
    related: ['r05', 'r06'] },
  { id: 'r05', fsl: 'TULUNGAN AKO', english: 'Please help me', tagalog: 'Tulungan mo ako', category: 'Sagot',
    description: 'A request for help. Use it in any urgent moment.',
    related: ['s01', 's06', 'p02', 'r04'] },
  { id: 'r06', fsl: 'ULITIN', english: 'Please repeat that', tagalog: 'Ulitin mo', category: 'Sagot',
    description: 'Ask someone to sign or say it again when you did not understand.',
    related: ['r03', 'r04', 'r01'] },
];

// ─── Signs the detector model can recognize ──────────────────────────────────
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const letterId = (i) => `l${String(i + 1).padStart(2, '0')}`;
const alphaGroup = (ch) => (ch <= 'H' ? 'AlphaA' : ch <= 'R' ? 'AlphaB' : 'AlphaC');

const LETTER_PHRASES = ALPHABET.map((ch, i) => ({
  id: letterId(i),
  fsl: ch,
  english: `Letter ${ch}`,
  tagalog: `Letra ${ch}`,
  category: alphaGroup(ch),
  description: `The fingerspelled letter ${ch}. Spell names and words that have no sign of their own.`,
  related: [i - 1, i + 1].filter((n) => n >= 0 && n < 26).map(letterId),
}));

const NUMBER_WORDS = [
  ['Zero', 'Sero'], ['One', 'Isa'], ['Two', 'Dalawa'], ['Three', 'Tatlo'], ['Four', 'Apat'],
  ['Five', 'Lima'], ['Six', 'Anim'], ['Seven', 'Pito'], ['Eight', 'Walo'], ['Nine', 'Siyam'],
];
const numberId = (i) => `n${String(i).padStart(2, '0')}`;

const NUMBER_PHRASES = NUMBER_WORDS.map(([en, tl], i) => ({
  id: numberId(i),
  fsl: en.toUpperCase(),
  english: `Number ${i} (${en})`,
  tagalog: tl,
  category: 'Numero',
  description: `The number ${i}. Use numbers for days, doses, and pain levels.`,
  related: [i - 1, i + 1].filter((n) => n >= 0 && n < 10).map(numberId),
}));

const EXTRA_PHRASES = [
  // Everyday words
  { id: 'w01', fsl: 'FAMILY', english: 'Family', tagalog: 'Pamilya', category: 'Araw',
    description: 'Your family. Useful when a relative is with you or should be called.',
    related: ['w02', 'w06'] },
  { id: 'w02', fsl: 'HOME', english: 'Home', tagalog: 'Bahay', category: 'Araw',
    description: 'Home, where you live or where you want to go.',
    related: ['w01', 'w03'] },
  { id: 'w03', fsl: 'TIME', english: 'Time', tagalog: 'Oras', category: 'Araw',
    description: 'Time. Ask or tell when something started or happens.',
    related: ['q02', 'q03', 'w02'] },
  { id: 'w04', fsl: 'HUNGRY', english: 'Hungry', tagalog: 'Gutom', category: 'Araw',
    description: 'Feeling hungry or needing food.',
    related: ['b02', 's03'] },
  { id: 'w05', fsl: 'HELP', english: 'Help', tagalog: 'Tulong', category: 'Araw',
    description: 'Ask for help. Use it in any urgent moment.',
    related: ['r05', 's01', 's06'] },
  { id: 'w06', fsl: 'PRAY', english: 'Pray', tagalog: 'Magdasal', category: 'Araw',
    description: 'To pray. Some patients ask for a moment to pray or for a chaplain.',
    related: ['w01', 'w07'] },

  // Feelings & replies
  { id: 'w07', fsl: 'FINE', english: 'Fine', tagalog: 'Mabuti', category: 'Damdamin',
    description: 'I am fine, or feeling well.',
    related: ['w08', 'w09'] },
  { id: 'w08', fsl: 'OKAY', english: 'Okay', tagalog: 'Okay', category: 'Damdamin',
    description: 'Okay, all right, or agreeing to something.',
    related: ['w07', 'r01'] },
  { id: 'w09', fsl: 'SORRY', english: 'Sorry', tagalog: 'Pasensya na', category: 'Damdamin',
    description: 'An apology.',
    related: ['w08', 'r04'] },
  { id: 'w10', fsl: 'NO', english: 'No', tagalog: 'Hindi', category: 'Damdamin',
    description: 'The answer no, as the detector sees it. Same meaning as HINDI.',
    related: ['r02', 'r01'] },
  { id: 'w11', fsl: 'I LOVE YOU', english: 'I love you', tagalog: 'Mahal kita', category: 'Damdamin',
    description: 'A sign of affection.',
    related: ['w01', 'w12'] },
  { id: 'w12', fsl: 'I HATE YOU', english: 'I hate you', tagalog: 'Galit ako sa iyo', category: 'Damdamin',
    description: 'A sign of anger toward someone.',
    related: ['w11', 'w10'] },

  // More medical signs
  { id: 'm01', fsl: 'LALAMUNAN', english: 'Throat', tagalog: 'Lalamunan', category: 'Medikal',
    description: 'The throat. Pair it with pain or trouble swallowing.',
    related: ['p01', 's05', 'b07'] },
  { id: 'm02', fsl: 'MAHIRAP', english: 'Difficult / hard', tagalog: 'Mahirap', category: 'Medikal',
    description: 'Something is hard to do, such as breathing, moving, or swallowing.',
    related: ['s01', 'm01', 'm07'] },
  { id: 'm03', fsl: 'NAGSUSUKA', english: 'Vomiting', tagalog: 'Nagsusuka', category: 'Medikal',
    description: 'Throwing up.',
    related: ['s03', 'b02', 'm04'] },
  { id: 'm04', fsl: 'NAGTATAE', english: 'Diarrhea', tagalog: 'Nagtatae', category: 'Medikal',
    description: 'Loose or watery stools.',
    related: ['m03', 'b02', 's04'] },
  { id: 'm05', fsl: 'NAIIHI', english: 'Needs to urinate', tagalog: 'Naiihi', category: 'Medikal',
    description: 'Needing to use the toilet to pee.',
    related: ['m04', 'b02'] },
  { id: 'm06', fsl: 'NAMAMANAS', english: 'Swollen (edema)', tagalog: 'Namamanas', category: 'Medikal',
    description: 'Swelling from fluid, often in the legs, feet, or hands.',
    related: ['s07', 'b05', 'b06'] },
  { id: 'm07', fsl: 'NANGHIHINA', english: 'Feeling weak', tagalog: 'Nanghihina', category: 'Medikal',
    description: 'Feeling weak or without strength.',
    related: ['s02', 's08', 'm02'] },
];

export const PHRASES = [...BASE_PHRASES, ...EXTRA_PHRASES, ...LETTER_PHRASES, ...NUMBER_PHRASES];

// Lessons shown on the Learn screen (one per phrase category).
export const LESSON_GROUPS = [
  { key: 'Sakit',    title: 'Pain & Discomfort', subtitle: 'Describe how it hurts',      icon: 'emoticon-sad-outline',  tint: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.20)',  icon: '#DC2626' } },
  { key: 'Katawan',  title: 'Body Parts',        subtitle: 'Point out where it hurts',   icon: 'human',                 tint: { bg: 'rgba(10,155,170,0.08)', border: 'rgba(10,155,170,0.15)', icon: '#0A9BAA' } },
  { key: 'Sintomas', title: 'Symptoms',          subtitle: 'Fever, cough, dizziness…',   icon: 'medical-bag',           tint: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)', icon: '#D97706' } },
  { key: 'Tanong',   title: 'Doctor Questions',  subtitle: 'What a doctor will ask',     icon: 'help-circle-outline',   tint: { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.20)', icon: '#6366F1' } },
  { key: 'Sagot',    title: 'Responses',         subtitle: 'Yes, no, thanks, help',      icon: 'comment-check-outline', tint: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', icon: '#059669' } },

  // Detector-supported signs
  { key: 'Araw',     title: 'Everyday Words',     subtitle: 'Family, home, time, help',   icon: 'home-outline',           tint: { bg: 'rgba(14,165,233,0.10)', border: 'rgba(14,165,233,0.20)', icon: '#0284C7' } },
  { key: 'Damdamin', title: 'Feelings & Replies', subtitle: 'Fine, okay, sorry, no',      icon: 'emoticon-happy-outline', tint: { bg: 'rgba(236,72,153,0.10)', border: 'rgba(236,72,153,0.20)', icon: '#DB2777' } },
  { key: 'Medikal',  title: 'More Medical Signs', subtitle: 'Throat, vomiting, weakness', icon: 'stethoscope',            tint: { bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.18)',  icon: '#B91C1C' } },
  { key: 'Numero',   title: 'Numbers 0–9',        subtitle: 'Days, doses, pain levels',   icon: 'numeric',                tint: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)', icon: '#D97706' } },
  { key: 'AlphaA',   title: 'Alphabet A–H',       subtitle: 'Fingerspell names',          icon: 'alphabetical-variant',   tint: { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.20)', icon: '#6366F1' } },
  { key: 'AlphaB',   title: 'Alphabet I–R',       subtitle: 'Fingerspell names',          icon: 'alphabetical-variant',   tint: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', icon: '#059669' } },
  { key: 'AlphaC',   title: 'Alphabet S–Z',       subtitle: 'Fingerspell names',          icon: 'alphabetical-variant',   tint: { bg: 'rgba(10,155,170,0.08)', border: 'rgba(10,155,170,0.15)', icon: '#0A9BAA' } },
];

// ─── Detector label for each sign the camera model can recognize ─────────────
// Returns the exact class label from SIGN_LABELS (useSignDetector.ts), or null
// if the model can't recognize that sign yet (those are skipped in camera practice).
const DETECTOR_LABEL_BY_ID = {
  p01: 'MASAKIT', p06: 'TUMUTUSOK', s02: 'NAHIHILO',
  w01: 'Family', w02: 'Home', w03: 'Time', w04: 'Hungry', w05: 'Help', w06: 'Pray',
  w07: 'Fine', w08: 'Okay', w09: 'Sorry', w10: 'No', w11: 'I_love_you', w12: 'I_hate_you',
  m01: 'LALAMUNAN', m02: 'MAHIRAP', m03: 'NAGSUSUKA', m04: 'NAGTATAE',
  m05: 'NAIIHI', m06: 'NAMAMANAS', m07: 'NANGHIHINA',
};

export const detectorLabelFor = (phrase) => {
  if (!phrase) return null;
  if (DETECTOR_LABEL_BY_ID[phrase.id]) return DETECTOR_LABEL_BY_ID[phrase.id];
  if (phrase.category === 'Numero') return NUMBER_WORDS[parseInt(phrase.id.slice(1), 10)]?.[0] ?? null;
  if (phrase.id.startsWith('l')) return phrase.fsl; // letters: label is the letter itself
  return null;
};

export const phrasesForGroup = (key) => PHRASES.filter((p) => p.category === key);

export const phraseById = (id) => PHRASES.find((p) => p.id === id);

// Related signs for the detail screen. Uses the hand-picked `related` list,
// and falls back to other signs in the same category if none are set.
export const relatedPhrases = (phrase) => {
  if (!phrase) return [];
  const picked = (phrase.related || []).map(phraseById).filter(Boolean);
  if (picked.length > 0) return picked;
  return PHRASES.filter((p) => p.category === phrase.category && p.id !== phrase.id).slice(0, 4);
};