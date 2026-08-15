export function normalizeVietnamese(value) {
  return String(value || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const DEFINITIONS = Object.freeze([
  { name: 'capabilities', phrases: ['ban lam duoc gi', 'nova lam duoc gi', 'co the giup gi', 'chuc nang cua nova', 'ky nang cua ban', 'giup duoc gi'] },
  { name: 'openComposer', phrases: ['mo khung dang bai', 'bat khung dang bai', 'toi muon dang bai', 'viet bai moi', 'tao bai viet moi', 'cho toi dang bai'] },
  { name: 'focusSearch', phrases: ['mo tim kiem', 'bat tim kiem', 'tim kiem giup toi', 'toi muon tim kiem', 'mo o tim kiem', 'tim thanh vien'] },
  { name: 'goMessages', phrases: ['di den tin nhan', 'mo tin nhan', 'vao tin nhan', 'mo tram lien lac', 'dua toi tin nhan', 'toi cho nhan tin'] },
  { name: 'goProfile', phrases: ['mo ho so', 'xem ho so', 'vao ho so', 'mo trang ca nhan', 'dua toi ho so', 'trang cua toi'] },
  { name: 'goCommunity', phrases: ['quay lai trang cong dong', 've trang cong dong', 'mo cong dong', 'vao trang chinh', 'quay lai trang chinh', 'dua toi cong dong'] },
  { name: 'postHelp', phrases: ['cach dang bai', 'dang bai nhu the nao', 'huong dan dang bai', 'lam sao de dang bai'] },
  { name: 'messageHelp', phrases: ['cach nhan tin', 'gui tin nhan the nao', 'huong dan nhan tin', 'cach gui anh'] },
  { name: 'profileHelp', phrases: ['sua ho so', 'doi anh dai dien', 'cap nhat trang ca nhan', 'chinh sua ho so'] },
  { name: 'privacy', phrases: ['quyen rieng tu', 'bao mat', 'ai co the xem', 'an bai viet', 'du lieu ca nhan'] },
  { name: 'friends', phrases: ['ket ban', 'tim ban be', 'gui loi moi ket ban', 'danh sach ban be'] },
  { name: 'statistics', phrases: ['xem thong ke', 'bao cao thong ke', 'so lieu quan tri'] },
  { name: 'moderation', phrases: ['kiem duyet bai', 'quan ly bai viet', 'quan ly nguoi dung'] },
  { name: 'greeting', phrases: ['xin chao', 'chao nova', 'hello nova', 'hello', 'hi nova'] },
  { name: 'thanks', phrases: ['cam on', 'cam on nova', 'thank you', 'thanks'] }
]);

function phraseScore(query, phrase) {
  if (query === phrase) return 1;
  if (query.includes(phrase)) return .94;
  const queryTokens = new Set(query.split(' '));
  const phraseTokens = phrase.split(' ');
  const overlap = phraseTokens.filter(token => queryTokens.has(token)).length;
  const coverage = overlap / phraseTokens.length;
  const precision = overlap / Math.max(queryTokens.size, 1);
  return coverage * .72 + precision * .28;
}

export class NovaIntentEngine {
  detect(message) {
    const normalized = normalizeVietnamese(message);
    if (!normalized) return { intent: 'unknown', confidence: 0, normalized };
    let best = { intent: 'unknown', confidence: 0, normalized };
    for (const definition of DEFINITIONS) {
      const confidence = Math.max(...definition.phrases.map(phrase => phraseScore(normalized, phrase)));
      if (confidence > best.confidence) best = { intent: definition.name, confidence, normalized };
    }
    if (best.confidence < .62) return { intent: 'unknown', confidence: best.confidence, normalized };
    return best;
  }

  getExamples() {
    return ['Mở khung đăng bài', 'Mở tìm kiếm', 'Đi đến tin nhắn', 'Mở hồ sơ', 'Quay lại cộng đồng', 'Hướng dẫn quyền riêng tư'];
  }
}

export const novaIntent = new NovaIntentEngine();

