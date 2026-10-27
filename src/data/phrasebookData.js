// src/data/phrasebookData.js
// Shared phrase data. LearnScreen and LessonScreen read from here.
// (Optional later: make PhrasebookScreen import PHRASES from this file too,
// so there is only one copy to maintain.)

export const PHRASES = [
  // Pain & Discomfort
  { id: 'p01', fsl: 'MASAKIT',          english: 'It hurts / I feel pain',    tagalog: 'Masakit',                category: 'Sakit' },
  { id: 'p02', fsl: 'NAPAKA-SAKIT',     english: 'It hurts a lot',            tagalog: 'Sobrang sakit',          category: 'Sakit' },
  { id: 'p03', fsl: 'KONTING SAKIT',    english: 'Slight pain',               tagalog: 'Konti lang ang sakit',   category: 'Sakit' },
  { id: 'p04', fsl: 'HAPDI',            english: 'Stinging / burning pain',   tagalog: 'Hapdi',                  category: 'Sakit' },
  { id: 'p05', fsl: 'MABIGAT',          english: 'Heavy / pressure feeling',  tagalog: 'Mabigat ang pakiramdam', category: 'Sakit' },
  { id: 'p06', fsl: 'TINUTUSOK',        english: 'Sharp stabbing pain',       tagalog: 'Tinutusok',              category: 'Sakit' },

  // Body Parts
  { id: 'b01', fsl: 'ULO',              english: 'Head',                      tagalog: 'Ulo',                    category: 'Katawan' },
  { id: 'b02', fsl: 'TIYAN',            english: 'Stomach / abdomen',         tagalog: 'Tiyan',                  category: 'Katawan' },
  { id: 'b03', fsl: 'DIBDIB',           english: 'Chest',                     tagalog: 'Dibdib',                 category: 'Katawan' },
  { id: 'b04', fsl: 'LIKOD',            english: 'Back',                      tagalog: 'Likod',                  category: 'Katawan' },
  { id: 'b05', fsl: 'BINTI',            english: 'Leg',                       tagalog: 'Binti',                  category: 'Katawan' },
  { id: 'b06', fsl: 'BRASO',            english: 'Arm',                       tagalog: 'Braso',                  category: 'Katawan' },
  { id: 'b07', fsl: 'LEEG',             english: 'Neck',                      tagalog: 'Leeg',                   category: 'Katawan' },
  { id: 'b08', fsl: 'MATA',             english: 'Eye',                       tagalog: 'Mata',                   category: 'Katawan' },

  // Symptoms
  { id: 's01', fsl: 'HIRAP HUMINGA',    english: 'Difficulty breathing',      tagalog: 'Hirap huminga',          category: 'Sintomas' },
  { id: 's02', fsl: 'NAHIHILO',         english: 'Dizziness / feeling faint', tagalog: 'Nahihilo',               category: 'Sintomas' },
  { id: 's03', fsl: 'NADUDUWAL',        english: 'Nausea',                    tagalog: 'Naduduwal',              category: 'Sintomas' },
  { id: 's04', fsl: 'LAGNAT',           english: 'Fever',                     tagalog: 'May lagnat',             category: 'Sintomas' },
  { id: 's05', fsl: 'UMUUBO',           english: 'Coughing',                  tagalog: 'Umuubo',                 category: 'Sintomas' },
  { id: 's06', fsl: 'PAGDURUGO',        english: 'Bleeding',                  tagalog: 'Pagdurugo',              category: 'Sintomas' },
  { id: 's07', fsl: 'PAMAMAGA',         english: 'Swelling',                  tagalog: 'Pamamaga',               category: 'Sintomas' },
  { id: 's08', fsl: 'NANLALAMIG',       english: 'Feeling cold / chills',     tagalog: 'Nanlalamig',             category: 'Sintomas' },

  // Doctor Questions
  { id: 'q01', fsl: 'SAAN MASAKIT?',    english: 'Where does it hurt?',       tagalog: 'Saan masakit?',          category: 'Tanong' },
  { id: 'q02', fsl: 'KAILAN NAGSIMULA?',english: 'When did it start?',        tagalog: 'Kailan nagsimula?',      category: 'Tanong' },
  { id: 'q03', fsl: 'ILANG ARAW NA?',   english: 'How many days now?',        tagalog: 'Ilang araw na?',         category: 'Tanong' },
  { id: 'q04', fsl: 'MAYROON ALLERGY?', english: 'Do you have allergies?',    tagalog: 'May allergy ka ba?',     category: 'Tanong' },
  { id: 'q05', fsl: 'UMIINOM GAMOT?',   english: 'Are you taking medicine?',  tagalog: 'Umiinom ng gamot?',      category: 'Tanong' },

  // Responses
  { id: 'r01', fsl: 'OO',               english: 'Yes',                       tagalog: 'Oo',                     category: 'Sagot' },
  { id: 'r02', fsl: 'HINDI',            english: 'No',                        tagalog: 'Hindi',                  category: 'Sagot' },
  { id: 'r03', fsl: 'HINDI AKO ALAM',   english: "I don't know",              tagalog: 'Hindi ko alam',          category: 'Sagot' },
  { id: 'r04', fsl: 'SALAMAT',          english: 'Thank you',                 tagalog: 'Salamat',                category: 'Sagot' },
  { id: 'r05', fsl: 'TULUNGAN AKO',     english: 'Please help me',            tagalog: 'Tulungan mo ako',        category: 'Sagot' },
  { id: 'r06', fsl: 'ULITIN',           english: 'Please repeat that',        tagalog: 'Ulitin mo',              category: 'Sagot' },
];

// Lessons shown on the Learn screen (one per phrase category).
export const LESSON_GROUPS = [
  { key: 'Sakit',    title: 'Pain & Discomfort', subtitle: 'Describe how it hurts',      icon: 'emoticon-sad-outline',  tint: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.20)',  icon: '#DC2626' } },
  { key: 'Katawan',  title: 'Body Parts',        subtitle: 'Point out where it hurts',   icon: 'human',                 tint: { bg: 'rgba(10,155,170,0.08)', border: 'rgba(10,155,170,0.15)', icon: '#0A9BAA' } },
  { key: 'Sintomas', title: 'Symptoms',          subtitle: 'Fever, cough, dizziness…',   icon: 'medical-bag',           tint: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)', icon: '#D97706' } },
  { key: 'Tanong',   title: 'Doctor Questions',  subtitle: 'What a doctor will ask',     icon: 'help-circle-outline',   tint: { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.20)', icon: '#6366F1' } },
  { key: 'Sagot',    title: 'Responses',         subtitle: 'Yes, no, thanks, help',      icon: 'comment-check-outline', tint: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', icon: '#059669' } },
];

export const phrasesForGroup = (key) => PHRASES.filter((p) => p.category === key);
