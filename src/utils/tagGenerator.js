const DEFAULT_TAG_COUNT = 10;

const STOP_WORDS = new Set([
  '그리고',
  '그러나',
  '하지만',
  '그리고도',
  '또는',
  '있다',
  '있습니다',
  '있습니다만',
  '합니다',
  '입니다',
  '있는',
  '있는지',
  '하는',
  '한다',
  '한',
  '하기',
  '위해',
  '때문에',
  '때',
  '등',
  '그리고나서',
  '것',
  '이',
  '그',
  '그런',
  '대한',
  '에서',
  '으로',
  '에서의',
  '그리고는',
  '그리고나',
  '및',
  '또는',
  '그것',
  '저희',
  '우리',
  '당신',
  '입니다',
  '입니다만',
  '합니다',
  '되며',
  '됩니다',
  '것입니다',
  '때문',
  '하므로',
  '위해',
  '다른',
  '또한',
  '더',
  '많은',
  '많이',
  '매우',
  '매번',
  '여러',
  '그리고',
  '또',
  '그러므로',
  '그리고나서',
  '그렇다면',
  '때문에',
  '뿐',
  '뿐입니다',
  '수',
  '있을',
  '없다',
  '없으면',
  '없는',
  '없고',
  '없는지',
  '좋은',
  '좋을',
  '그리고요',
  '로',
  '에',
  '의',
  '가',
  '를',
  '을',
  '을까',
  '은',
  '는',
  '들',
  '에서',
  '에게',
  '및',
  '로서',
  '까지',
  '보다',
  '듯이',
  '그대로',
  '같다',
  '그런데',
  '그래서',
  '그리고서',
  '만약',
  '아래',
  '위',
  '안',
  '밖',
  '중',
  '나',
  '내가',
  '너',
  '요',
  '입니다',
  '있어',
  '또한',
  '그러나',
  'the',
  'for',
  'and',
  'that',
  'this',
  'with',
  'from',
  'your',
  'you',
  'have',
  'has',
  'they',
  'them',
  'were',
  'been',
  'they',
  'their',
  'there',
  'about',
  'than',
  'when',
  'while',
  'where',
  'which',
  'what',
  'will',
  'would',
  'could',
  'should',
  'were',
  'our',
  'not',
  'you',
  'we',
  'it',
  'that',
  'on',
  'in',
  'at',
  'as',
  'by',
  'to',
  'of',
  'or',
  'an',
  'a',
]);

const FALLBACK_TAGS = [
  '로봇',
  '인공지능',
  'AI',
  '로보틱스',
  '자동화',
  '협업로봇',
  'AMR',
  '예측유지보수',
  '산업자동화',
  '센서',
];

const stripHtml = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ');

const normalize = (value = '') =>
  String(value || '')
    .replace(/[^\w가-힣\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isStopWord = (value = '') => {
  const token = String(value || '').trim().toLowerCase();
  return STOP_WORDS.has(token);
};

const dedupeKey = (value = '') => {
  const normalized = String(value || '').trim();
  if (!/[가-힣]/.test(normalized)) {
    return normalized.toLowerCase().replace(/\s+/g, ' ');
  }
  return normalized.replace(/\s+/g, ' ');
};

const isValidCandidate = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (isStopWord(normalized)) return false;
  if (normalized.length < 2) return false;
  if (/^\d+$/.test(normalized)) return false;
  return true;
};

const getWeightedTokens = (text = '', baseWeight = 1, collector = new Map()) => {
  const plainText = normalize(stripHtml(text));
  const english = plainText
    .toLowerCase()
    .match(/[a-z]{2,}(?:-[a-z0-9]+)*/g);
  const korean = plainText.match(/[가-힣]{2,}/g);
  const words = [
    ...(english || []),
    ...(korean || []),
  ];

  for (const word of words) {
    if (!isValidCandidate(word)) continue;
    const key = dedupeKey(word);
    const prev = collector.get(key) || { score: 0, label: word };
    if (!prev.label) {
      prev.label = word;
    }
    prev.score += baseWeight;
    collector.set(key, prev);
  }

  const sequence = plainText.split(/\s+/).filter(Boolean);
  for (let i = 0; i < sequence.length - 1; i++) {
    const first = sequence[i];
    const second = sequence[i + 1];
    if (!isValidCandidate(first) || !isValidCandidate(second)) {
      continue;
    }
    const phrase = `${first} ${second}`;
    const key = dedupeKey(phrase);
    const prev = collector.get(key) || { score: 0, label: phrase };
    prev.score += baseWeight * 0.7;
    collector.set(key, prev);
  }

  return collector;
};

const getTextTags = (title = '', content = '') => {
  const candidates = new Map();
  getWeightedTokens(title, 2, candidates);
  getWeightedTokens(content, 1, candidates);

  const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let match;
  while ((match = headingRegex.exec(content))) {
    const heading = stripHtml(match[1]);
    getWeightedTokens(heading, 1.5, candidates);
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.label.length - a.label.length)
    .map((item) => item.label);
};

const toTagArray = (value = '') =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((tag) => isValidCandidate(tag))
    .filter((tag, index, list) => {
      const key = dedupeKey(tag);
      const isDuplicate = list.findIndex((candidate, candidateIndex) => candidateIndex < index && dedupeKey(candidate) === key) !== -1;
      return !isDuplicate;
    });

const generateAutoTags = ({
  title = '',
  content = '',
  providedTags = '',
  count = DEFAULT_TAG_COUNT,
} = {}) => {
  const finalTags = [];
  const seen = new Set();

  const source = [
    ...toTagArray(providedTags),
    ...getTextTags(title, content),
    ...FALLBACK_TAGS,
  ];

  for (const tag of source) {
    const key = dedupeKey(tag);
    if (seen.has(key) || !isValidCandidate(tag)) {
      continue;
    }
    seen.add(key);
    finalTags.push(tag);
    if (finalTags.length >= count) {
      break;
    }
  }

  return finalTags.join(',');
};

module.exports = {
  DEFAULT_TAG_COUNT,
  generateAutoTags,
};
