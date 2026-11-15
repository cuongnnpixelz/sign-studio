// Vietnamese / English Translation Engine
// Bridges input languages (Vietnamese and English)
// Provides normalized text and parallel semantic tokens for sign language parsing

const COMMON_TRANSLATIONS = {
  // Vietnamese -> English
  vi: {
    'hôm nay bạn thế nào': 'how are you today',
    'bạn thế nào': 'how are you',
    'tôi khỏe cảm ơn': 'i am fine thank you',
    'tôi khỏe cảm ơn bạn còn bạn': 'i am fine thank you and you',
    'rất tốt vì hôm nay là thứ sáu': 'very well because today is friday',
    'rất tốt': 'very well',
    'chúc bạn một ngày thứ sáu vui vẻ': 'i wish you a happy friday',
    'chúc bạn ngày thứ 6 vui vẻ': 'i wish you a happy friday',
    'xin chào': 'hello',
    'chào bạn': 'hello you',
    'bạn tên gì': 'what is your name',
    'bạn tên là gì': 'what is your name',
    'tên bạn là gì': 'what is your name',
    'tôi tên là': 'my name is',
    'rất vui được gặp bạn': 'nice to meet you',
    'cảm ơn bạn rất nhiều': 'thank you very much',
    'cảm ơn': 'thank you',
    'tạm biệt': 'goodbye',
    'làm ơn giúp tôi': 'please help me',
    'tôi yêu bạn': 'i love you',
    'bạn có hiểu không': 'do you understand',
    'tôi hiểu': 'i understand',
    'tôi không hiểu': 'i do not understand'
  },
};

// Word-level translation table for individual words
const WORD_TRANSLATIONS = {
  vi: {
    'chào': 'hello', 'xin chào': 'hello', 'chào bạn': 'hello you',
    'bạn': 'you', 'anh': 'you', 'chị': 'you', 'em': 'you', 'ông': 'you', 'bà': 'you',
    'tôi': 'i', 'mình': 'i', 'tớ': 'i', 'chúng tôi': 'we', 'chúng ta': 'we', 'họ': 'they',
    'tên': 'name', 'gì': 'what', 'cái gì': 'what', 'đâu': 'where', 'ở đâu': 'where',
    'sao': 'why', 'tại sao': 'why', 'ai': 'who', 'khi nào': 'when', 'bao giờ': 'when',
    'bao nhiêu': 'how much', 'thế nào': 'how', 'như thế nào': 'how',
    'cảm ơn': 'thank you', 'cám ơn': 'thank you', 'tạm biệt': 'goodbye', 'xin lỗi': 'sorry',
    'làm ơn': 'please', 'xin': 'please', 'chúc': 'wish', 'chào mừng': 'welcome',
    'vui': 'happy', 'vui vẻ': 'happy', 'hạnh phúc': 'happy', 'buồn': 'sad',
    'đẹp': 'nice', 'xinh': 'beautiful', 'tốt': 'good', 'khỏe': 'fine', 'ổn': 'fine',
    'xấu': 'bad', 'tệ': 'bad', 'mệt': 'tired', 'mệt mỏi': 'tired', 'ốm': 'sick', 'bệnh': 'sick',
    'nóng': 'hot', 'lạnh': 'cold', 'to': 'big', 'nhỏ': 'small', 'bé': 'small',
    'gặp': 'meet', 'giúp': 'help', 'giúp đỡ': 'help', 'yêu': 'love', 'thương': 'love',
    'thích': 'like', 'muốn': 'want', 'cần': 'need', 'học': 'learn', 'học sinh': 'student',
    'làm': 'work', 'làm việc': 'work', 'ngủ': 'sleep', 'đi ngủ': 'sleep',
    'ăn': 'eat', 'ăn cơm': 'eat food', 'uống': 'drink', 'uống nước': 'drink water',
    'đi': 'go', 'đến': 'come', 'tới nơi': 'come', 'về': 'come', 'chạy': 'run',
    'xem': 'see', 'nhìn': 'see', 'thấy': 'see', 'nghe': 'hear', 'nói': 'speak',
    'biết': 'know', 'không biết': 'dont know', 'hiểu': 'understand', 'không hiểu': 'do not understand',
    'nghĩ': 'think', 'suy nghĩ': 'think', 'nhớ': 'remember', 'quên': 'forget',
    'mua': 'buy', 'bán hàng': 'sell', 'cho': 'give', 'chờ': 'wait', 'đợi': 'wait', 'dừng': 'stop',
    'có': 'yes', 'đúng': 'yes', 'vâng': 'yes', 'không': 'no',
    'nước': 'water', 'cơm': 'food', 'thức ăn': 'food', 'đồ ăn': 'food', 'bánh mì': 'bread',
    'cà phê': 'coffee', 'trà': 'tea',
    'nhà': 'house', 'ngôi nhà': 'house', 'trường': 'school', 'trường học': 'school',
    'bệnh viện': 'hospital', 'sách': 'book', 'tiền': 'money', 'điện thoại': 'phone',
    'xe': 'car', 'thời gian': 'time', 'giờ': 'time', 'ngôn ngữ ký hiệu': 'sign language',
    'việt nam': 'vietnam', 'gia đình': 'family', 'bố': 'father', 'ba': 'father', 'cha': 'father',
    'mẹ': 'mother', 'má': 'mother', 'bạn bè': 'friend', 'anh em': 'brother', 'chị em': 'sister',
    'em bé': 'baby', 'bác sĩ': 'doctor', 'bác sỹ': 'doctor', 'thầy cô': 'teacher',
    'hôm nay': 'today', 'ngày mai': 'tomorrow', 'hôm qua': 'yesterday', 'bây giờ': 'now', 'thứ sáu': 'friday',
    'và': 'and', 'là': 'is', 'thì': 'then', 'mà': 'that', 'của': 'of', 'ở': 'at', 'với': 'with', 'cho': 'for',
    'rất': 'very', 'quá': 'very', 'lắm': 'very', 'nhiều': 'much', 'rất nhiều': 'very much'
  },
};

export function cleanText(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics for lookup
    .replace(/đ/g, 'd')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper to translate words in a phrase
 */
function translateWordSequence(cleanedSequence, srcLang) {
  const words = cleanedSequence.split(' ').filter(Boolean);
  const wordDict = Object.fromEntries(Object.entries(WORD_TRANSLATIONS[srcLang] || {}).map(([k, v]) => [cleanText(k), v]));
  const translated = [];
  for (let i = 0; i < words.length; i++) {
    const triple = `${words[i]} ${words[i + 1] || ''} ${words[i + 2] || ''}`.trim();
    const pair = `${words[i]} ${words[i + 1] || ''}`.trim();
    if (wordDict[triple]) {
      translated.push(wordDict[triple]);
      i += 2;
    } else if (wordDict[pair]) {
      translated.push(wordDict[pair]);
      i++;
    } else {
      translated.push(wordDict[words[i]] || words[i]);
    }
  }
  return translated;
}

/**
 * Translates speech text from source language into normalized English text for NLP glossing
 * @param {string} text - Raw input speech text
 * @param {string} srcLang - Source language code ('vi', 'en')
 * @returns {{ original: string, translated: string, normalizedTokens: string[] }}
 */
export function translateSpeech(text, srcLang = 'en') {
  if (!['vi', 'en'].includes(srcLang)) throw new Error('Chỉ hỗ trợ tiếng Việt và tiếng Anh.');
  if (!text || typeof text !== 'string') {
    return { original: '', translated: '', normalizedTokens: [] };
  }

  const raw = text.trim();
  const cleaned = cleanText(raw);

  // If already in English
  if (srcLang === 'en') {
    return {
      original: raw,
      translated: raw,
      normalizedTokens: cleaned.split(' ').filter(Boolean)
    };
  }

  // 1. Direct phrase lookup in translation table
  const langDict = COMMON_TRANSLATIONS[srcLang];
  if (langDict) {
    // Exact or prefix match
    for (const [key, translatedVal] of Object.entries(langDict).sort((a, b) => cleanText(b[0]).length - cleanText(a[0]).length)) {
      const cleanKey = cleanText(key);
      if (cleaned === cleanKey) {
        return {
          original: raw,
          translated: translatedVal,
          normalizedTokens: translatedVal.split(' ').filter(Boolean)
        };
      }
      if (cleaned.startsWith(cleanKey + ' ')) {
        const remainder = cleaned.slice(cleanKey.length).trim();
        const translatedRemainderWords = translateWordSequence(remainder, srcLang);
        const translatedRemainder = translatedRemainderWords.join(' ');
        const fullTranslation = translatedRemainder ? `${translatedVal} ${translatedRemainder}` : translatedVal;
        return {
          original: raw,
          translated: fullTranslation,
          normalizedTokens: fullTranslation.split(' ').filter(Boolean)
        };
      }
    }
  }

  // 2. Word-by-word fallback translation
  const translatedWords = translateWordSequence(cleaned, srcLang);
  const translatedText = translatedWords.join(' ');

  return {
    original: raw,
    translated: translatedText,
    normalizedTokens: translatedWords
  };
}
